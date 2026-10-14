<script setup lang="ts">
/**
 * 考试结果（W3-T1）。考生仅本人（后端 403 拦截）；管理员任意。
 * 结果区只展示结论性信息；逐题对错/解析/切屏记录在弹窗内查看。
 * v1.6：支持填空/简答展示；含简答题的答卷交卷后进 pending_review（客观题先行计分），
 *       显示「待阅卷」态，阅卷完成后总分 = 客观 + 主观。
 */
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import { ArrowLeft, CircleCheck, CircleClose, List, Clock } from '@element-plus/icons-vue';
import * as examsApi from '@/api/exams';
import * as recordsApi from '@/api/records';
import { useRequest } from '@/composables/useRequest';
import { useAuthStore } from '@/stores/auth';
import { useSettingsStore } from '@/stores/settings';
import { QUESTION_TYPE_LABELS } from '@/constants';
import { isAnswerCorrect } from '@/services/examRules';
import { formatDateTime } from '@/utils/datetime';
import { formatScore, optionLetter } from '@/utils/format';
import EmptyState from '@/components/common/EmptyState.vue';
import LoadingSkeleton from '@/components/common/LoadingSkeleton.vue';
import PageHeader from '@/components/common/PageHeader.vue';
import type { ExamRecord, PaperSnapshotQuestion, Question, QuestionType } from '@/types';

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();
const settingsStore = useSettingsStore();

const recordId = String(route.params.recordId ?? '');
const isAdmin = computed<boolean>(() => auth.currentUser?.role === 'admin');

const { data: exams } = useRequest(() => (isAdmin.value ? examsApi.list() : examsApi.my()));
const examMap = computed<Record<string, { id: string; name: string; passScore: number }>>(() =>
  Object.fromEntries((exams.value ?? []).map((e) => [e.id, { id: e.id, name: e.name, passScore: e.passScore }])),
);

const record = ref<ExamRecord | null>(null);
const loading = ref(true);
const detailVisible = ref(false);

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
const examineeName = computed<string>(() => record.value?.userName || auth.currentUser?.name || '—');

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

/** 明细弹窗筛选：全部 / 仅答错（题号始终沿用原始全局索引） */
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

function openDetail(): void {
  detailFilter.value = 'all';
  detailVisible.value = true;
}

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

function userAnswer(questionId: string): number[] | string[] {
  return record.value?.answers[questionId] ?? [];
}

/* ------------------------------ 展示辅助 ------------------------------ */

