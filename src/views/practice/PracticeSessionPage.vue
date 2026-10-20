<script setup lang="ts">
/**
 * 练题作答页（单题聚焦 + 即时反馈 + 小结）· PC / 移动端 · 微信内置浏览器兼容。
 *
 * 流程：生成会话（顺序/随机/题量/题型 或 错题复习）→ 按 id 批量取题（不含答案）→
 * 逐题作答 → 提交单题即时判分看解析 → 重做/下一题 → 结束展示小结。
 *
 * 复用考试组件 `QuestionCard`（**不改其内部**）；不使用 CountdownTimer/VisibilityGuard/AnswerSheet。
 * 视觉：冷静蓝 · 商务风（细边框卡片、吸底实色操作栏、无渐变 / 无 emoji 装饰）。
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import { onBeforeRouteLeave, useRoute, useRouter } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import PracticeLayout from '@/layouts/PracticeLayout.vue';
import PracticeLoading from '@/components/common/PracticeLoading.vue';
import QuestionCard from '@/views/exam/components/QuestionCard.vue';
import PracticeFeedback from './components/PracticeFeedback.vue';
import QuestionFeedbackDialog from './components/QuestionFeedbackDialog.vue';
import PracticeProgressDots from './components/PracticeProgressDots.vue';
import { usePracticeConfigStore } from '@/stores/practiceConfig';
import * as practiceApi from '@/api/practice';
import type {
  PracticeCheckResult,
  PracticeDailyTask,
  PracticeMode,
  PracticeQuestion,
  PracticeSession,
  Question,
  QuestionType,
} from '@/types';

const route = useRoute();
const router = useRouter();
const configStore = usePracticeConfigStore();

/** 是否为错题复习模式 */
const isReans = computed<boolean>(() => route.name === 'practice-reans');

/** 会话来源（二期）：daily = 每日一练；favorite = 收藏重练；其余为常规练题 */
const source = computed<string>(() => (typeof route.query.source === 'string' ? route.query.source : ''));
const isDaily = computed<boolean>(() => source.value === 'daily');
const isFavorite = computed<boolean>(() => source.value === 'favorite');
/** 跨库会话的路由占位值不能作为真实题库 ID 保存进度。 */
const normalBankId = computed<string>(() =>
  isReans.value || isDaily.value || isFavorite.value ? '' : String(route.params.bankId ?? ''),
);

/** 来源标记文案（设计图 `.sx__src`） */
const srcLabel = computed<string>(() => {
  if (isDaily.value) return '每日一练';
  if (isFavorite.value) return '收藏重练';
  if (isReans.value) return '错题复习';
  return '';
});

const loading = ref(true);
const errorMessage = ref('');
const session = ref<PracticeSession | null>(null);
const questions = ref<PracticeQuestion[]>([]);
const index = ref(0);
/** 当前作答（qid → 选项索引数组） */
const answers = ref<Record<string, number[]>>({});
/** 已判分结果（qid → 结果） */
const results = ref<Record<string, PracticeCheckResult>>({});
const firstResults = ref<Record<string, PracticeCheckResult>>({});
const sheetVisible = ref(false);
const feedbackBusy = ref(false);
const feedbackVisible = ref(false);
const feedbackTarget = ref({ questionId: '', sessionId: '', questionNumber: 0, stem: '' });
const checkError = ref('');
let initGeneration = 0;
let disposed = false;
const submitting = ref(false);
const interactionBusy = computed(() => submitting.value || feedbackBusy.value || feedbackVisible.value);
const finished = ref(false);
let heartbeatTimer: ReturnType<typeof setInterval> | null = null;

function stopHeartbeat(): void {
  if (heartbeatTimer) clearInterval(heartbeatTimer);
  heartbeatTimer = null;
}

function startHeartbeat(): void {
  stopHeartbeat();
  heartbeatTimer = setInterval(() => {
    if (session.value?.id) void practiceApi.heartbeatSession(session.value.id).catch(() => { /* 断线按 90 秒规则转离线 */ });
  }, 30_000);
}

