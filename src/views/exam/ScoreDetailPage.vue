<script setup lang="ts">
/**
 * 考试结果 / 成绩明细（W3-T1）。考生仅本人（后端 403 拦截）；管理员任意。
 *
 * v3.1 方向 C（设计稿 p-score-detail 重排）：
 * 由「结论卡 + 明细弹窗」改为**单页两栏**——左列「结果卡 + 切屏提示 + 逐题明细」，
 * 右列吸顶「答题概况 + 切屏记录」；逐题明细不再收进弹窗（设计稿即内联），
 * 解析默认折叠，由「展开全部解析」统一控制。
 * 结论卡去掉语义色渐变底（违反「层次靠线条、渐变只给品牌」），改白底 + 语义徽标。
 *
 * v1.6：支持填空/简答展示；含简答题的答卷交卷后进 pending_review（客观题先行计分），
 *       显示「待阅卷」态，阅卷完成后总分 = 客观 + 主观。
 */
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import dayjs from 'dayjs';
import { ElMessage } from 'element-plus';
import { ArrowLeft, CircleCheck, CircleClose, Clock, Refresh } from '@element-plus/icons-vue';
import * as examsApi from '@/api/exams';
import * as recordsApi from '@/api/records';
import QuestionFeedbackDialog from '@/views/practice/components/QuestionFeedbackDialog.vue';
import { useRequest } from '@/composables/useRequest';
import { useAuthStore } from '@/stores/auth';
import { useSettingsStore } from '@/stores/settings';
import { QUESTION_TYPE_LABELS } from '@/constants';
import { isAnswerCorrect } from '@/services/examRules';
import { formatDateTime } from '@/utils/datetime';
import { formatScore, optionLetter } from '@/utils/format';
import EmptyState from '@/components/common/EmptyState.vue';
import LoadingSkeleton from '@/components/common/LoadingSkeleton.vue';
import RequestError from '@/components/common/RequestError.vue';
import PageHeader from '@/components/common/PageHeader.vue';
import type { ExamRecord, PaperSnapshotQuestion, Question, QuestionType, ReviewNote } from '@/types';

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();
const settingsStore = useSettingsStore();

const recordId = computed(() => String(route.params.recordId ?? ''));
const isAdmin = computed<boolean>(() => auth.currentUser?.role === 'admin');

const feedbackVisible = ref(false);
const feedbackBusy = ref(false);
const feedbackTarget = ref({ questionId: '', source: 'exam' as const, sourceRefId: '', questionNumber: 0, stem: '' });
function reportQuestion(item: PaperSnapshotQuestion, questionNumber: number): void {
  if (isAdmin.value || feedbackBusy.value || feedbackVisible.value || !record.value) return;
  feedbackTarget.value = { questionId: item.questionId, source: 'exam', sourceRefId: recordId.value, questionNumber, stem: item.question.stem };
  feedbackVisible.value = true;
}
watch(recordId, () => { if (!feedbackBusy.value) feedbackVisible.value = false; });

const { data: exams } = useRequest(() => (isAdmin.value ? examsApi.list() : examsApi.my()));
const examMap = computed<Record<string, { id: string; name: string; passScore: number }>>(() =>
  Object.fromEntries((exams.value ?? []).map((e) => [e.id, { id: e.id, name: e.name, passScore: e.passScore }])),
);

const { data: record, loading, error: recordError, refresh: loadRecord } = useRequest<ExamRecord>(
  () => recordsApi.detail(recordId.value), [recordId], { keepPreviousData: false },
);

/** 考试名称：详情字段优先，兜底考试列表，再兜底试卷快照名 */
const examName = computed<string>(() => {
  if (!record.value) return '';
  return (
    record.value.examName ??
    examMap.value[record.value.examId]?.name ??
    record.value.paperSnapshot.paperName
  );
});

/** 姓名：详情字段优先，兜底当前登录用户 */
const examineeName = computed<string>(() => record.value?.userName || (!isAdmin.value ? auth.currentUser?.name : '') || '—');

/** 科室：以记录为准（管理员查看他人记录时尤其如此），仅本人无记录科室时回退登录用户 */
const departmentName = computed<string>(() => {
  const fromRecord = record.value?.departmentName?.trim();
  if (fromRecord) return fromRecord;
  if (!isAdmin.value) {
    const fromUser = auth.currentUser?.departmentName?.trim();
    if (fromUser) return fromUser;
  }
  return '未分配科室';
});

/** 及格线：详情字段优先，兜底考试列表 */
const passScore = computed<number | null>(() => {
  if (!record.value) return null;
  if (typeof record.value.passScore === 'number') return record.value.passScore;
  return examMap.value[record.value.examId]?.passScore ?? null;
});

/** 是否待阅卷（含主观题且尚未阅卷） */
const isPendingReview = computed<boolean>(() => record.value?.status === 'pending_review');

const passed = computed<boolean>(() => {
  if (!record.value || passScore.value === null || isPendingReview.value) return false;
  return record.value.score >= passScore.value;
});

/** 结论徽标（文案 + 色调） */
const resultBadge = computed<{ label: string; tone: 'ok' | 'err' | 'warn' | 'gray' }>(() => {
  if (isPendingReview.value) return { label: '待阅卷', tone: 'warn' };
  if (passScore.value === null) return { label: '及格线未知', tone: 'gray' };
  return passed.value ? { label: '及格', tone: 'ok' } : { label: '未及格', tone: 'err' };
});

/** 页头描述：考试名 · 交卷时间 */
const headerDesc = computed<string>(() => {
  if (!record.value) return '';
  const at = record.value.submittedAt ? ` · 交卷时间 ${formatDateTime(record.value.submittedAt)}` : '';
  return `${examName.value}${at}`;
});

const totalQuestions = computed<number>(() => record.value?.paperSnapshot.questions.length ?? 0);

/** 客观题（含填空）——可自动判分；简答题人工阅卷，不计入对错统计 */
const gradableQuestions = computed<PaperSnapshotQuestion[]>(() =>
  (record.value?.paperSnapshot.questions ?? []).filter((q) => q.question.type !== 'short'),
);

