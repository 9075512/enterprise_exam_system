<script setup lang="ts">
/**
 * 练题作答页（单题聚焦 + 即时反馈 + 小结）· 仅移动端 · 微信内置浏览器兼容。
 *
 * 流程：生成会话（顺序/随机/题量/题型 或 错题复习）→ 按 id 批量取题（不含答案）→
 * 逐题作答 → 提交单题即时判分看解析 → 重做/下一题 → 结束展示小结。
 *
 * 复用考试组件 `QuestionCard`（**不改其内部**）；不使用 CountdownTimer/VisibilityGuard/AnswerSheet。
 * 视觉：冷静蓝 · 商务风（细边框卡片、吸底实色操作栏、无渐变 / 无 emoji 装饰）。
 */
import { computed, onMounted, ref } from 'vue';
import { onBeforeRouteLeave, useRoute, useRouter } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import PracticeLayout from '@/layouts/PracticeLayout.vue';
import BootSplash from '@/components/common/BootSplash.vue';
import QuestionCard from '@/views/exam/components/QuestionCard.vue';
import PracticeFeedback from './components/PracticeFeedback.vue';
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
const isReans = computed<boolean>(() => Boolean(route.meta.reans));
/** 普通练题的题库 id（错题复习为空串） */
const normalBankId = computed<string>(() => (isReans.value ? '' : String(route.params.bankId ?? '')));

/** 会话来源（二期）：daily = 每日一练；favorite = 收藏重练；其余为常规练题 */
const source = computed<string>(() => (typeof route.query.source === 'string' ? route.query.source : ''));
const isDaily = computed<boolean>(() => source.value === 'daily');
const isFavorite = computed<boolean>(() => source.value === 'favorite');

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
const submitting = ref(false);
const finished = ref(false);

const currentQuestion = computed<PracticeQuestion | null>(() => questions.value[index.value] ?? null);
const currentId = computed<string>(() => currentQuestion.value?.id ?? '');
const currentAnswer = computed<number[]>(() => answers.value[currentId.value] ?? []);
const currentResult = computed<PracticeCheckResult | null>(() => results.value[currentId.value] ?? null);
const isLast = computed<boolean>(() => index.value >= questions.value.length - 1);

/** 每题状态点 */
const marks = computed<Array<'unanswered' | 'correct' | 'wrong'>>(() =>
  questions.value.map((q) => {
    const r = results.value[q.id];
    return r ? (r.correct ? 'correct' : 'wrong') : 'unanswered';
  }),
);

/** 本次小结统计 */
const summary = computed(() => {
  const answered = Object.keys(results.value).length;
  const correct = Object.values(results.value).filter((r) => r.correct).length;
  const accuracy = answered > 0 ? Math.round((correct / answered) * 100) : 0;
  return { answered, correct, accuracy, total: questions.value.length };
});

/* ---------------- 收藏态（二期） ---------------- */

/** 当前用户已收藏的题目 id 集合 */
const favoriteIds = ref<Set<string>>(new Set());
const favoriteBusy = ref(false);

/** 当前题是否已收藏 */
const currentFavorited = computed<boolean>(() => favoriteIds.value.has(currentId.value));

/** 拉取收藏态（失败静默降级为「未收藏」，不阻塞答题） */
async function loadFavoriteIds(): Promise<void> {
  // 收藏功能关闭时不再请求（服务端亦会拒绝），直接视为未收藏
  if (!configStore.config.favoriteEnabled) {
    favoriteIds.value = new Set();
    return;
  }
  try {
    const ids = await practiceApi.favoriteIds();
    favoriteIds.value = new Set(ids);
  } catch {
    favoriteIds.value = new Set();
  }
}

/** 收藏 / 取消收藏（乐观更新，失败回滚） */
async function toggleFavorite(): Promise<void> {
  const qid = currentId.value;
  if (!qid || favoriteBusy.value) return;
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
    dailyInfo.value = await practiceApi.daily();
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
    createdBy: '',
    createdAt: '',
  };
}