const currentQuestion = computed<PracticeQuestion | null>(() => questions.value[index.value] ?? null);
const currentId = computed<string>(() => currentQuestion.value?.id ?? '');
const currentAnswer = computed<number[]>(() => answers.value[currentId.value] ?? []);
const currentResult = computed<PracticeCheckResult | null>(() => results.value[currentId.value] ?? null);
const isLast = computed<boolean>(() => index.value >= questions.value.length - 1);

/** 每题状态点 */
const marks = computed<Array<'unanswered' | 'correct' | 'wrong'>>(() =>
  questions.value.map((q) => {
    const r = firstResults.value[q.id];
    return r ? (r.correct ? 'correct' : 'wrong') : 'unanswered';
  }),
);

/** 本次小结统计 */
const summary = computed(() => {
  const answered = Object.keys(firstResults.value).length;
  const correct = Object.values(firstResults.value).filter((r) => r.correct).length;
  const accuracy = answered > 0 ? Math.round((correct / answered) * 100) : 0;
  return { answered, correct, accuracy, total: questions.value.length };
});

/* ---------------- 收藏态（二期） ---------------- */

/** 当前用户已收藏的题目 id 集合 */
const favoriteIds = ref<Set<string>>(new Set());
const favoriteBusy = ref(false);
const favoriteReady = ref(false);
const favoriteError = ref(false);

/** 当前题是否已收藏 */
const currentFavorited = computed<boolean>(() => favoriteIds.value.has(currentId.value));

/** 拉取收藏态（失败静默降级为「未收藏」，不阻塞答题） */
async function loadFavoriteIds(): Promise<void> {
  const generation = initGeneration;
  favoriteReady.value = false;
  favoriteError.value = false;
  // 收藏功能关闭时不再请求（服务端亦会拒绝），直接视为未收藏
  if (!configStore.config.favoriteEnabled) {
    favoriteIds.value = new Set();
    favoriteReady.value = true;
    return;
  }
  try {
    const ids = await practiceApi.favoriteIds(undefined, { suppressErrorToast: true });
    if (disposed || generation !== initGeneration) return;
    favoriteIds.value = new Set(ids);
    favoriteReady.value = true;
  } catch {
    if (!disposed && generation === initGeneration) favoriteError.value = true;
  }
}

/** 收藏 / 取消收藏（乐观更新，失败回滚） */
async function toggleFavorite(): Promise<void> {
  const qid = currentId.value;
  if (!qid || favoriteBusy.value || !favoriteReady.value) return;
  const wasFavorited = favoriteIds.value.has(qid);
  favoriteBusy.value = true;

  const optimistic = new Set(favoriteIds.value);
  if (wasFavorited) optimistic.delete(qid);
  else optimistic.add(qid);
  favoriteIds.value = optimistic;

  try {
    if (wasFavorited) await practiceApi.removeFavorite(qid);
    else await practiceApi.addFavorite(qid);
  } catch {
    // 回滚（错误提示已由 http 拦截器统一弹出）
    const rollback = new Set(favoriteIds.value);
    if (wasFavorited) rollback.add(qid);
    else rollback.delete(qid);
    favoriteIds.value = rollback;
  } finally {
    favoriteBusy.value = false;
  }
}

/* ---------------- 每日一练进度（二期，服务端权威） ---------------- */

const dailyInfo = ref<PracticeDailyTask | null>(null);

/** 今日进度文案（仅每日一练模式显示） */
const dailyProgress = computed<string>(() => {
  if (!isDaily.value || !dailyInfo.value) return '';
  return `今日 ${dailyInfo.value.doneCount} / ${dailyInfo.value.total} 题`;
});

/** 刷新今日任务进度（失败静默，不打断作答） */
async function refreshDaily(): Promise<void> {
  try {
    dailyInfo.value = await practiceApi.daily({ suppressErrorToast: true });
  } catch {
    /* 静默 */
  }
}

/** 构造 `QuestionCard` 所需的最小 Question（不含答案；卡片仅使用 type/options/stem） */
function toQuestion(q: PracticeQuestion): Question {
  return {
    id: q.id,
    bankId: q.bankId,
    type: q.type,
    stem: q.stem,
    options: q.options,
    answer: [],
    defaultScore: 0,
    analysis: '',
    subject: q.subject,
    subjectId: null,
    status: 'active',
    difficulty: null,
    tags: [],
    rubric: [],
    createdBy: '',
    createdAt: '',
  } as Question;
}