function isObjectiveType(type: QuestionType): boolean {
  return type === 'single' || type === 'multiple' || type === 'judge';
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

/** 客观题答案文案 */
function objectiveAnswerText(q: PaperSnapshotQuestion): string {
  const user = userAnswer(q.questionId) as number[];
  const correct = q.question.answer as number[];
  return `你的答案：${user.map((i) => optionLetter(i)).join('') || '未作答'} ／ 正确答案：${correct
    .map((i) => optionLetter(i))
    .join('')}`;
}

/** 填空逐空对比行 */
function fillRows(q: PaperSnapshotQuestion): Array<{ no: number; user: string; correct: string }> {
  const correct = q.question.answer as string[];
  const user = userAnswer(q.questionId) as string[];
  return correct.map((c, i) => ({ no: i + 1, user: user[i] ?? '', correct: c }));
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

onMounted(async () => {
  void settingsStore.load();
  try {
    const rec = await recordsApi.detail(recordId);
    if (rec.status === 'in_progress') {
      // 未交卷记录：考生返回答题页；管理员无答题入口，渲染提示态
      if (!isAdmin.value) {
        ElMessage.info('该考试尚未交卷，已为你返回答题页');
        void router.replace(`/exam/taking/${recordId}`);
        return;
      }
      record.value = rec;
      return;
    }
    record.value = rec;
  } catch {
    ElMessage.error('无法查看该成绩明细');
    back();
  } finally {
    loading.value = false;
  }
});
</script>

<template>
  <div class="score-detail">
    <PageHeader title="考试结果" :description="examName">
      <template #actions>
        <el-button :icon="ArrowLeft" @click="back">返回</el-button>
      </template>
    </PageHeader>

    <LoadingSkeleton v-if="loading" :rows="6" />

    <EmptyState v-else-if="!record" text="未找到该成绩记录" />

    <EmptyState v-else-if="inProgressByAdmin" text="该记录尚未交卷，暂无可查看的成绩" />

    <template v-else>
      <!-- 待阅卷提示 -->
      <el-alert
        v-if="isPendingReview"
        class="score-detail__pending"
        type="warning"
        :closable="false"
        show-icon
        title="答卷已提交，待人工阅卷"
        description="本卷含简答题，当前仅显示客观题（含填空）自动判分结果；待阅卷完成后公布最终成绩。"
      />

      <!-- 结果卡：一屏内看完的结论性信息 -->
      <el-card
        class="score-detail__result"
        shadow="never"
        :class="isPendingReview ? '' : passed ? 'score-detail__result--pass' : 'score-detail__result--fail'"
      >
        <div class="score-detail__hero">
          <div class="score-detail__score-block">
            <div class="score-detail__score-wrap">
              <div
                class="score-detail__score num"
                :class="isPendingReview ? '' : passed ? 'is-pass' : 'is-fail'"
              >
                {{ formatScore(record.score) }}
                <span class="score-detail__score-total">/ {{ formatScore(record.paperSnapshot.totalScore) }}</span>
              </div>
              <div class="score-detail__pass">
                <template v-if="isPendingReview">
                  <el-tag size="large" effect="dark" type="warning">
                    <el-icon class="score-detail__pass-icon"><Clock /></el-icon>待阅卷
                  </el-tag>
                  <span class="score-detail__pass-hint">当前为客观题得分</span>
                </template>
                <template v-else-if="passScore !== null">
                  <el-tag size="large" effect="dark" :type="passed ? 'success' : 'danger'">
                    {{ passed ? '合格' : '不合格' }}
                  </el-tag>
                  <span class="score-detail__pass-hint">及格线 {{ formatScore(passScore) }} 分</span>
                </template>
                <span v-else class="score-detail__pass-hint">未设置及格线</span>
              </div>
            </div>

            <div class="score-detail__stats">
              <div class="score-detail__stat">
                <span class="score-detail__stat-value num score-detail__stat-value--ok">{{ correctCount }}</span>
                <span class="score-detail__stat-label">答对</span>
              </div>
              <span class="score-detail__stat-sep" />
              <div class="score-detail__stat">
                <span class="score-detail__stat-value num score-detail__stat-value--bad">{{ wrongCount }}</span>
                <span class="score-detail__stat-label">答错</span>
              </div>
              <span class="score-detail__stat-sep" />
              <div class="score-detail__stat">
                <span class="score-detail__stat-value num">{{ accuracy }}%</span>
                <span class="score-detail__stat-label">正确率</span>
              </div>
            </div>
          </div>

          <el-button type="primary" size="large" :icon="List" @click="openDetail">
            查看成绩明细（{{ totalQuestions }} 题）
          </el-button>
        </div>

        <el-divider class="score-detail__divider" />

        <div class="score-detail__meta">
          <div class="score-detail__meta-item">
            <span class="score-detail__label">考试名称</span>
            <span class="score-detail__value" :title="examName">{{ examName }}</span>
          </div>
          <div class="score-detail__meta-item">
            <span class="score-detail__label">姓名</span>
            <span class="score-detail__value">{{ examineeName }}</span>
          </div>
          <div class="score-detail__meta-item">
            <span class="score-detail__label">科室</span>
            <span class="score-detail__value">{{ departmentName }}</span>
          </div>
          <div class="score-detail__meta-item">
            <span class="score-detail__label">交卷时间</span>
            <span class="score-detail__value-row">
              <span class="score-detail__value">{{ formatDateTime(record.submittedAt) }}</span>
              <el-tag v-if="record.autoSubmitted" size="small" type="warning" effect="plain">
                超时自动交卷
              </el-tag>
            </span>
          </div>
          <div class="score-detail__meta-item">
            <span class="score-detail__label">作答次数</span>
            <span class="score-detail__value">第 {{ record.attemptNo }} 次作答</span>
          </div>
          <div class="score-detail__meta-item">
            <span class="score-detail__label">试卷</span>
            <span class="score-detail__value" :title="record.paperSnapshot.paperName">
              {{ record.paperSnapshot.paperName }}
            </span>
          </div>
        </div>
      </el-card>

      <!-- 成绩明细弹窗 -->
      <el-dialog
        v-model="detailVisible"
        title="成绩明细"
        width="900px"
        top="6vh"
        destroy-on-close
        class="score-detail__dialog"
      >
        <div class="score-detail__dialog-body">
          <!-- 小结 + 筛选 -->
          <div class="score-detail__dialog-bar">
            <div class="score-detail__dialog-stats">
              <span class="score-detail__chip score-detail__chip--ok">
                <el-icon><CircleCheck /></el-icon>答对 {{ correctCount }}
              </span>
              <span class="score-detail__chip score-detail__chip--bad">
                <el-icon><CircleClose /></el-icon>答错 {{ wrongCount }}
              </span>
              <span class="score-detail__chip">正确率 {{ accuracy }}%</span>
            </div>
            <el-radio-group v-model="detailFilter" size="small">
              <el-radio-button value="all">全部</el-radio-button>
              <el-radio-button value="wrong">仅答错（{{ wrongCount }}）</el-radio-button>
            </el-radio-group>
          </div>

          <!-- 逐题明细 -->
          <el-card
            v-for="{ item, index } in detailQuestions"
            :key="item.questionId"
            class="score-detail__question"
            shadow="never"
            :class="{
              'score-detail__question--correct': qStatus(item) === 'correct',
              'score-detail__question--wrong': qStatus(item) === 'wrong',
              'score-detail__question--pending': qStatus(item) === 'pending' || qStatus(item) === 'scored',
            }"
          >
            <div class="score-detail__qhead">
              <span class="score-detail__qindex">第 {{ index + 1 }} 题</span>
              <el-tag size="small" effect="plain" :type="item.question.type === 'judge' ? 'warning' : 'primary'">
                {{ QUESTION_TYPE_LABELS[item.question.type as QuestionType] }}
              </el-tag>
              <el-tag size="small" type="info" effect="plain">{{ formatScore(item.score) }} 分</el-tag>

              <!-- 客观/填空：答对答错 -->
              <el-tag
                v-if="qStatus(item) === 'correct' || qStatus(item) === 'wrong'"
                size="small"
                effect="dark"
                :type="qStatus(item) === 'correct' ? 'success' : 'danger'"
              >
                <el-icon class="score-detail__qresult-icon">
                  <CircleCheck v-if="qStatus(item) === 'correct'" />
                  <CircleClose v-else />
                </el-icon>
                {{ qStatus(item) === 'correct' ? '答对' : '答错' }}
              </el-tag>
              <!-- 简答：待阅卷 / 已阅卷 -->
              <el-tag v-else-if="qStatus(item) === 'pending'" size="small" effect="dark" type="warning">
                待阅卷
              </el-tag>
              <el-tag v-else size="small" effect="dark" type="success">
                得分 {{ formatScore(subjectiveScore(item.questionId) ?? 0) }}
              </el-tag>
            </div>

            <p class="score-detail__stem">{{ item.question.stem }}</p>

            <!-- 客观题：选项 + 答案行 -->
            <template v-if="isObjectiveType(item.question.type)">
              <ul class="score-detail__options">
                <li
                  v-for="(option, optIndex) in item.question.options"
                  :key="optIndex"
                  class="score-detail__option"
                  :class="{
                    'score-detail__option--correct': (item.question.answer as number[]).includes(optIndex),
                    'score-detail__option--chosen': (userAnswer(item.questionId) as number[]).includes(optIndex),
                  }"
                >
                  <span class="score-detail__option-letter">{{ optionLetter(optIndex) }}</span>
                  <span class="score-detail__option-text">{{ option }}</span>
                  <el-tag
                    v-if="(item.question.answer as number[]).includes(optIndex)"
                    size="small"
                    type="success"
                    effect="plain"
                  >
                    正确答案
                  </el-tag>
                  <el-tag
                    v-if="(userAnswer(item.questionId) as number[]).includes(optIndex)"
                    size="small"
                    type="primary"
                    effect="plain"
                  >
                    你的选择
                  </el-tag>
                </li>
              </ul>

              <p class="score-detail__answer-line">{{ objectiveAnswerText(item) }}</p>
            </template>

            <!-- 填空：逐空对比 -->
            <template v-else-if="item.question.type === 'fill'">
              <ul class="score-detail__fills">
                <li v-for="row in fillRows(item)" :key="row.no" class="score-detail__fill">
                  <span class="score-detail__fill-no">第 {{ row.no }} 空</span>
                  <span class="score-detail__fill-cell score-detail__fill-cell--user">
                    {{ row.user || '未作答' }}
                  </span>
                  <span class="score-detail__fill-cell score-detail__fill-cell--correct">
                    {{ row.correct }}
                  </span>
                  <el-tag
                    :type="row.user.trim().toLowerCase() === row.correct.trim().toLowerCase() ? 'success' : 'danger'"
                    size="small"
                    effect="plain"
                  >
                    {{ row.user.trim().toLowerCase() === row.correct.trim().toLowerCase() ? '正确' : '错误' }}
                  </el-tag>
                </li>
              </ul>
            </template>

            <!-- 简答：你的答案 + 参考答案 + 得分 -->
            <template v-else>
              <div class="score-detail__short">
                <div class="score-detail__short-row">
                  <span class="score-detail__short-label">你的答案</span>
                  <!-- 富文本作答：内容已由服务端白名单净化（v1.7③ S1），此处渲染安全 -->
                  <div
                    v-if="shortUserText(item.questionId)"
                    class="score-detail__short-text rich-text"
                    v-html="shortUserText(item.questionId)"
                  />
                  <span v-else class="score-detail__short-text score-detail__short-text--empty">未作答</span>
                </div>
                <div class="score-detail__short-row score-detail__short-row--ref">
                  <span class="score-detail__short-label">参考答案</span>
                  <span class="score-detail__short-text">{{ shortReference(item) }}</span>
                </div>
                <div v-if="subjectiveScore(item.questionId) !== null" class="score-detail__short-row">
                  <span class="score-detail__short-label">阅卷得分</span>
                  <strong class="score-detail__short-score">
                    {{ formatScore(subjectiveScore(item.questionId)!) }} / {{ formatScore(item.score) }}
                  </strong>
                </div>
              </div>
            </template>

            <el-alert
              v-if="item.question.analysis"
              type="info"
              :closable="false"
              class="score-detail__analysis"
              title="解析"
              :description="item.question.analysis"
            />
          </el-card>

          <EmptyState v-if="detailQuestions.length === 0" text="全部答对，没有错题" />

          <!-- 切屏记录 -->
          <el-card class="score-detail__cheat table-card" shadow="never">
            <template #header>
              <span>切屏记录（{{ cheatCount }} 次 / 累计 {{ cheatTotalSeconds }} 秒）</span>
            </template>

            <el-alert
              v-if="cheatAbnormal && cheatCount > 0"
              class="score-detail__cheat-alert"
              type="error"
              :closable="false"
              title="检测到异常切屏行为"
            />

            <EmptyState v-if="cheatCount === 0" text="无异常切屏记录" />

            <el-table v-else :data="record.cheatEvents" stripe>
              <el-table-column label="发生时间" min-width="200">
                <template #default="{ row }">{{ formatDateTime(row.at) }}</template>
              </el-table-column>
              <el-table-column label="离开时长（秒）" width="160" align="center">
                <template #default="{ row }">{{ row.awaySeconds }}</template>
              </el-table-column>
            </el-table>
          </el-card>
        </div>

        <template #footer>
          <el-button @click="detailVisible = false">关闭</el-button>
        </template>
      </el-dialog>
    </template>
  </div>