function questionCorrect(q: Question): boolean {
  return isAnswerCorrect(q, userAnswer(q.id));
}

/** 答对 / 答错题数与正确率（仅客观 + 填空；简答不计入） */
const correctCount = computed<number>(
  () => gradableQuestions.value.filter((q) => questionCorrect(q.question)).length,
);
const gradableCount = computed<number>(() => gradableQuestions.value.length);
const wrongCount = computed<number>(() => gradableCount.value - correctCount.value);
const accuracy = computed<number>(() =>
  gradableCount.value === 0 ? 0 : Math.round((correctCount.value / gradableCount.value) * 100),
);

/** 客观题得分（答对得满分）/ 满分 */
const objectiveTotal = computed<number>(() => gradableQuestions.value.reduce((s, q) => s + q.score, 0));
const objectiveScored = computed<number>(() =>
  gradableQuestions.value.filter((q) => questionCorrect(q.question)).reduce((s, q) => s + q.score, 0),
);

/** 主观题（简答）满分 / 已阅卷得分 */
const subjectiveQuestions = computed<PaperSnapshotQuestion[]>(() =>
  (record.value?.paperSnapshot.questions ?? []).filter((q) => q.question.type === 'short'),
);
const subjectiveTotal = computed<number>(() => subjectiveQuestions.value.reduce((s, q) => s + q.score, 0));
const subjectiveScored = computed<number>(() =>
  subjectiveQuestions.value.reduce((s, q) => s + (subjectiveScore(q.questionId) ?? 0), 0),
);
const questionScoreSum = computed(() => Math.round((objectiveScored.value + subjectiveScored.value) * 10) / 10);
const hasScoreAdjustment = computed(() => record.value?.status === 'submitted' && Math.abs(record.value.score - questionScoreSum.value) > 0.01);

/** 明细筛选：全部 / 仅答错（题号始终沿用原始全局索引） */
const detailFilter = ref<'all' | 'wrong'>('all');
const detailQuestions = computed<{ item: PaperSnapshotQuestion; index: number }[]>(() => {
  const questions = (record.value?.paperSnapshot.questions ?? []).map((item, index) => ({ item, index }));
  if (detailFilter.value === 'wrong') {
    return questions.filter(
      ({ item }) => item.question.type !== 'short' && !questionCorrect(item.question),
    );
  }
  return questions;
});

/** 解析统一展开开关（设计稿「展开全部解析」，默认折叠） */
const analysisOpen = ref(false);
watch(recordId, () => { detailFilter.value = 'all'; analysisOpen.value = false; });

/** 管理员查看到尚未交卷的记录：无答题入口，落到提示态 */
const inProgressByAdmin = computed<boolean>(
  () => isAdmin.value && record.value?.status === 'in_progress',
);

const cheatCount = computed<number>(() => record.value?.cheatEvents.length ?? 0);
const cheatTotalSeconds = computed<number>(() =>
  Math.round((record.value?.cheatEvents ?? []).reduce((sum, e) => sum + e.awaySeconds, 0)),
);
const cheatAbnormal = computed<boolean>(
  () =>
    cheatCount.value >= settingsStore.settings.cheatCountThreshold ||
    cheatTotalSeconds.value >= settingsStore.settings.cheatSecondsThreshold,
);
/** 切屏记录倒序（最近的在前） */
const cheatEventsDesc = computed(() => [...(record.value?.cheatEvents ?? [])].reverse());

function userAnswer(questionId: string): number[] | string[] {
  return record.value?.answers[questionId] ?? [];
}

/* ------------------------------ 展示辅助 ------------------------------ */

function isObjectiveType(type: QuestionType): boolean {
  return type === 'single' || type === 'multiple' || type === 'judge';
}

/** 选项 i 是否为该题正确答案（仅客观题） */
function isCorrectOption(item: PaperSnapshotQuestion, i: number): boolean {
  return isObjectiveType(item.question.type) && (item.question.answer as number[]).includes(i);
}

/** 选项 i 是否为考生选中但错误的选项（仅客观题） */
function isWrongPick(item: PaperSnapshotQuestion, i: number): boolean {
  if (!isObjectiveType(item.question.type)) return false;
  const picked = (userAnswer(item.questionId) as number[]).includes(i);
  return picked && !isCorrectOption(item, i);
}

type QStatus = 'correct' | 'wrong' | 'pending' | 'scored';

function qStatus(q: PaperSnapshotQuestion): QStatus {
  if (q.question.type === 'short') return isPendingReview.value ? 'pending' : 'scored';
  return questionCorrect(q.question) ? 'correct' : 'wrong';
}

/** 主观题阅卷得分（未阅卷返回 null） */
function subjectiveScore(questionId: string): number | null {
  const s = record.value?.subjectiveScores?.[questionId];
  return typeof s === 'number' ? s : null;
}

/**
 * 该题阅卷备注（评语 / 存疑）。
 * 注意：**服务端按角色过滤**——考生视角只返回「勾选同步给考生」的评语，存疑等内部标记被剔除，
 * 因此考试端 `reviewNote().doubtful` 永远为 undefined；管理员查看时才可见。
 */
function reviewNote(questionId: string): ReviewNote | undefined {
  return record.value?.reviewNotes?.[questionId];
}

/* --------------------------- 知识点掌握（纯前端聚合） --------------------------- */

/** tags 为空时的知识点归口 */
const UNLABELED_KNOWLEDGE = '未标注';
/** 主观题「得分」判定线：≥ 满分 × 0.6 记得分（口径说明见 masteryMark） */
const SUBJECTIVE_PASS_RATIO = 0.6;
/** 掌握率达标线：≥ 0.8 用主色，低于此档用 warning（图形档） */
const MASTERY_GOOD_RATE = 0.8;

/** 单题掌握标记：得分 / 未得分 / 未评 */
type MasteryMark = 'correct' | 'wrong' | 'unrated';