/** 初始化：生成会话 + 取题 */
async function init(): Promise<void> {
  const generation = ++initGeneration;
  stopHeartbeat();
  loading.value = true;
  errorMessage.value = '';
  checkError.value = '';
  index.value = 0;
  answers.value = {};
  results.value = {};
  firstResults.value = {};
  finished.value = false;
  questions.value = [];
  session.value = null;
  try {
    // 练题端配置（默认模式 / 题量范围）：失败保持默认，不阻塞作答
    await configStore.load();
    if (disposed || generation !== initGeneration) return;
    // 辅助信息后台加载，不让收藏列表或今日统计拖住题目展示。
    void loadFavoriteIds();
    if (isDaily.value) void refreshDaily();
    let s: PracticeSession;
    if (isDaily.value) {
      // 每日一练：后端返回当日固定题序的会话（关闭时抛 1014，由 catch 统一展示）
      s = await practiceApi.dailySession();
    } else if (isFavorite.value) {
      const bankId = typeof route.query.bankId === 'string' ? route.query.bankId : undefined;
      s = await practiceApi.favoritesReans(bankId);
    } else if (isReans.value) {
      const bankId = typeof route.query.bankId === 'string' ? route.query.bankId : undefined;
      s = await practiceApi.wrongReans(bankId);
    } else {
      // 方式：URL 显式指定优先；缺省时用后台配置的默认练题方式（v1.9⑤）
      const mode: PracticeMode =
        route.query.mode === 'random' || route.query.mode === 'sequence'
          ? route.query.mode
          : configStore.config.defaultPracticeMode;
      const countRaw = typeof route.query.count === 'string' ? Number(route.query.count) : NaN;
      const count = Number.isFinite(countRaw) && countRaw > 0 ? countRaw : undefined;
      const types = typeof route.query.types === 'string'
        ? (route.query.types.split(',').filter(Boolean) as QuestionType[])
        : undefined;
      s = await practiceApi.createSession({
        bankId: normalBankId.value,
        mode,
        count,
        types: types && types.length > 0 ? types : undefined,
      });
    }
    if (disposed || generation !== initGeneration) {
      if (s.id) void practiceApi.finishSession(s.id, 'exited').catch(() => null);
      return;
    }
    session.value = s;
    if (s.questionIds.length === 0) {
      questions.value = [];
      return;
    }
    const loaded = await practiceApi.questionsByIds(s.questionIds);
    if (disposed || generation !== initGeneration) return;
    const byId = new Map(loaded.map(q => [q.id, q]));
    questions.value = s.questionIds.map(id => byId.get(id)).filter((q): q is PracticeQuestion => Boolean(q));
    if (questions.value.length) startHeartbeat();
  } catch (err) {
    if (!disposed && generation === initGeneration) {
      errorMessage.value = (err as Error).message || '加载失败，请稍后重试';
      finishExitedSession();
    }
  } finally {
    if (!disposed && generation === initGeneration) loading.value = false;
  }
}

/** 选择题目的作答更新（已判分后锁定，避免改动首次结果） */
function onAnswer(value: number[] | string[]): void {
  if (!currentId.value || currentResult.value || interactionBusy.value) return;
  checkError.value = '';
  answers.value = {
    ...answers.value,
    [currentId.value]: value.filter((item): item is number => typeof item === 'number'),
  };
}