</template>

<style scoped lang="scss">
@use '@/styles/variables.scss' as *;

.score-detail {
  &__pending {
    margin-bottom: 16px;
  }

  &__result {
    border-radius: $radius-lg;
    overflow: hidden;

    &--pass {
      background: linear-gradient(
        135deg,
        rgba($color-success, 0.06) 0%,
        rgba($color-primary, 0.03) 100%
      );
    }

    &--fail {
      background: linear-gradient(
        135deg,
        rgba($color-error, 0.06) 0%,
        rgba($color-primary, 0.03) 100%
      );
    }
  }

  &__hero {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 16px;
  }

  &__score-block {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 24px;
  }

  &__score-wrap {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  &__score {
    display: inline-flex;
    align-items: baseline;
    gap: 4px;
    font-size: 36px;
    font-weight: 700;
    line-height: 1.1;
    letter-spacing: -0.01em;
    color: $color-primary;

    &.is-pass {
      color: $color-success-text;
    }

    &.is-fail {
      color: $color-error-text;
    }
  }

  &__score-total {
    font-size: 15px;
    font-weight: 500;
    color: $text-secondary;
  }

  &__pass {
    display: inline-flex;
    align-items: center;
    gap: 8px;
  }

  &__pass-icon {
    margin-right: 4px;
    vertical-align: -2px;
  }

  &__pass-hint {
    font-size: 13px;
    color: $text-secondary;
  }

  // 答对 / 答错 / 正确率
  &__stats {
    display: flex;
    align-items: center;
    gap: 16px;
    padding: 10px 18px;
    border-radius: $radius-base;
    background: rgba(255, 255, 255, 0.72);
    border: 1px solid $border-color;
  }

  &__stat {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
    min-width: 52px;
  }

  &__stat-value {
    font-size: 20px;
    font-weight: 700;
    line-height: 1.2;
    color: $text-primary;

    &--ok {
      color: $color-success-text;
    }

    &--bad {
      color: $color-error-text;
    }
  }

  &__stat-label {
    font-size: 12px;
    color: $text-secondary;
  }

  &__stat-sep {
    width: 1px;
    height: 26px;
    background: $border-color;
  }

  &__divider {
    margin: 16px 0;
  }

  &__meta {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
    gap: 10px 16px;
  }

  &__meta-item {
    display: flex;
    flex-direction: column;
    gap: 5px;
    min-width: 0;
    padding: 10px 12px;
    border-radius: $radius-sm;
    background: rgba(255, 255, 255, 0.78);
    border: 1px solid $border-color;
  }

  &__label {
    font-size: 12px;
    color: $text-secondary;
  }

  &__value {
    min-width: 0;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
    font-size: 13.5px;
    font-weight: 500;
    color: $text-primary;
  }

  &__value-row {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
  }

  &__dialog-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 12px;
    margin-bottom: 14px;
    padding: 10px 12px;
    border-radius: $radius-base;
    background: $color-table-head;
    border: 1px solid $border-color;
  }

  &__dialog-stats {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 10px;
  }

  &__chip {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 3px 10px;
    border-radius: 999px;
    background: $bg-paper;
    border: 1px solid $border-color;
    font-size: 12.5px;
    color: $text-secondary;

    &--ok {
      color: $color-success-text;
      border-color: $color-success-border;
    }

    &--bad {
      color: $color-error-text;
      border-color: $color-error-border;
    }
  }

  &__qresult-icon {
    margin-right: 4px;
    vertical-align: -2px;
  }

  &__dialog-body {
    max-height: 72vh;
    overflow-y: auto;
    padding-right: 4px;
  }

  &__question {
    border-radius: $radius-base;
    margin-bottom: 12px;
    border-left: 4px solid transparent;

    &:last-child {
      margin-bottom: 12px;
    }

    &--correct {
      border-left-color: $color-success;
    }

    &--wrong {
      border-left-color: $color-error;
    }

    &--pending {
      border-left-color: $color-warning;
    }
  }

  &__qhead {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 8px;
    margin-bottom: 10px;
  }

  &__qindex {
    font-weight: 600;
    color: $text-primary;
  }

  &__stem {
    margin: 0 0 12px;
    font-size: 14px;
    line-height: 1.6;
    color: $text-primary;
  }

  &__options {
    margin: 0;
    padding: 0;
    list-style: none;
  }

  &__option {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 8px;
    border-radius: $radius-sm;
    font-size: 13px;
    color: $text-primary;

    &--correct {
      background: $color-success-bg;
    }

    &--chosen {
      outline: 1px dashed $color-primary;
    }

    &-letter {
      flex: 0 0 20px;
      text-align: center;
      font-weight: 600;
      color: $text-secondary;
    }

    &-text {
      flex: 1;
      min-width: 0;
    }
  }

  &__answer-line {
    margin: 12px 0 0;
    font-size: 13px;
    color: $text-secondary;
  }

  &__fills {
    margin: 0;
    padding: 0;
    list-style: none;
  }

  &__fill {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 8px;
    border-radius: $radius-sm;
    font-size: 13px;
    color: $text-primary;

    &-no {
      flex: 0 0 52px;
      font-weight: 600;
      color: $text-secondary;
    }

    &-cell {
      flex: 1;
      min-width: 0;
      padding: 6px 10px;
      border-radius: $radius-sm;
      border: 1px solid $border-color;
      word-break: break-word;

      &--correct {
        background: $color-success-bg;
      }
    }
  }

  &__short {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  &__short-row {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    font-size: 13px;

    &--ref {
      padding: 8px 10px;
      border-radius: $radius-sm;
      background: $color-primary-soft;
      border: 1px solid rgba($color-primary, 0.16);
    }
  }

  &__short-label {
    flex: 0 0 64px;
    font-weight: 600;
    color: $text-secondary;
  }

  &__short-text {
    flex: 1;
    min-width: 0;
    color: $text-primary;
    line-height: 1.6;
    word-break: break-word;

    &--empty {
      color: $text-disabled;
    }
  }

  &__short-score {
    color: $color-primary;
    font-size: 14px;
  }

  &__analysis {
    margin-top: 12px;
  }

  &__cheat {
    border-radius: $radius-lg;
  }

  &__cheat-alert {
    margin-bottom: 12px;
  }
}
</style>