/** 初始化：生成会话 + 取题 */
async function init(): Promise<void> {
  loading.value = true;
  errorMessage.value = '';
  index.value = 0;
  answers.value = {};
  results.value = {};
  finished.value = false;
  try {
    // 练题端配置（默认模式 / 题量范围）：失败保持默认，不阻塞作答
    await configStore.load();
    let s: PracticeSession;
    if (isDaily.value) {
      // 每日一练：后端返回当日固定题序的会话（关闭时抛 1014，由 catch 统一展示）
      s = await practiceApi.dailySession();
      await refreshDaily();
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
    session.value = s;
    if (s.questionIds.length === 0) {
      questions.value = [];
      return;
    }
    questions.value = await practiceApi.questionsByIds(s.questionIds);
    // 收藏态回显（失败静默降级，不阻塞答题）
    await loadFavoriteIds();
  } catch (err) {
    errorMessage.value = (err as Error).message || '加载失败，请稍后重试';
  } finally {
    loading.value = false;
  }
}

/** 选择题目的作答更新（已判分后锁定，避免改动首次结果） */
function onAnswer(value: number[]): void {
  if (!currentId.value || currentResult.value) return;
  answers.value = { ...answers.value, [currentId.value]: value };
}

/** 提交本题 → 即时判分 */
async function submit(): Promise<void> {
  const q = currentQuestion.value;
  if (!q || !session.value) return;
  if (currentAnswer.value.length === 0) {
    ElMessage.warning('请先作答');
    return;
  }
  submitting.value = true;
  try {
    const res = await practiceApi.check({
      sessionToken: session.value.sessionToken,
      questionId: q.id,
      answer: currentAnswer.value,
    });
    results.value = { ...results.value, [q.id]: res };
    // 记录进度（普通练题；错题复习 / 收藏重练 / 每日一练无单一题库）
    if (normalBankId.value) {
      void practiceApi.saveProgress({ bankId: normalBankId.value, lastQuestionId: q.id }).catch(() => {
        /* 进度保存失败不打断作答 */
      });
    }
    // 每日一练：刷新今日进度（服务端权威）
    if (isDaily.value) void refreshDaily();
  } catch {
    // 错误提示已由 http 拦截器统一弹出
  } finally {
    submitting.value = false;
  }
}

/** 重做本题（本地清空作答与结果，不扣分、不限次；统计以首次为准） */
function redo(): void {
  const qid = currentId.value;
  if (!qid) return;
  const next = { ...results.value };
  delete next[qid];
  results.value = next;
  answers.value = { ...answers.value, [qid]: [] };
}

/** 下一题 / 结束 */
function next(): void {
  if (isLast.value) {
    finished.value = true;
    return;
  }
  index.value += 1;
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/** 返回首页 */
function goHome(): void {
  void router.push({ name: 'practice-home' });
}

/** 查看错题本 */
function goWrongBook(): void {
  void router.push({ name: 'practice-reans' });
}

/** 再练一次（重置并重新生成会话） */
function restart(): void {
  void init();
}

// 离开作答页二次确认（微信返回键 = 浏览器后退，保证状态一致）
onBeforeRouteLeave(async () => {
  if (finished.value) return true;
  if (index.value === 0 && Object.keys(results.value).length === 0) return true;
  try {
    await ElMessageBox.confirm('确认退出本次练习？', '退出练习', {
      confirmButtonText: '退出',
      cancelButtonText: '继续练习',
      type: 'warning',
    });
    return true;
  } catch {
    return false;
  }
});

onMounted(init);
</script>

<template>
  <PracticeLayout bare>
    <!-- 作答页无顶栏（设计图 p-session 为 bare）：进度工具栏由页面自带，满幅贴顶 -->

    <!-- 加载中：品牌脉冲全屏（进入答题，Loading 方案 ①） -->
    <BootSplash :show="loading" dark caption="正在准备题目…" />

    <!-- 加载失败 -->
    <div v-if="!loading && errorMessage" class="session__state">
      <div class="session__state-mark" aria-hidden="true">!</div>
      <p class="session__state-text">{{ errorMessage }}</p>
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
      <p class="summary__tip">进度与错题本已保存到你的账号</p>
      <p v-if="isDaily" class="summary__tip summary__tip--daily">
        今日一练 {{ dailyInfo ? `${dailyInfo.doneCount} / ${dailyInfo.total} 题` : '已记录' }}
        <template v-if="(dailyInfo?.streakDays ?? 0) > 0"> · 连续打卡 {{ dailyInfo?.streakDays }} 天</template>
      </p>
      <div class="summary__actions">
        <el-button @click="restart">再练一次</el-button>
        <el-button type="primary" @click="goHome">返回首页</el-button>
      </div>
      <el-button text class="summary__wrong" @click="goWrongBook">查看错题本 ›</el-button>
    </div>

    <!-- 作答中 -->
    <div v-if="!loading && !errorMessage && questions.length > 0 && !finished" class="session">
      <div class="session__top">
        <div class="session__row">
          <button type="button" class="session__back" aria-label="返回" @click="goHome">‹</button>
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
              :disabled="favoriteBusy"
              :aria-pressed="currentFavorited"
              @click="toggleFavorite"
            >
              {{ currentFavorited ? '已收藏' : '收藏本题' }}
            </button>
          </div>
        </div>
        <PracticeProgressDots
          class="session__dots"
          :total="questions.length"
          :current="index"
          :marks="marks"
          variant="on-light"
        />
      </div>

      <div class="session__body">
        <div v-if="currentQuestion" class="session__card" :class="{ 'is-locked': !!currentResult }">
          <QuestionCard
            :index="index"
            :question="toQuestion(currentQuestion)"
            :score="0"
            :model-value="currentAnswer"
            @update:model-value="onAnswer"
          />
        </div>

        <!-- 反馈区（提交后） -->
        <PracticeFeedback v-if="currentResult" :result="currentResult" :selected="currentAnswer" />
      </div>

      <!-- 操作区（吸底） -->
      <div class="session__actions">
        <template v-if="!currentResult">
          <el-button
            type="primary"
            size="large"
            class="session__submit"
            :loading="submitting"
            :disabled="currentAnswer.length === 0"
            @click="submit"
          >
            提交本题
          </el-button>
        </template>
        <template v-else>
          <el-button size="large" class="session__redo" @click="redo">重做本题</el-button>
          <el-button type="primary" size="large" class="session__next" @click="next">
            {{ isLast ? '完成' : '下一题 ›' }}
          </el-button>
        </template>
      </div>
    </div>
  </PracticeLayout>
</template>

<style scoped lang="scss">
@use '@/styles/variables.scss' as *;

.session {
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
    white-space: nowrap;
    text-overflow: ellipsis;
    font-size: 13px;
    font-weight: 620;
    color: $text-primary;
  }

  &__right {
    display: flex;
    flex: 0 0 auto;
    align-items: center;
    gap: 8px;
    margin-left: auto;
  }

  &__source {
    display: inline-flex;
    align-items: center;
    height: 22px;
    padding: 0 8px;
    border-radius: $radius-sm;
    background: $practice-soft;
    font-size: 10.5px;
    font-weight: 620;
    color: $practice-primary;
  }

  &__fav {
    flex: 0 0 auto;
    height: 26px;
    padding: 0 10px;
    border: 1px solid $line-strong;
    border-radius: 99px;
    background: $bg-paper;
    font-size: 11px;
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
    padding: 14px;
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

  /* 吸底操作区：白底 + 上边框（设计图 .m-foot） */
  &__actions {
    position: sticky;
    bottom: 0;
    z-index: 10;
    display: flex;
    gap: 9px;
    margin-top: auto;
    padding: 10px 14px calc(14px + env(safe-area-inset-bottom));
    background: $bg-paper;
    border-top: 1px solid $border-color;

    :deep(.el-button) {
      flex: 1;
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
    font-size: 11px;
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
      font-size: 11.5px;
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