/** 提交本题 → 即时判分 */
async function submit(): Promise<void> {
  const q = currentQuestion.value;
  if (!q || !session.value || interactionBusy.value || currentResult.value) return;
  if (currentAnswer.value.length === 0) {
    ElMessage.warning('请先作答');
    return;
  }
  checkError.value = '';
  submitting.value = true;
  try {
    const res = await practiceApi.check({
      sessionToken: session.value.sessionToken,
      questionId: q.id,
      answer: currentAnswer.value,
    });
    results.value = { ...results.value, [q.id]: res };
    if (!firstResults.value[q.id]) firstResults.value = { ...firstResults.value, [q.id]: res };
    // 记录进度（普通练题；错题复习 / 收藏重练 / 每日一练无单一题库）
    if (normalBankId.value) {
      void practiceApi.saveProgress({ bankId: normalBankId.value, lastQuestionId: q.id }, { suppressErrorToast: true }).catch(() => {
        /* 进度保存失败不打断作答 */
      });
    }
    // 每日一练：刷新今日进度（服务端权威）
    if (isDaily.value) void refreshDaily();
  } catch {
    checkError.value = '本题判分未成功，已保留你的选择，请重新提交本题。';
    void nextTick(() => document.querySelector<HTMLElement>('.session__check-error')?.scrollIntoView?.({ block: 'center', behavior: 'smooth' }));
  } finally {
    submitting.value = false;
  }
}

/** 重做本题（本地清空作答与结果，不扣分、不限次；统计以首次为准） */
function redo(): void {
  const qid = currentId.value;
  if (!qid || interactionBusy.value) return;
  checkError.value = '';
  const next = { ...results.value };
  delete next[qid];
  results.value = next;
  answers.value = { ...answers.value, [qid]: [] };
}

function reportQuestion(): void {
  if (!currentQuestion.value || !session.value?.id || interactionBusy.value) return;
  feedbackTarget.value = { questionId: currentQuestion.value.id, sessionId: session.value.id, questionNumber: index.value + 1, stem: currentQuestion.value.stem };
  feedbackVisible.value = true;
}

/** 下一题 / 结束 */
function next(): void {
  if (interactionBusy.value || !currentResult.value) return;
  checkError.value = '';
  if (isLast.value) {
    const missing = questions.value.findIndex(q => !firstResults.value[q.id]);
    if (missing >= 0) { ElMessage.info('还有题目未提交，请完成后查看小结'); jumpTo(missing); return; }
    finished.value = true;
    stopHeartbeat();
    if (session.value?.id) void practiceApi.finishSession(session.value.id, 'completed').catch(() => { /* 统计失败不阻塞小结 */ });
  } else {
    index.value += 1;
  }
  void nextTick(() => {
    // PC 由主布局内容区滚动，移动端由窗口滚动；小结也需要回到顶部。
    document.querySelector<HTMLElement>('.layout__content')?.scrollTo({ top: 0, behavior: 'smooth' });
    window.scrollTo({ top: 0, behavior: 'smooth' });
    document.querySelector<HTMLElement>('.session__card')?.focus({ preventScroll: true });
  });
}

function jumpTo(target: number): void {
  if (interactionBusy.value || target < 0 || target >= questions.value.length) return;
  checkError.value = '';
  index.value = target;
  sheetVisible.value = false;
  void nextTick(() => {
    document.querySelector<HTMLElement>('.layout__content')?.scrollTo?.({ top: 0, behavior: 'auto' });
    window.scrollTo({ top: 0, behavior: 'auto' });
    document.querySelector<HTMLElement>('.session__card')?.focus({ preventScroll: true });
  });
}

/** 返回首页 */
function goHome(): void {
  void router.push({ name: 'practice-home' });
}

/** 查看错题本 */
function goWrongBook(): void {
  void router.push({ name: 'practice-wrong-book' });
}

/** 结束会话是辅助上报，不阻塞用户离开当前页面。 */
function finishExitedSession(): void {
  stopHeartbeat();
  if (session.value?.id) {
    void practiceApi.finishSession(session.value.id, 'exited').catch(() => null);
  }
}

/** 再练一次（重置并重新生成会话） */
function restart(): void {
  void init();
}

// 离开作答页二次确认（微信返回键 = 浏览器后退，保证状态一致）
onBeforeRouteLeave(async () => {
  if (submitting.value || feedbackBusy.value) { ElMessage.info('正在提交，请稍后再离开'); return false; }
  if (finished.value) return true;
  if (Object.values(answers.value).every(value => value.length === 0) && Object.keys(firstResults.value).length === 0) {
    finishExitedSession();
    return true;
  }
  try {
    await ElMessageBox.confirm('确认退出本次练习？', '退出练习', {
      confirmButtonText: '退出',
      cancelButtonText: '继续练习',
      type: 'warning',
    });
    finishExitedSession();
    return true;
  } catch {
    return false;
  }
});