/**
 * 逐题「得分 / 未得分」判定（兼容全部题型）：
 * - 单选 / 多选 / 判断：走 isAnswerCorrect（多选排序后逐项相等，单选/判断单值相等）；
 * - 填空：走 isAnswerCorrect（逐空 trim + 忽略大小写，与后端 grading.ts 同口径）；
 * - 简答：以 subjectiveScores[questionId] ≥ 满分 × 0.6 记「得分」，否则「未得分」；
 *   无 subjectiveScores 记录（未阅卷）视为「未评」，不计入掌握率分母（单列说明）。
 */
function masteryMark(item: PaperSnapshotQuestion): MasteryMark {
  if (item.question.type === 'short') {
    const s = subjectiveScore(item.questionId);
    if (s === null) return 'unrated';
    return s >= item.score * SUBJECTIVE_PASS_RATIO ? 'correct' : 'wrong';
  }
  return questionCorrect(item.question) ? 'correct' : 'wrong';
}

interface KnowledgeStat {
  name: string;
  correct: number;
  total: number;
  rate: number;
}

/**
 * 知识点掌握聚合。
 * 口径：以题目 question.tags（知识点标签，v1.7② 起为多标签）为知识点维度——
 * tags 比 subject（科目）更细，能落到「安全生产法 / 隐患排查」这类知识点级别。
 * 多标签题目分别计入各自知识点（故各组题数之和可能大于总题数）；tags 为空归「未标注」。
 * 掌握率 = 该知识点下「得分」题数 / 已判定题数；「未评」题（未阅卷简答）不计入分母。
 */
const knowledgeStats = computed<KnowledgeStat[]>(() => {
  const map = new Map<string, { correct: number; total: number }>();
  for (const item of record.value?.paperSnapshot.questions ?? []) {
    const mark = masteryMark(item);
    if (mark === 'unrated') continue;
    const tags = (item.question.tags ?? []).map((t) => t.trim()).filter(Boolean);
    const points = tags.length > 0 ? tags : [UNLABELED_KNOWLEDGE];
    for (const name of points) {
      const cur = map.get(name) ?? { correct: 0, total: 0 };
      cur.total += 1;
      if (mark === 'correct') cur.correct += 1;
      map.set(name, cur);
    }
  }
  return [...map.entries()]
    .map(([name, s]) => ({
      name,
      correct: s.correct,
      total: s.total,
      rate: s.total === 0 ? 0 : s.correct / s.total,
    }))
    .sort((a, b) => b.rate - a.rate || a.name.localeCompare(b.name, 'zh'));
});

/** 未评题数（无阅卷记录的主观题），> 0 时在卡内说明 */
const knowledgeUnratedCount = computed<number>(
  () => (record.value?.paperSnapshot.questions ?? []).filter((q) => masteryMark(q) === 'unrated').length,
);

/** 掌握偏低（< 达标线）的知识点，用于「建议专项巩固」提示；「未标注」不参与建议 */
const weakKnowledge = computed<KnowledgeStat[]>(() =>
  knowledgeStats.value.filter((k) => k.rate < MASTERY_GOOD_RATE && k.name !== UNLABELED_KNOWLEDGE),
);

function masteryPercent(rate: number): number {
  return Math.round(rate * 100);
}

/** 掌握率档位（仅决定进度条图形色：主色 / warning，不承载文字色） */
function masteryTone(rate: number): 'ok' | 'warn' {
  return rate >= MASTERY_GOOD_RATE ? 'ok' : 'warn';
}

/** 选项字母串（如 A、C） */
function lettersOf(indexes: number[]): string {
  return indexes.map((i) => optionLetter(i)).join('、');
}

/** 选项文案串（如 A. xxx；B. yyy），越界索引跳过 */
function textsOf(q: PaperSnapshotQuestion, indexes: number[]): string {
  const options = q.question.options ?? [];
  return indexes
    .filter((i) => i >= 0 && i < options.length)
    .map((i) => `${optionLetter(i)}. ${options[i]}`)
    .join('；');
}

/** 填空逐空对比行 */
function fillRows(q: PaperSnapshotQuestion): Array<{ no: number; user: string; correct: string; ok: boolean }> {
  const correct = q.question.answer as string[];
  const user = userAnswer(q.questionId) as string[];
  return correct.map((c, i) => {
    const u = user[i] ?? '';
    return { no: i + 1, user: u, correct: c, ok: u.trim().toLowerCase() === c.trim().toLowerCase() };
  });
}

/** 简答：考生作答文本 */
function shortUserText(questionId: string): string {
  return (userAnswer(questionId) as string[])[0] ?? '';
}

/** 简答：参考答案文本 */
function shortReference(q: PaperSnapshotQuestion): string {
  return (q.question.answer as string[])[0] ?? '';
}

function back(): void {
  void router.push(isAdmin.value ? '/admin/scores' : '/exam/scores');
}

function goMyExams(): void {
  void router.push('/exam/my');
}

onMounted(() => { void settingsStore.load(); });
watch(record, (rec) => {
  if (!rec || (rec.status !== 'in_progress' && rec.submittedAt)) return;
  ElMessage.warning('该考试尚未交卷，暂不能查看成绩明细');
  record.value = null;
  void router.replace(isAdmin.value ? '/admin/scores' : '/exam/scores');
});
</script>