onMounted(init);
onBeforeUnmount(() => { disposed = true; initGeneration += 1; stopHeartbeat(); });
</script>

<template>
  <PracticeLayout data-ui-layout="answer" data-ui-page="PracticeSessionPage" bare>
    <!-- 作答页无顶栏（设计图 p-session 为 bare）：进度工具栏由页面自带，满幅贴顶 -->

    <!-- 页内占位保留返回入口，快速取题不闪全屏遮罩。 -->
    <div v-if="loading" class="session__preparing">
      <el-button @click="goHome">返回首页</el-button>
      <PracticeLoading :loading="loading" :rows="5" caption="正在准备题目…" />
    </div>

    <!-- 加载失败 -->
    <div v-if="!loading && errorMessage" class="session__state">
      <div class="session__state-mark" aria-hidden="true">!</div>
      <p class="session__state-text">{{ errorMessage }}</p>
      <el-button type="primary" @click="restart">重新加载</el-button>
      <el-button type="primary" @click="goHome">返回首页</el-button>
    </div>

    <!-- 无题可练 -->
    <div v-if="!loading && !errorMessage && questions.length === 0" class="session__state">
      <div class="session__state-mark" aria-hidden="true">—</div>
      <p class="session__state-text">{{ isReans ? '错题本暂无题目' : '该题库暂无可练习的题目' }}</p>
      <el-button type="primary" @click="goHome">返回首页</el-button>
    </div>

    <!-- 本次小结 -->
    <div v-if="!loading && !errorMessage && questions.length > 0 && finished" class="summary">
      <div class="summary__mark" aria-hidden="true">✓</div>
      <h2 class="summary__title">本次练习完成</h2>
      <div class="summary__stats">
        <div class="summary__stat">
          <span class="summary__num">{{ summary.answered }}</span>
          <span class="summary__label">已练题数</span>
        </div>
        <div class="summary__stat summary__stat--ok">
          <span class="summary__num">{{ summary.correct }}</span>
          <span class="summary__label">答对</span>
        </div>
        <div class="summary__stat summary__stat--rate">
          <span class="summary__num">{{ summary.accuracy }}%</span>
          <span class="summary__label">正确率</span>
        </div>
      </div>
      <p class="summary__tip">本次小结按每题首次判分统计，重做不改变首次结果。</p>
      <p v-if="isDaily" class="summary__tip summary__tip--daily">
        今日一练 {{ dailyInfo ? `${dailyInfo.doneCount} / ${dailyInfo.total} 题` : '已记录' }}
        <template v-if="(dailyInfo?.streakDays ?? 0) > 0"> · 连续打卡 {{ dailyInfo?.streakDays }} 天</template>
      </p>
      <div class="summary__actions">
        <el-button @click="restart">再练一次</el-button>
        <el-button type="primary" @click="goHome">返回首页</el-button>
      </div>
      <el-button v-if="configStore.config.wrongBookEnabled" text class="summary__wrong" @click="goWrongBook">查看错题本 ›</el-button>
    </div>

    <!-- 作答中 -->
    <div v-if="!loading && !errorMessage && questions.length > 0 && !finished" class="session">
      <div class="session__top">
        <div class="session__row">
          <button type="button" class="session__back" aria-label="返回" :disabled="interactionBusy" @click="goHome">‹</button>
          <span class="session__counter">
            第 {{ index + 1 }} / {{ questions.length }} 题<template v-if="dailyProgress"> · {{ dailyProgress }}</template>
          </span>
          <div class="session__right">
            <span v-if="srcLabel" class="session__source">{{ srcLabel }}</span>
            <button
              v-if="configStore.config.favoriteEnabled"
              type="button"
              class="session__fav"
              :class="{ 'is-on': currentFavorited }"
              :disabled="interactionBusy || favoriteBusy || (!favoriteReady && !favoriteError)"
              :aria-pressed="favoriteReady ? currentFavorited : undefined"
              @click="favoriteError ? loadFavoriteIds() : toggleFavorite()"
            >
              {{ favoriteError ? '重试收藏状态' : !favoriteReady ? '收藏加载中…' : currentFavorited ? '已收藏' : '收藏本题' }}
            </button>
          </div>
        </div>
        <div class="session__progress-row"><PracticeProgressDots
          class="session__dots"
          :total="questions.length"
          :current="index"
          :marks="marks"
          variant="on-light"
        /><el-button text :disabled="interactionBusy" @click="sheetVisible = true">答题卡</el-button></div>
      </div>

      <div class="session__body">
        <div v-if="currentQuestion" class="session__card" tabindex="-1" :class="{ 'is-locked': !!currentResult || submitting }" :aria-busy="submitting">
          <QuestionCard
            :index="index"
            :question="toQuestion(currentQuestion)"
            :score="0"
            :model-value="currentAnswer"
            :disabled="Boolean(currentResult) || submitting"
            @update:model-value="onAnswer"
          />
        </div>

        <el-alert v-if="checkError" :title="checkError" type="error" show-icon :closable="false" class="session__check-error" />
        <!-- 反馈区（提交后） -->
        <PracticeFeedback v-if="currentResult" :result="currentResult" :selected="currentAnswer" />
        <el-button v-if="index > 0" class="session__previous" :disabled="interactionBusy" @click="jumpTo(index - 1)">上一题</el-button>
      </div>

      <!-- 操作区：PC 跟随题目，移动端吸底 -->
      <div class="session__actions">
        <template v-if="!currentResult">
          <el-button
            type="primary"
            size="large"
            class="session__submit"
            :loading="submitting"
            :disabled="submitting || currentAnswer.length === 0"
            @click="submit"
          >
            {{ submitting ? '正在判分…' : '提交本题' }}
          </el-button>
        </template>
        <template v-else>
          <el-button size="large" :loading="feedbackBusy" :disabled="interactionBusy || !session?.id" @click="reportQuestion">题目纠错</el-button>
          <el-button size="large" class="session__redo" :disabled="interactionBusy" @click="redo">重做本题</el-button>
          <el-button type="primary" size="large" class="session__next" :disabled="interactionBusy" @click="next">
            {{ isLast ? '完成' : '下一题 ›' }}
          </el-button>
        </template>
      </div>
    </div>
    <el-drawer v-model="sheetVisible" title="练题答题卡" class="practice-sheet" direction="btt" size="70%" append-to-body><p class="session__sheet-note">已完成 {{ summary.answered }} / {{ questions.length }} 题 · 小结采用每题首次判分</p><p class="session__sheet-note">答对 / 答错 / 未提交；当前题有蓝色边框，可跳转检查并保留未提交选择。</p><div class="session__sheet-grid"><button v-for="(question, questionIndex) in questions" :key="question.id" type="button" :class="['session__sheet-cell', marks[questionIndex], { 'is-current': questionIndex === index }]" :disabled="interactionBusy" :aria-label="`第 ${questionIndex + 1} 题，${marks[questionIndex] === 'correct' ? '答对' : marks[questionIndex] === 'wrong' ? '答错' : '未提交'}`" :aria-current="questionIndex === index ? 'true' : undefined" @click="jumpTo(questionIndex)">{{ questionIndex + 1 }}</button></div><template #footer><el-button type="primary" @click="sheetVisible = false">继续练习</el-button></template></el-drawer>
    <QuestionFeedbackDialog v-model:visible="feedbackVisible" v-bind="feedbackTarget" @busy="feedbackBusy = $event" />
  </PracticeLayout>
</template>

<style scoped lang="scss">
@use '@/styles/variables.scss' as *;

.session {
  &__check-error { margin-top: 16px; overflow-wrap: anywhere; }
  &__card:focus-visible { outline: 2px solid $color-primary; outline-offset: 4px; }
  &__progress-row { display: flex; align-items: center; gap: 12px; .session__dots { flex: 1; min-width: 0; } }
  &__previous { margin-top: 20px; min-height: 44px; }
  &__sheet-note { font-size: 13px; color: $text-secondary; line-height: 1.6; }
  &__sheet-grid { display: grid; grid-template-columns: repeat(auto-fill,minmax(44px,1fr)); gap: 10px; }
  &__sheet-cell { min-height: 44px; border: 1px solid $border-color; border-radius: $radius-sm; background: $bg-paper; color: $text-body; cursor: pointer; &.correct { background: $color-success-bg; color: $color-success-text; } &.wrong { background: $color-error-bg; color: $color-error-text; } &.is-current { outline: 2px solid $color-primary; outline-offset: 1px; } }
  &__preparing {
    padding: 14px;
  }

  /* 作答页为 bare 布局：无顶栏，进度工具栏由页面自带并满幅贴顶（设计图 .sx） */
  display: flex;
  flex: 1;
  flex-direction: column;
  min-width: 0;

  &__skeleton {
    margin: 14px;
    padding: 18px;
    background: $bg-paper;
    border: 1px solid $border-color;
    border-radius: $practice-radius;
  }

  &__state {
    padding: 64px 20px;
    text-align: center;
  }

  &__state-mark {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 42px;
    height: 42px;
    margin-bottom: 12px;
    border-radius: 50%;
    background: $practice-surface-3;
    font-size: 19px;
    font-weight: 700;
    color: $text-disabled;
    line-height: 1;
  }

  &__state-text {
    margin: 0 0 18px;
    font-size: 13.5px;
    color: $text-secondary;
  }

  /* 顶部工具栏：返回 + 题号 + 来源/收藏 + 进度点（满幅白条，设计图 .sx__top） */
  &__top {
    padding: calc(10px + env(safe-area-inset-top)) 14px 12px;
    background: $bg-paper;
    border-bottom: 1px solid $border-color;
  }

  &__row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 10px;
  }

  &__back {
    flex: 0 0 30px;
    display: grid;
    place-items: center;
    width: 30px;
    height: 30px;
    padding: 0;
    border: 1px solid $line-strong;
    border-radius: $radius-sm;
    background: $bg-paper;
    font-size: 16px;
    line-height: 1;
    color: $text-secondary;
    cursor: pointer;
    transition: border-color $transition-fast, color $transition-fast, background-color $transition-fast;

    &:active {
      border-color: $practice-primary;
      background: $practice-soft;
      color: $practice-primary;
    }
  }

  &__counter {
    flex: 0 1 auto;
    min-width: 0;
    overflow: hidden;
    white-space: normal;
    overflow-wrap: anywhere;
    font-size: 13px;
    font-weight: 620;
    color: $text-primary;
  }

  &__right {
    display: flex;
    flex: 0 1 auto;
    min-width: 0;
    max-width: 100%;
    align-items: center;
    gap: 8px;
    margin-left: auto;
  }

  &__source {
    display: inline-flex;
    align-items: center;
    min-height: 22px;
    min-width: 0;
    overflow-wrap: anywhere;
    padding: 0 8px;
    border-radius: $radius-sm;
    background: $practice-soft;
    font-size: 12px;
    font-weight: 620;
    color: $practice-primary;
  }

  &__fav {
    flex: 0 0 auto;
    height: 26px;
    padding: 0 10px;
    border: 1px solid $line-strong;
    border-radius: 99px; // radius-exception: favorite action pill
    background: $bg-paper;
    font-size: 12px;
    font-weight: 580;
    color: $text-secondary;
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
    transition: color $transition-fast, border-color $transition-fast, background-color $transition-fast;

    /* 已收藏：琥珀「星标」态（设计图 .sx__fav.is-on） */
    &.is-on {
      border-color: $color-warning-border;
      background: $color-warning-bg;
      color: $color-warning-text;
    }

    &:disabled {
      opacity: 0.6;
    }
  }

  &__dots {
    margin-top: 11px;
  }

  &__body {
    flex: 1;
    padding: 14px 14px calc(82px + env(safe-area-inset-bottom));
  }

  &__card {
    /* 已判分后锁定选项（避免改动首次结果）；不修改 QuestionCard 内部 */
    &.is-locked {
      pointer-events: none;
    }

    /* 移动端隐藏「0 分」分值展示 */
    :deep(.question-card__score) {
      display: none;
    }
  }

  /* 固定底部操作区：始终可提交，同时为全面屏安全区留出空间。 */
  &__actions {
    position: fixed;
    left: 50%;
    transform: translateX(-50%);
    bottom: 0;
    z-index: 30;
    display: flex;
    width: min(100%, 600px);
    box-sizing: border-box;
    gap: 9px;
    padding: 10px 14px calc(14px + env(safe-area-inset-bottom));
    background: $bg-paper;
    border-top: 1px solid $border-color;

    :deep(.el-button) {
      flex: 1;
      min-width: 0;
      margin: 0;
      height: 42px;
      font-size: 14px;
      font-weight: 580;
      border-radius: $radius-sm;
    }
  }

  &__redo {
    background: $bg-paper;
    border-color: $line-strong;
    color: $text-primary;
  }

  &__submit,
  &__next {
    border: none;
    background: $practice-primary;

    &:hover,
    &:active {
      background: $practice-primary-dark;
    }
  }
}