<template>
  <div data-ui-layout="result" data-ui-page="ScoreDetailPage" class="sd">
    <button type="button" class="sd__back" @click="back">
      <el-icon><ArrowLeft /></el-icon>
      返回{{ isAdmin ? '成绩报表' : '我的成绩' }}
    </button>

    <PageHeader title="成绩明细" :description="headerDesc">
      <template #actions>
        <el-button v-if="!isAdmin" :icon="Refresh" @click="goMyExams">再考一次</el-button>
      </template>
    </PageHeader>

    <LoadingSkeleton v-if="loading" :rows="6" />
    <RequestError v-else-if="recordError" text="无法加载成绩明细，请确认访问权限或重试" @retry="loadRecord" />

    <EmptyState v-else-if="!record" text="未找到该成绩记录" />

    <EmptyState v-else-if="inProgressByAdmin" text="该记录尚未交卷，暂无可查看的成绩" />

    <div v-else class="sd__wrap">
      <div class="sd__main">
        <!-- 待阅卷提示 -->
        <div v-if="isPendingReview" class="sd__tip">
          <el-icon class="sd__tip-icon"><Clock /></el-icon>
          <div>
            本卷含简答题，当前仅显示客观题（含填空）自动判分结果；<b>待阅卷完成后</b>公布最终成绩。
          </div>
        </div>

        <!-- 结果卡 -->
        <el-card class="sd__result" shadow="never">
          <div class="sd__hero">
            <div class="sd__hero-left">
              <div class="sd__hero-label">
                <span class="sd__kicker">考试结果</span>
                <span class="sd__bdg" :class="`sd__bdg--${resultBadge.tone}`">{{ resultBadge.label }}</span>
                <span v-if="record.autoSubmitted" class="sd__bdg sd__bdg--warn">超时自动交卷</span>
              </div>
              <div class="sd__hero-score">
                <span class="sd__score" :class="isPendingReview || passScore === null ? '' : passed ? 'is-pass' : 'is-fail'">
                  {{ formatScore(record.score) }}
                </span>
                <span class="sd__score-total">/ {{ formatScore(record.paperSnapshot.totalScore) }} 分</span>
                <span v-if="passScore !== null" class="sd__passline">及格线 {{ formatScore(passScore) }} 分</span>
              </div>
              <div class="sd__hero-meta">
                {{ examineeName }} · {{ departmentName }} · 交卷时间 {{ formatDateTime(record.submittedAt) }}
              </div>
            </div>

            <div class="sd__hero-side">
              <div>
                <span class="sd__kicker">客观题</span>
                <span class="sd__num">{{ objectiveScored }} / {{ objectiveTotal }}</span>
              </div>
              <div>
                <span class="sd__kicker">主观题</span>
                <span class="sd__num">{{ isPendingReview ? '待阅卷' : `${subjectiveScored} / ${subjectiveTotal}` }}</span>
              </div>
              <div>
                <span class="sd__kicker">作答次数</span>
                <span class="sd__num">第 {{ record.attemptNo }} 次</span>
              </div>
              <div>
                <span class="sd__kicker">试卷</span>
                <span class="sd__num sd__num--ellipsis" :title="record.paperSnapshot.paperName">
                  {{ record.paperSnapshot.paperName }}
                </span>
              </div>
            </div>
          </div>
        </el-card>

        <el-alert v-if="hasScoreAdjustment" type="info" :closable="false" show-icon :title="`记录总分 ${formatScore(record.score)} 分；逐题得分合计 ${formatScore(questionScoreSum)} 分。总分以成绩记录为准。`" />

        <!-- 切屏异常提示 -->
        <div v-if="cheatCount > 0" class="sd__tip" :class="{ 'sd__tip--err': cheatAbnormal }">
          <el-icon class="sd__tip-icon"><CircleClose /></el-icon>
          <div>
            <b>检测到异常切屏行为：</b>本场考试累计离开页面 <b>{{ cheatTotalSeconds }} 秒</b>（{{ cheatCount }} 次），{{
              cheatAbnormal ? '已超过阈值，记录已留存，管理员可发起切屏审查。' : '未超过阈值，不影响成绩。'
            }}
          </div>
        </div>

        <!-- 逐题明细 -->
        <el-card class="sd__detail" shadow="never">
          <template #header>
            <h3 class="sd__card-title">逐题明细</h3>
            <span class="sd__sub">共 {{ totalQuestions }} 题 · 客观题（含填空）答对 {{ correctCount }} / {{ gradableCount }} 题</span>
            <div class="sd__seg">
              <button
                type="button"
                :class="{ 'is-on': detailFilter === 'all' }"
                @click="detailFilter = 'all'"
              >
                全部
              </button>
              <button
                type="button"
                :class="{ 'is-on': detailFilter === 'wrong' }"
                @click="detailFilter = 'wrong'"
              >
                仅答错 {{ wrongCount }}
              </button>
            </div>
            <el-button size="small" class="sd__expand" @click="analysisOpen = !analysisOpen">
              {{ analysisOpen ? '收起全部解析' : '展开全部解析' }}
            </el-button>
          </template>

          <div class="sd__qlist">
            <article
              v-for="{ item, index } in detailQuestions"
              :key="item.questionId"
              class="sd__q"
            >
              <div class="sd__q-head">
                <span class="sd__q-no">{{ index + 1 }}</span>
                <span class="sd__q-type">{{ QUESTION_TYPE_LABELS[item.question.type as QuestionType] }}</span>
                <span class="sd__q-score">{{ formatScore(item.score) }} 分</span>
                <span
                  v-if="qStatus(item) === 'correct' || qStatus(item) === 'wrong'"
                  class="sd__bdg sd__bdg--q"
                  :class="qStatus(item) === 'correct' ? 'sd__bdg--ok' : 'sd__bdg--err'"
                >
                  {{ qStatus(item) === 'correct' ? `答对 · ${formatScore(item.score)} 分` : '答错 · 0 分' }}
                </span>
                <span v-else-if="qStatus(item) === 'pending'" class="sd__bdg sd__bdg--warn">待阅卷</span>
                <span v-else class="sd__bdg sd__bdg--ok">
                  得分 {{ formatScore(subjectiveScore(item.questionId) ?? 0) }} / {{ formatScore(item.score) }}
                </span>
                <el-button v-if="!isAdmin" link type="primary" size="small" :disabled="feedbackBusy || feedbackVisible" @click="reportQuestion(item, index + 1)">题目纠错</el-button>
                <!-- 存疑为阅卷内部标记，仅管理员可见（考生视角接口已过滤掉该字段） -->
                <span
                  v-if="isAdmin && reviewNote(item.questionId)?.doubtful"
                  class="sd__bdg sd__bdg--warn"
                >
                  阅卷存疑
                </span>
              </div>

              <p class="sd__q-stem">{{ item.question.stem }}</p>

              <!-- 选择题选项列表：标出正确答案与考生错选 -->
              <ul
                v-if="isObjectiveType(item.question.type) && item.question.options.length"
                class="sd__opts"
              >
                <li
                  v-for="(opt, i) in item.question.options"
                  :key="i"
                  class="sd__opt"
                  :class="{ 'is-ok': isCorrectOption(item, i), 'is-bad': isWrongPick(item, i) }"
                >
                  <span class="sd__opt-kk">{{ optionLetter(i) }}</span>
                  <span class="sd__opt-tx">{{ opt }}</span>
                  <span v-if="isCorrectOption(item, i)" class="sd__opt-tag sd__opt-tag--ok">正确答案</span>
                  <span v-else-if="isWrongPick(item, i)" class="sd__opt-tag sd__opt-tag--bad">{{ isAdmin ? '考生选择' : '你的选择' }}</span>
                </li>
              </ul>

              <!-- 客观题：你的答案 / 正确答案 -->
              <template v-if="isObjectiveType(item.question.type)">
                <div class="sd__ans-grid">
                  <div>
                    <span class="sd__kicker">{{ isAdmin ? '考生答案' : '你的答案' }}</span>
                    <div class="sd__ans" :class="qStatus(item) === 'correct' ? 'is-ok' : 'is-err'">
                      <span class="sd__ans-letters">
                        {{ lettersOf(userAnswer(item.questionId) as number[]) || '未作答' }}
                      </span>
                      <span class="sd__ans-texts">
                        {{ textsOf(item, userAnswer(item.questionId) as number[]) || '—' }}
                      </span>
                    </div>
                  </div>
                  <div>
                    <span class="sd__kicker">正确答案</span>
                    <div class="sd__ans is-ok">
                      <span class="sd__ans-letters">{{ lettersOf(item.question.answer as number[]) }}</span>
                      <span class="sd__ans-texts">{{ textsOf(item, item.question.answer as number[]) }}</span>
                    </div>
                  </div>
                </div>
              </template>

              <!-- 填空：逐空对比 -->
              <template v-else-if="item.question.type === 'fill'">
                <ul class="sd__fills">
                  <li v-for="row in fillRows(item)" :key="row.no" class="sd__fill">
                    <span class="sd__fill-no">第 {{ row.no }} 空</span>
                    <span class="sd__fill-cell">{{ row.user || '未作答' }}</span>
                    <span class="sd__fill-cell sd__fill-cell--correct">{{ row.correct }}</span>
                    <span class="sd__bdg" :class="row.ok ? 'sd__bdg--ok' : 'sd__bdg--err'">
                      {{ row.ok ? '正确' : '错误' }}
                    </span>
                  </li>
                </ul>
              </template>

              <!-- 简答：你的作答 + 参考答案 + 阅卷得分 -->
              <template v-else>
                <div class="sd__short">
                  <div class="sd__short-row">
                    <span class="sd__kicker">{{ isAdmin ? '考生作答' : '你的作答' }}</span>
                    <!-- 富文本作答：内容已由服务端白名单净化（v1.7③ S1），此处渲染安全 -->
                    <div
                      v-if="shortUserText(item.questionId)"
                      class="sd__short-text rich-text"
                      v-html="shortUserText(item.questionId)"
                    />
                    <span v-else class="sd__short-text sd__short-text--empty">未作答</span>
                  </div>
                  <div class="sd__short-row">
                    <span class="sd__kicker">参考答案</span>
                    <span class="sd__short-text">{{ shortReference(item) }}</span>
                  </div>
                  <div v-if="subjectiveScore(item.questionId) !== null" class="sd__short-row">
                    <span class="sd__kicker">阅卷得分</span>
                    <strong class="sd__short-score">
                      {{ formatScore(subjectiveScore(item.questionId)!) }} / {{ formatScore(item.score) }}
                    </strong>
                  </div>
                  <!-- 阅卷评语（考生可见的评语由服务端按「是否勾选同步」过滤后下发） -->
                  <div v-if="reviewNote(item.questionId)?.comment" class="sd__short-row">
                    <span class="sd__kicker">阅卷评语</span>
                    <span class="sd__short-text sd__short-text--comment">
                      {{ reviewNote(item.questionId)?.comment }}
                    </span>
                  </div>
                </div>
              </template>

              <div v-if="analysisOpen && item.question.analysis" class="sd__analysis">
                <el-icon class="sd__analysis-icon"><CircleCheck /></el-icon>
                <div><b>解析：</b>{{ item.question.analysis }}</div>
              </div>
            </article>
          </div>

          <EmptyState v-if="detailQuestions.length === 0" :text="detailFilter === 'wrong' ? '当前答卷没有答错的客观题（含填空）' : '该答卷暂无题目明细'" />
        </el-card>
      </div>

      <!-- 右列：答题概况 + 切屏记录 -->
      <aside class="sd__aside">
        <el-card class="sd__side-card" shadow="never">
          <template #header>
            <h3 class="sd__card-title">答题概况</h3>
          </template>
          <div class="sd__kv">
            <span class="sd__kv-k">总题数</span>
            <span class="sd__kv-v">{{ totalQuestions }} 题</span>
          </div>
          <div class="sd__kv">
            <span class="sd__kv-k">答对</span>
            <span class="sd__kv-v is-ok">{{ correctCount }} 题</span>
          </div>
          <div class="sd__kv">
            <span class="sd__kv-k">答错</span>
            <span class="sd__kv-v is-err">{{ wrongCount }} 题</span>
          </div>
          <div class="sd__kv">
            <span class="sd__kv-k">主观题</span>
            <span class="sd__kv-v">{{ subjectiveQuestions.length }} 题</span>
          </div>
          <div class="sd__kv">
            <span class="sd__kv-k">客观题正确率</span>
            <span class="sd__kv-v">{{ gradableCount ? accuracy + '%' : '—' }}</span>
          </div>
          <p class="admin-hint">对错与正确率仅统计客观题（含填空），简答题按阅卷得分展示。</p>
        </el-card>

        <el-card class="sd__side-card" shadow="never">
          <template #header>
            <h3 class="sd__card-title">切屏记录</h3>
            <span class="sd__bdg" :class="cheatAbnormal ? 'sd__bdg--err' : 'sd__bdg--gray'">
              {{ cheatCount }} 次
            </span>
          </template>

          <EmptyState v-if="cheatCount === 0" text="无异常切屏记录" :image-size="42" />

          <div v-else class="sd__timeline">
            <div
              v-for="(event, i) in cheatEventsDesc"
              :key="i"
              class="sd__tl"
              :class="event.awaySeconds >= 15 ? 'is-err' : 'is-on'"
            >
              <div class="sd__tl-t">离开页面 {{ event.awaySeconds }} 秒</div>
              <div class="sd__tl-d">发生时间 {{ dayjs(event.at).format('MM-DD HH:mm:ss') }}</div>
            </div>
          </div>

          <div v-if="cheatCount > 0" class="sd__tip sd__tip--inline" :class="{ 'sd__tip--err': cheatAbnormal }">
            累计 <b>{{ cheatTotalSeconds }} 秒</b>，{{ cheatAbnormal ? '已超过阈值' : '未超过阈值，不影响成绩' }}。
          </div>
        </el-card>

        <el-card class="sd__side-card" shadow="never">
          <template #header>
            <h3 class="sd__card-title">知识点掌握</h3>
          </template>

          <EmptyState v-if="knowledgeStats.length === 0" text="暂无知识点数据" :image-size="42" />

          <div v-else class="sd__kbar">
            <div v-for="k in knowledgeStats" :key="k.name" class="sd__kbar-item">
              <div class="sd__kbar-head">
                <span class="sd__kbar-name" :title="k.name">{{ k.name }}</span>
                <span class="sd__kbar-val">{{ masteryPercent(k.rate) }}%</span>
              </div>
              <div class="sd__kbar-track">
                <i
                  class="sd__kbar-fill"
                  :class="`is-${masteryTone(k.rate)}`"
                  :style="{ width: `${masteryPercent(k.rate)}%` }"
                />
              </div>
              <div class="sd__kbar-sub">得分 {{ k.correct }} / 共 {{ k.total }} 题</div>
            </div>
          </div>

          <!-- 数据缺口：未阅卷主观题无 subjectiveScores 记录，无法判定得分，未计入掌握率 -->
          <div v-if="knowledgeUnratedCount > 0" class="sd__tip sd__tip--inline">
            本卷含 <b>{{ knowledgeUnratedCount }}</b> 道主观题尚未阅卷，暂无得分记录，未计入上述掌握率。
          </div>
          <div v-else-if="weakKnowledge.length > 0" class="sd__tip sd__tip--inline">
            「{{ weakKnowledge.map((k) => k.name).join('」「') }}」掌握偏低，建议到练题端专项巩固。
          </div>
        </el-card>
      </aside>
    </div>
    <QuestionFeedbackDialog v-model:visible="feedbackVisible" v-bind="feedbackTarget" @busy="feedbackBusy = $event" />
  </div>