@media (min-width: 901px) {
  .session {
    width: 100%;
    max-width: 960px;
    margin: 0 auto;
    box-sizing: border-box;
    background: $bg-paper;
    border: 1px solid $border-color;
    border-radius: $radius-lg;

    &__top {
      padding: 16px 24px;
      border-radius: $radius-lg $radius-lg 0 0;
    }

    &__body {
      flex: none;
      padding: 24px 24px 0;
    }

    &__card :deep(.question-card) {
      padding: 0;
      border: 0;
      border-radius: 0;
    }

    &__card :deep(.question-card__stem) {
      font-size: 16px;
    }

    // 桌面端操作区属于答题卡，紧随内容排列，短题不再撑出独立白条。
    &__actions {
      position: static;
      left: auto;
      transform: none;
      width: 100%;
      justify-content: center;
      gap: 12px;
      padding: 20px 24px 24px;
      border-top: 0;
      border-radius: 0 0 $radius-lg $radius-lg;

      :deep(.el-button) {
        flex: 0 1 160px;
      }
    }
  }
}

.summary {
  padding: 32px 20px calc(16px + env(safe-area-inset-bottom));
  text-align: center;

  &__mark {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 48px;
    height: 48px;
    border: 1px solid $practice-border-soft;
    border-radius: 50%;
    background: $practice-soft;
    font-size: 22px;
    font-weight: 700;
    color: $practice-primary;
    line-height: 1;
  }

  &__title {
    margin: 14px 0 20px;
    font-size: 17px;
    font-weight: 660;
    letter-spacing: -0.01em;
    color: $text-primary;
  }

  &__stats {
    display: flex;
    justify-content: center;
    gap: 9px;
    margin-bottom: 18px;
  }

  &__stat {
    flex: 1;
    max-width: 120px;
    padding: 13px;
    background: $bg-paper;
    border: 1px solid $border-color;
    border-radius: $practice-radius;
  }

  &__num {
    display: block;
    font-size: 20px;
    font-weight: 680;
    letter-spacing: -0.02em;
    line-height: 1.1;
    color: $text-primary;
    font-variant-numeric: tabular-nums;
  }

  &__stat--ok &__num {
    color: $color-success-text;
  }

  &__label {
    display: block;
    margin-top: 3px;
    font-size: 12px;
    color: $text-secondary;
  }

  &__tip {
    margin: 0 0 18px;
    font-size: 12px;
    color: $text-secondary;

    &::before {
      content: '✓';
      margin-right: 5px;
      color: $color-success-text;
      font-weight: 700;
    }

    /* 每日一练完成态附加行：无勾选装饰，字号略小 */
    &--daily {
      margin-top: -12px;
      font-size: 12px;
      color: $practice-primary;

      &::before {
        content: '';
        margin: 0;
      }
    }
  }

  &__actions {
    display: flex;
    gap: 9px;
    margin-bottom: 12px;

    :deep(.el-button) {
      flex: 1;
      height: 42px;
      font-size: 14px;
      font-weight: 580;
      border-radius: $radius-sm;
    }

    :deep(.el-button--primary) {
      border: none;
      background: $practice-primary;

      &:hover,
      &:active {
        background: $practice-primary-dark;
      }
    }
  }

  &__wrong {
    color: $practice-primary;
    font-weight: 600;
  }
}
</style>