</template>

<style scoped lang="scss">
@use '@/styles/variables.scss' as *;

.sd {
  container: score-detail / inline-size;
  &__back {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    margin-bottom: 9px;
    padding: 0;
    border: none;
    background: none;
    font-size: 12.5px;
    color: $text-secondary;
    cursor: pointer;

    &:hover {
      color: $color-primary;
    }
  }

  &__wrap {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 300px;
    align-items: start;
    gap: 20px;
  }

  &__main {
    display: flex;
    flex-direction: column;
    gap: 12px;
    min-width: 0;
  }

  &__aside {
    display: flex;
    flex-direction: column;
    gap: 12px;
    position: sticky;
    top: 66px;
  }

  &__card-title {
    margin: 0;
    font-size: 13.5px;
    font-weight: 620;
    color: $text-primary;
  }

  &__sub {
    font-size: 12px;
    color: $text-secondary;
  }

  /* 提示条 */
  &__tip {
    display: flex;
    gap: 9px;
    padding: 10px 12px;
    border-radius: $radius-sm;
    background: $color-warning-bg;
    font-size: 12px;
    line-height: 1.55;
    color: $color-warning-text;

    b {
      font-weight: 650;
    }

    &--err {
      background: $color-error-bg;
      color: $color-error-text;
    }

    &--inline {
      margin-top: 12px;
    }
  }

  &__tip-icon {
    margin-top: 2px;
    flex: 0 0 auto;
  }

  /* 结果卡 */
  &__result {
    :deep(.el-card__body) {
      padding: 18px;
    }
  }

  &__hero {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 16px;
    flex-wrap: wrap;
  }

  &__hero-left {
    min-width: 0;
  }

  &__hero-label {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
  }

  &__hero-score {
    display: flex;
    align-items: flex-end;
    gap: 10px;
    margin-top: 8px;
  }

  &__score {
    font-size: 38px;
    font-weight: 700;
    line-height: 1;
    letter-spacing: -0.02em;
    color: $color-primary;
    font-variant-numeric: tabular-nums;

    &.is-pass {
      color: $color-success-text;
    }

    &.is-fail {
      color: $color-error-text;
    }
  }

  &__score-total {
    padding-bottom: 5px;
    font-size: 13px;
    color: $text-secondary;
  }

  &__passline {
    padding-bottom: 6px;
    font-size: 12px;
    color: $text-secondary;
  }

  &__hero-meta {
    margin-top: 8px;
    font-size: 12px;
    color: $text-secondary;
  }

  &__hero-side {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
    width: 240px;
  }

  &__num {
    display: block;
    margin-top: 4px;
    font-size: 13px;
    font-weight: 640;
    color: $text-primary;
    font-variant-numeric: tabular-nums;

    &--ellipsis {
      overflow: hidden;
      white-space: nowrap;
      text-overflow: ellipsis;
    }
  }

  /* 微标签 */
  &__kicker {
    display: block;
    font-size: 12px;
    font-weight: 600;
    letter-spacing: 0.11em;
    text-transform: uppercase;
    color: $text-secondary;
  }

  /* 状态徽标（设计稿 .bdg） */
  &__bdg {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    height: 20px;
    padding: 0 7px;
    border-radius: 5px;
    font-size: 12px;
    font-weight: 580;
    white-space: nowrap;

    &::before {
      content: '';
      flex: 0 0 5px;
      width: 5px;
      height: 5px;
      border-radius: 50%;
      background: currentColor;
    }

    &--q::before {
      display: none;
    }

    &--gray {
      background: $color-neutral-bg;
      color: $text-secondary;
    }

    &--ok {
      background: $color-success-bg;
      color: $color-success-text;
    }

    &--warn {
      background: $color-warning-bg;
      color: $color-warning-text;
    }

    &--err {
      background: $color-error-bg;
      color: $color-error-text;
    }
  }

  /* 分段控件（设计稿 .seg） */
  &__seg {
    display: inline-flex;
    gap: 2px;
    margin-left: auto;
    padding: 2px;
    border-radius: $radius-sm;
    background: $color-neutral-bg;

    button {
      height: 24px;
      padding: 0 10px;
      border: none;
      border-radius: $radius-xs;
      background: none;
      font-size: 12px;
      font-weight: 550;
      color: $text-secondary;
      cursor: pointer;

      &.is-on {
        background: $bg-paper;
        color: $text-primary;
        /* 方向 C：层次交给发丝线，不用投影（DESIGN-C §2.1） */
        box-shadow: inset 0 0 0 1px $line-strong;
      }
    }
  }

  &__expand {
    margin-left: 8px;
  }

  /* 逐题明细 */
  &__qlist {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  &__q {
    padding: 14px;
    border: 1px solid $border-color;
    border-radius: $radius-base;
    background: $bg-paper;
  }

  &__q-head {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
    margin-bottom: 8px;
  }

  &__q-no {
    display: inline-grid;
    place-items: center;
    width: 22px;
    height: 22px;
    border-radius: $radius-sm;
    background: $color-primary;
    font-size: 12px;
    font-weight: 700;
    color: #fff;
    font-variant-numeric: tabular-nums;
  }

  &__q-type {
    display: inline-flex;
    align-items: center;
    height: 19px;
    padding: 0 6px;
    border-radius: $radius-xs;
    background: $color-neutral-bg;
    font-size: 12px;
    font-weight: 550;
    color: $text-secondary;
  }

  &__q-score {
    font-size: 12px;
    color: $text-secondary;
  }

  &__q-head .sd__bdg {
    margin-left: auto;
  }

  &__q-stem {
    overflow-wrap: anywhere;
    white-space: pre-wrap;
    margin: 0;
    font-size: 13px;
    font-weight: 520;
    line-height: 1.7;
    color: $text-primary;
  }

  // 选项列表（设计稿 .opt / .opt.is-ok / .opt.is-bad）
  &__opts {
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin: 10px 0 0;
    padding: 0;
  }

  &__opt {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 12px;
    border: 1px solid $border-color;
    border-radius: $radius-sm;
    font-size: 12.5px;
    color: $text-body;

    &.is-ok {
      border-color: $color-success;
      background: $color-success-bg;

      .sd__opt-kk {
        border-color: $color-success;
        background: $color-success;
        color: #fff;
      }

      .sd__opt-tx {
        color: $color-success-text;
      }
    }

    &.is-bad {
      border-color: $color-error;
      background: $color-error-bg;

      .sd__opt-kk {
        border-color: $color-error;
        background: $color-error;
        color: #fff;
      }

      .sd__opt-tx {
        color: $color-error-text;
      }
    }
  }

  &__opt-kk {
    width: 20px;
    height: 20px;
    flex: 0 0 20px;
    display: grid;
    place-items: center;
    border-radius: 50%;
    border: 1.5px solid $line-strong;
    font-size: 12px;
    font-weight: 600;
    color: $text-secondary;
  }

  &__opt-tx {
    flex: 1;
    min-width: 0;
    line-height: 1.6;
  }

  &__opt-tag {
    flex: 0 0 auto;
    font-size: 12px;
    font-weight: 560;

    &--ok {
      color: $color-success-text;
    }

    &--bad {
      color: $color-error-text;
    }
  }

  /* 你的答案 / 正确答案 */
  &__ans-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12px;
    margin-top: 12px;
  }

  &__ans {
    margin-top: 4px;
    padding: 9px 11px;
    border: 1px solid $border-color;
    border-radius: $radius-xs;
    background: $color-neutral-bg;

    &.is-ok {
      background: $color-success-bg;
      border-color: $color-success-border;
    }

    &.is-err {
      background: $color-error-bg;
      border-color: $color-error-border;
    }
  }

  &__ans-letters {
    display: block;
    font-size: 13px;
    font-weight: 640;
    color: $text-primary;
  }

  &__ans-texts {
    display: block;
    margin-top: 2px;
    font-size: 12px;
    line-height: 1.6;
    color: $text-secondary;
    word-break: break-word;
  }

  /* 填空逐空对比 */
  &__fills {
    margin: 12px 0 0;
    padding: 0;
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  &__fill {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 12.5px;
  }

  &__fill-no {
    flex: 0 0 52px;
    font-weight: 600;
    color: $text-secondary;
  }

  &__fill-cell {
    flex: 1;
    min-width: 0;
    padding: 6px 10px;
    border: 1px solid $border-color;
    border-radius: $radius-xs;
    color: $text-primary;
    word-break: break-word;

    &--correct {
      background: $color-success-bg;
      border-color: $color-success-border;
    }
  }

  /* 简答 */
  &__short {
    display: flex;
    flex-direction: column;
    gap: 10px;
    margin-top: 12px;
  }

  &__short-row {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  &__short-text {
    padding: 10px 12px;
    border: 1px solid $border-color;
    border-left: 2px solid $color-primary;
    border-radius: $radius-xs;
    background: $bg-paper;
    font-size: 12.5px;
    line-height: 1.75;
    color: $text-primary;
    word-break: break-word;

    &--empty {
      border-left-color: $border-color;
      color: $text-secondary;
    }

    /* 阅卷评语：info 三件套（底 + 描边 + 深字档），区别于考生作答/参考答案 */
    &--comment {
      border-left-color: $color-info;
      background: $color-info-bg;
      color: $color-info-text;
    }
  }

  &__short-score {
    font-size: 13px;
    color: $color-primary;
  }

  /* 解析 */
  &__analysis {
    display: flex;
    gap: 9px;
    margin-top: 12px;
    padding: 10px 12px;
    border-radius: $radius-sm;
    background: $color-info-bg;
    font-size: 12px;
    line-height: 1.6;
    color: $color-info-text;

    b {
      font-weight: 650;
    }
  }

  &__analysis-icon {
    margin-top: 2px;
    flex: 0 0 auto;
  }

  /* 右侧概况 kv */
  &__kv {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 8px 0;
    border-bottom: 1px dashed $border-color;
    font-size: 12.5px;

    &:last-child {
      border-bottom: none;
    }
  }

  &__kv-k {
    color: $text-secondary;
  }

  &__kv-v {
    font-weight: 580;
    color: $text-primary;
    font-variant-numeric: tabular-nums;

    &.is-ok {
      color: $color-success-text;
    }

    &.is-err {
      color: $color-error-text;
    }
  }

  &__side-card {
    :deep(.el-card__header) {
      justify-content: space-between;
    }
  }

  /* 切屏时间线（设计稿 .timeline / .tl） */
  &__timeline {
    position: relative;
    padding-left: 20px;

    &::before {
      content: '';
      position: absolute;
      left: 5px;
      top: 5px;
      bottom: 5px;
      width: 1.5px;
      background: $line-strong;
    }
  }

  &__tl {
    position: relative;
    padding-bottom: 14px;

    &:last-child {
      padding-bottom: 0;
    }

    &::before {
      content: '';
      position: absolute;
      left: -20px;
      top: 3px;
      width: 9px;
      height: 9px;
      border-radius: 50%;
      background: $bg-paper;
      border: 2px solid $line-strong;
    }

    &.is-on::before {
      background: $color-primary;
      border-color: $color-primary;
    }

    &.is-err::before {
      background: $color-error;
      border-color: $color-error;
    }
  }

  &__tl-t {
    font-size: 12.5px;
    font-weight: 580;
    color: $text-primary;
  }

  &__tl-d {
    margin-top: 2px;
    font-size: 12px;
    color: $text-secondary;
  }

  /* 知识点掌握（设计稿 .bars / .bar-row / .bar-track） */
  &__kbar {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  &__kbar-item {
    display: flex;
    flex-direction: column;
    gap: 5px;
  }

  &__kbar-head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 10px;
  }

  &__kbar-name {
    min-width: 0;
    overflow-wrap: anywhere;
    font-size: 12.5px;
    color: $text-body;
  }

  &__kbar-val {
    flex: 0 0 auto;
    font-size: 12.5px;
    font-weight: 620;
    color: $text-primary;
    font-variant-numeric: tabular-nums;
  }

  &__kbar-track {
    height: 6px;
    border-radius: $radius-xs;
    background: $color-neutral-bg;
    overflow: hidden;
  }

  &__kbar-fill {
    display: block;
    height: 100%;
    border-radius: $radius-xs;

    /* 语义色仅作图形（进度条填充），不承载文字色（DESIGN-C §2.5） */
    &.is-ok {
      background: $color-primary;
    }

    &.is-warn {
      background: $color-warning;
    }
  }

  &__kbar-sub {
    font-size: 12px;
    color: $text-secondary;
    font-variant-numeric: tabular-nums;
  }

  @container score-detail (max-width: 980px) {
    &__wrap {
      grid-template-columns: minmax(0, 1fr);
    }

    &__aside {
      position: static;
    }

    &__hero-side {
      width: 100%;
    }

    &__ans-grid {
      grid-template-columns: minmax(0, 1fr);
    }
  }

  @media (max-width: 900px) {
    &__back {
      min-height: 44px;
      margin-bottom: 4px;
      font-size: 13px;
    }

    &__result {
      :deep(.el-card__body) {
        padding: 14px;
      }
    }

    &__hero {
      display: grid;
      grid-template-columns: minmax(0, 1fr);
      gap: 16px;
    }

    &__hero-score {
      align-items: baseline;
      gap: 6px;
      flex-wrap: wrap;
    }

    &__score {
      font-size: 34px;
    }

    &__score-total,
    &__passline {
      padding-bottom: 0;
    }

    &__passline {
      flex-basis: 100%;
    }

    &__hero-meta {
      line-height: 1.6;
      overflow-wrap: anywhere;
    }

    &__hero-side {
      width: auto;
      gap: 0;
      border-top: 1px solid $border-color;

      > div {
        min-width: 0;
        padding: 12px 8px 4px 0;

        &:nth-child(even) {
          padding-left: 12px;
          border-left: 1px solid $border-color;
        }
      }
    }

    &__detail {
      :deep(.el-card__header) {
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto;
        align-items: center;
        gap: 8px;
        padding: 12px;
      }

      :deep(.el-card__body) {
        padding: 12px;
      }

      .sd__card-title {
        grid-column: 1;
        white-space: nowrap;
      }

      .sd__sub {
        grid-column: 1;
      }
    }

    &__seg {
      grid-column: 2;
      grid-row: 1 / span 2;
      margin-left: 0;

      button {
        min-height: 44px;
        padding: 0 8px;
      }
    }

    &__expand {
      grid-column: 1 / -1;
      width: 100%;
      margin-left: 0;
    }

    &__q {
      padding: 12px;
    }

    &__q-head .sd__bdg {
      margin-left: 0;
    }

    &__q-head :deep(.el-button) {
      margin-left: auto;
    }

    &__fill {
      align-items: stretch;
      flex-wrap: wrap;
    }

    &__fill-no {
      flex-basis: 100%;
    }

    &__aside {
      gap: 10px;
    }

    &__side-card {
      :deep(.el-card__header),
      :deep(.el-card__body) {
        padding: 12px;
      }
    }
  }

  @media (max-width: 380px) {
    &__detail {
      :deep(.el-card__header) {
        grid-template-columns: minmax(0, 1fr);
      }
    }

    &__seg {
      grid-column: 1;
      grid-row: auto;
      width: 100%;

      button {
        flex: 1;
      }
    }
  }
}
</style>
