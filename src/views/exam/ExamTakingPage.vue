<script setup lang="ts">
/**
 * 全屏答题页（W3-T1，全站逻辑最重）。
 * 快照答题 + 断点续答 + 倒计时（到时自动交卷）+ 节流暂存 + 切屏上报 + 交卷判分。
 * 不使用 AppLayout：自带顶部固定栏 / 左侧答题区 / 右侧答题卡（v3.1 对齐设计稿 p-exam-taking）。
 *
 * v3.1 方向 C 布局对齐：顶栏由 64px 双层（品牌渐变条 + 返回钮）压到 56px 单层
 * `exambar`（题标 + 副标题 + 倒计时 + 进度条 + 已答计数 + 暂存退出 / 交卷）；
 * 进度条从底部吸底栏上移到顶栏，取消底部固定栏（提交动作常驻可见）；
 * 切屏异常由顶栏药丸改为正文顶部的警示条（与设计稿一致，且文案能说清阈值）。
 */
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import dayjs from 'dayjs';
import { ElMessage, ElMessageBox } from 'element-plus';
import { InfoFilled, Warning } from '@element-plus/icons-vue';
import * as examsApi from '@/api/exams';
import * as recordsApi from '@/api/records';
import { useAuthStore } from '@/stores/auth';
import { useSettingsStore } from '@/stores/settings';
import { formatScore } from '@/utils/format';
import CountdownTimer from './components/CountdownTimer.vue';
import VisibilityGuard from './components/VisibilityGuard.vue';
import QuestionCard from './components/QuestionCard.vue';
import AnswerSheet from './components/AnswerSheet.vue';
import ExamResultDialog from './components/ExamResultDialog.vue';
import BootSplash from '@/components/common/BootSplash.vue';
import type { Exam, ExamRecord } from '@/types';

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();
const settingsStore = useSettingsStore();

const recordId = String(route.params.recordId ?? '');

const loading = ref(true);
const record = ref<ExamRecord | null>(null);
const exam = ref<Exam | null>(null);
const answers = ref<Record<string, number[] | string[]>>({});
const remaining = ref(0);
const submitted = ref(false);
const submitting = ref(false);
const cheatCount = ref(0);
const cheatAwayTotal = ref(0);
const currentIndex = ref(0);

/** 快照题目列表 */
const questions = computed(() => record.value?.paperSnapshot.questions ?? []);

/** 本次作答序号（>1 时副标题展示标记） */
const attemptNo = computed<number>(() => record.value?.attemptNo ?? 1);

/** 已答题数（顶栏实时进度） */
const answeredCount = computed<number>(
  () => questions.value.filter((q) => (answers.value[q.questionId]?.length ?? 0) > 0).length,
);

/** 进度百分比（无题按 0，避免 0/0 出现 NaN 宽度） */
const progressPercent = computed<number>(() => {
  if (questions.value.length === 0) return 0;
  return Math.round((answeredCount.value / questions.value.length) * 100);
});

/** 答题卡上方考生信息 */
const userName = computed<string>(() => auth.currentUser?.name ?? '考生');
const userDepartment = computed<string>(() => auth.currentUser?.departmentName ?? '');

/** 防作弊：答题页浮水印 / 复制限制（读系统设置，响应式） */
const watermarkEnabled = computed<boolean>(() => settingsStore.settings.cheatWatermarkEnabled);
const watermarkText = computed<string>(() => {
  const u = auth.currentUser;
  return u ? `${u.name} ${u.username}` : '考生作答';
});

/** 复制/右键/选择守卫：仅在「复制限制」开启时阻止默认行为 */
function guardCopy(event: Event): void {
  if (settingsStore.settings.cheatCopyGuardEnabled) event.preventDefault();
}

let tickTimer: number | undefined;
let saveTimer: number | undefined;

/* ------------------------------ 初始化 ------------------------------ */
onMounted(async () => {
  void settingsStore.load();
  try {
    const rec = await recordsApi.detail(recordId);
    if (rec.status === 'submitted') {
      ElMessage.info('该考试已交卷');
      void router.replace(`/score-detail/${recordId}`);
      return;
    }
    record.value = rec;
    // 断点续答：后端已存最新暂存答案
    answers.value = { ...rec.answers };

    exam.value = await examsApi.detail(rec.examId);

    // 倒计时基准：开考时刻 + （考试时长 + 本人加时）
    const totalMinutes = exam.value.durationMinutes + (rec.extraMinutes ?? 0);
    const deadline = dayjs(rec.startedAt).add(totalMinutes, 'minute').valueOf();
    remaining.value = Math.max(0, Math.floor((deadline - Date.now()) / 1000));
    startTimer();

    window.addEventListener('beforeunload', beforeUnloadHandler);
  } catch {
    // 错误提示已由 http.ts 响应拦截器统一弹出
  } finally {
    loading.value = false;
  }
});

onUnmounted(() => {
  if (tickTimer) window.clearInterval(tickTimer);
  if (saveTimer) window.clearTimeout(saveTimer);
  window.removeEventListener('beforeunload', beforeUnloadHandler);
  // 尽力而为的最后一次暂存
  if (!submitted.value && record.value) void silenceSave();
});

/* ------------------------------ 倒计时 ------------------------------ */
function startTimer(): void {
  tickTimer = window.setInterval(() => {
    if (submitted.value) return;
    remaining.value -= 1;
    if (remaining.value <= 0) {
      remaining.value = 0;
      if (tickTimer) window.clearInterval(tickTimer);
      void handleAutoSubmit();
    }
  }, 1000);
}

async function handleAutoSubmit(): Promise<void> {
  if (submitted.value) return;
  try {
    await ElMessageBox.alert('考试时间到，系统将自动交卷', '时间到', {
      type: 'warning',
      confirmButtonText: '知道了',
    });
  } catch {
    // 关闭弹窗也继续自动交卷
  }
  await doSubmit(true);
}

/* ------------------------------ 作答与暂存 ------------------------------ */
function updateAnswer(questionId: string, value: number[] | string[]): void {
  if (submitted.value) return;
  answers.value = { ...answers.value, [questionId]: value };
  scheduleSave();
}

function scheduleSave(): void {
  if (saveTimer) window.clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => {
    void silenceSave();
  }, 1500);
}

async function silenceSave(): Promise<void> {
  try {
    await recordsApi.saveAnswers(recordId, answers.value);
  } catch (error) {
    // 静默失败，不打断答题
    console.warn('[ExamTaking] 暂存答案失败：', error);
  }
}

/* ------------------------------ 切屏 ------------------------------ */
async function onAway(seconds: number): Promise<void> {
  if (submitted.value) return;
  cheatCount.value += 1;
  cheatAwayTotal.value += seconds;
  try {
    await recordsApi.addCheatEvent(recordId, seconds);
  } catch (error) {
    console.warn('[ExamTaking] 上报切屏事件失败：', error);
  }
  const s = settingsStore.settings;
  const overCount = cheatCount.value >= s.cheatCountThreshold;
  const overSeconds = cheatAwayTotal.value >= s.cheatSecondsThreshold;
  // 后台开关开启且超阈值 → 自动强制交卷（auto 标记）
  if (s.cheatAutoSubmitEnabled && (overCount || overSeconds)) {
    ElMessage.error('检测到异常切屏，已自动交卷');
    await doSubmit(true);
    return;
  }
  if (overCount || overSeconds) {
    ElMessage.warning('检测到多次切屏，异常行为将被记录');
  }
}

/* ------------------------------ 交卷 / 暂存退出 ------------------------------ */
async function handleSubmit(): Promise<void> {
  if (submitted.value) return;
  try {
    await ElMessageBox.confirm('确认交卷？交卷后不可修改答案。', '交卷确认', {
      type: 'warning',
      confirmButtonText: '确认交卷',
      cancelButtonText: '取消',
    });
  } catch {
    return;
  }
  await doSubmit(false);
}

/** 暂存并退出：保留已作答内容，回到「我的考试」（倒计时不暂停） */
async function handleSaveExit(): Promise<void> {
  if (submitted.value) return;
  try {
    await ElMessageBox.confirm(
      settingsStore.settings.abnormalExitResumePolicy === 'admin_required'
        ? '暂存并退出？已作答内容会保留，但再次进入需要管理员恢复（倒计时不会暂停）。'
        : '暂存并退出？已作答内容会保留，再次进入可从当前进度继续（倒计时不会暂停）。',
      '暂存退出',
      { type: 'info', confirmButtonText: '暂存并退出', cancelButtonText: '继续作答' },
    );
  } catch {
    return;
  }
  if (saveTimer) window.clearTimeout(saveTimer);
  await silenceSave();
  void router.push('/exam/my');
}

async function doSubmit(auto: boolean): Promise<void> {
  if (submitted.value) return;
  submitting.value = true;
  try {
    if (saveTimer) window.clearTimeout(saveTimer);
    const res = await recordsApi.submit(recordId, auto);
    submitted.value = true;
    if (tickTimer) window.clearInterval(tickTimer);
    // 弹窗展示考试结果（成绩明细由用户点击按钮后再看）
    result.value = res;
    resultVisible.value = true;
  } catch {
    // 错误提示已由 http.ts 响应拦截器统一弹出
  } finally {
    submitting.value = false;
  }
}

/* ------------------------------ 交卷结果弹窗 ------------------------------ */
const resultVisible = ref(false);
const result = ref<ExamRecord | null>(null);

function gotoScoreDetail(): void {
  resultVisible.value = false;
  void router.replace(`/score-detail/${recordId}`);
}

function gotoMyExams(): void {
  resultVisible.value = false;
  void router.replace('/exam/my');
}

/* ------------------------------ 其它 ------------------------------ */
function jump(index: number): void {
  currentIndex.value = index;
  const el = document.getElementById(`question-${index}`);
  el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function beforeUnloadHandler(event: BeforeUnloadEvent): void {
  if (submitted.value) return;
  event.preventDefault();
  event.returnValue = '';
}
</script>

<template>
  <div
    class="taking"
    @copy="guardCopy"
    @cut="guardCopy"
    @contextmenu="guardCopy"
    @selectstart="guardCopy"
    @dragstart="guardCopy"
  >
    <!-- 防泄题浮水印（pointer-events: none，不影响作答） -->
    <div v-if="watermarkEnabled" class="taking__watermark" aria-hidden="true">
      <span v-for="n in 40" :key="n" class="taking__watermark-text">{{ watermarkText }}</span>
    </div>

    <!-- 全屏品牌脉冲（进入考试，冷启动 > 800ms 场景，Loading 方案 ① 深底态） -->
    <BootSplash :show="loading" dark caption="正在准备考试…" />

    <template v-if="record && exam">
      <!-- 顶部固定栏（设计稿 .exambar） -->
      <header class="taking__bar">
        <div class="taking__brand">
          <span class="taking__mark">考</span>
          <div class="taking__brand-text">
            <span class="taking__name" :title="exam.name">{{ exam.name }}</span>
            <span class="taking__sub">
              {{ exam.examMode === 'open' ? '开卷' : '闭卷' }} · 共 {{ questions.length }} 题 · 满分
              {{ formatScore(record.paperSnapshot.totalScore) }} 分<template v-if="attemptNo > 1">
                · 第 {{ attemptNo }} 次作答</template
              >
            </span>
          </div>
        </div>

        <div class="taking__bar-sp" />

        <div class="taking__status">
          <span v-if="cheatCount > 0" class="taking__cheat">
            <el-icon><Warning /></el-icon>
            切屏 {{ cheatCount }} 次 / {{ cheatAwayTotal }} 秒
          </span>
          <span v-if="record.extraMinutes" class="taking__extra">含加时 {{ record.extraMinutes }} 分钟</span>
          <CountdownTimer :remaining-seconds="remaining" />
        </div>

        <div class="taking__progress-wrap">
          <div class="taking__progress" role="img" :aria-label="`作答进度 ${progressPercent}%`">
            <span class="taking__progress-fill" :style="{ width: `${progressPercent}%` }" />
          </div>
          <span class="taking__progress-text">已答 {{ answeredCount }} / {{ questions.length }}</span>
        </div>

        <div class="taking__bar-actions">
          <el-button :disabled="submitted" @click="handleSaveExit">暂存退出</el-button>
          <el-button type="primary" :loading="submitting" :disabled="submitted" @click="handleSubmit">
            交卷
          </el-button>
        </div>
      </header>

      <!-- 主体：左答题区 + 右吸顶答题卡（设计稿 .ans-wrap） -->
      <div class="taking__wrap">
        <div class="taking__main">
          <div v-if="cheatCount > 0" class="taking__tip">
            <el-icon class="taking__tip-icon"><Warning /></el-icon>
            <div>
              系统检测到你在本场考试中离开页面 <b>{{ cheatCount }}</b> 次、累计
              <b>{{ cheatAwayTotal }}</b> 秒。考试期间请保持本页面为当前窗口，累计离开超过
              <b>{{ settingsStore.settings.cheatSecondsThreshold }}</b> 秒将记为异常。
            </div>
          </div>

          <section class="taking__questions" :class="{ 'is-disabled': submitted }">
            <div
              v-for="(item, index) in questions"
              :id="`question-${index}`"
              :key="item.questionId"
              class="taking__question"
            >
              <QuestionCard
                :index="index"
                :question="item.question"
                :score="item.score"
                :model-value="answers[item.questionId] ?? []"
                @update:model-value="(value) => updateAnswer(item.questionId, value)"
              />
            </div>
          </section>
        </div>

        <aside class="taking__aside">
          <!-- 考生信息卡（答题卡上方） -->
          <el-card class="taking__who" shadow="never">
            <span class="taking__who-av">{{ userName.slice(0, 1) }}</span>
            <span class="taking__who-meta">
              <span class="taking__who-name">{{ userName }}</span>
              <span class="taking__who-sub">
                {{ userDepartment || '考生' }}<template v-if="userDepartment"> · 考生</template>
              </span>
            </span>
          </el-card>

          <el-card class="taking__sheet" shadow="never">
            <AnswerSheet
              :questions="questions.map((q) => ({ id: q.questionId, type: q.question.type }))"
              :answers="answers"
              :current-index="currentIndex"
              @jump="jump"
            />
          </el-card>

          <div class="taking__note">
            <el-icon class="taking__note-icon"><InfoFilled /></el-icon>
            <span>
              作答内容自动暂存；{{ settingsStore.settings.abnormalExitResumePolicy === 'admin_required'
                ? '退出后需管理员恢复方可继续作答'
                : '异常退出后重新进入可继续作答' }}，倒计时不暂停。
            </span>
          </div>
        </aside>
      </div>

      <VisibilityGuard :disabled="submitted" @away="onAway" />
    </template>

    <ExamResultDialog
      v-model="resultVisible"
      :result="result"
      :exam-name="exam?.name ?? ''"
      :pass-score="exam?.passScore"
      @back="gotoMyExams"
      @detail="gotoScoreDetail"
    />
  </div>
</template>

<style scoped lang="scss">
@use '@/styles/variables.scss' as *;

.taking {
  min-height: 100vh;
  background: $bg-page;

  &__watermark {
    position: fixed;
    inset: 0;
    z-index: 150;
    pointer-events: none;
    display: flex;
    flex-wrap: wrap;
    align-content: flex-start;
    gap: 56px 96px;
    padding: 48px 24px;
    overflow: hidden;
  }

  &__watermark-text {
    flex: 0 0 auto;
    font-size: 15px;
    font-weight: 600;
    letter-spacing: 2px;
    color: rgba(13, 18, 32, 0.06);
    transform: rotate(-24deg);
    user-select: none;
    white-space: nowrap;
  }

  /* 顶栏：56px 单层（设计稿 .exambar） */
  &__bar {
    position: sticky;
    top: 0;
    z-index: 100;
    display: flex;
    align-items: center;
    gap: 14px;
    height: 56px;
    padding: 0 $page-padding;
    background: $bg-paper;
    border-bottom: 1px solid $border-color;
  }

  &__brand {
    display: flex;
    align-items: center;
    gap: 10px;
    min-width: 0;
  }

  &__mark {
    flex: 0 0 26px;
    display: grid;
    place-items: center;
    width: 26px;
    height: 26px;
    border-radius: $radius-sm;
    background: $color-primary;
    font-size: 11.5px;
    font-weight: 700;
    color: #fff;
  }

  &__brand-text {
    display: flex;
    flex-direction: column;
    gap: 1px;
    min-width: 0;
  }

  &__name {
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
    font-size: 13px;
    font-weight: 600;
    color: $text-primary;
  }

  &__sub {
    font-size: 11px;
    color: $text-secondary;
    white-space: nowrap;
  }

  &__bar-sp {
    flex: 1;
    min-width: 8px;
  }

  &__status,
  &__progress-wrap,
  &__bar-actions {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
  }

  &__cheat {
    flex: 0 0 auto;
    display: inline-flex;
    align-items: center;
    gap: 5px;
    height: 22px;
    padding: 0 8px;
    border-radius: $radius-xs;
    background: $color-warning-bg;
    border: 1px solid $color-warning-border;
    font-size: 11.5px;
    font-weight: 550;
    color: $color-warning-text;
    white-space: nowrap;
  }

  &__extra {
    flex: 0 0 auto;
    display: inline-flex;
    align-items: center;
    height: 22px;
    padding: 0 8px;
    border-radius: $radius-xs;
    background: $color-neutral-bg;
    font-size: 11.5px;
    color: $text-secondary;
    white-space: nowrap;
  }

  &__progress {
    flex: 0 0 170px;
    width: 170px;
    height: 5px;
    border-radius: 3px;
    background: $color-neutral-bg;
    overflow: hidden;
  }

  &__progress-fill {
    display: block;
    height: 100%;
    border-radius: 3px;
    background: $color-primary;
    transition: width $transition-base;
  }

  &__progress-text {
    flex: 0 0 auto;
    font-size: 12px;
    color: $text-secondary;
    white-space: nowrap;
    font-variant-numeric: tabular-nums;
  }

  /* 主体：左答题 + 右吸顶答题卡 */
  &__wrap {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 262px;
    align-items: start;
    gap: 16px;
    max-width: 1400px;
    margin: 0 auto;
    padding: 20px $page-padding 40px;
  }

  &__main {
    display: flex;
    flex-direction: column;
    gap: 12px;
    min-width: 0;
  }

  /* 切屏异常警示条（设计稿 .tip--warn） */
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
  }

  &__tip-icon {
    margin-top: 2px;
    flex: 0 0 auto;
  }

  &__questions {
    display: flex;
    flex-direction: column;
    gap: 12px;

    &.is-disabled {
      pointer-events: none;
      opacity: 0.75;
    }
  }

  &__question {
    /* 答题卡跳转时避免被吸顶栏遮挡 */
    scroll-margin-top: 76px;
  }

  &__aside {
    display: flex;
    flex-direction: column;
    gap: 12px;
    position: sticky;
    top: 76px;
    height: calc(100dvh - 92px);
    max-height: calc(100dvh - 92px);
    overflow: hidden;
  }

  // 答题卡上方的考生信息卡
  &__who {
    --el-card-padding: 10px 14px;
    flex: 0 0 auto;

    :deep(.el-card__body) {
      display: flex;
      align-items: center;
      gap: 10px;
    }
  }

  &__who-av {
    width: 30px;
    height: 30px;
    flex: 0 0 30px;
    display: grid;
    place-items: center;
    border-radius: 50%;
    background: $color-primary;
    color: #fff;
    font-size: 12px;
    font-weight: 600;
  }

  &__who-meta {
    display: flex;
    flex-direction: column;
    min-width: 0;
    line-height: 1.3;
  }

  &__who-name {
    font-size: 13px;
    font-weight: 600;
    color: $text-primary;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  &__who-sub {
    font-size: 11px;
    color: $text-secondary;
  }

  &__sheet {
    --el-card-padding: 14px;
    display: flex;
    flex: 1 1 auto;
    min-height: 0;
    flex-direction: column;

    :deep(.el-card__body) {
      flex: 1 1 auto;
      min-height: 0;
      overflow-y: auto;
      overscroll-behavior: contain;
      scrollbar-gutter: stable;
    }
  }

  /* 自动暂存说明 */
  &__note {
    display: flex;
    flex: 0 0 auto;
    align-items: flex-start;
    gap: 8px;
    padding: 12px 14px;
    border: 1px solid $border-color;
    border-radius: $radius-base;
    background: $bg-paper;
    font-size: 12px;
    line-height: 1.6;
    color: $text-secondary;
  }

  &__note-icon {
    margin-top: 2px;
    flex: 0 0 auto;
    font-size: 14px;
    color: $color-info-text;
  }

  @media (max-width: 1100px) {
    &__sub {
      display: none;
    }

    &__wrap {
      grid-template-columns: minmax(0, 1fr);
    }

    &__aside {
      position: static;
      height: auto;
      max-height: none;
      overflow: visible;
    }

    &__sheet {
      flex: none;

      :deep(.el-card__body) {
        overflow: visible;
      }
    }
  }

  @media (max-width: 900px) {
    padding-bottom: calc(70px + env(safe-area-inset-bottom));

    &__bar {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 8px 12px;
      height: auto;
      min-height: 70px;
      padding: 9px 12px;
      box-sizing: border-box;
    }

    &__brand { min-width: 0; }
    &__mark { flex-basis: 28px; width: 28px; height: 28px; }
    &__name { font-size: 14px; }
    &__sub,
    &__bar-sp,
    &__cheat,
    &__extra { display: none; }

    &__status {
      justify-content: flex-end;

      :deep(.countdown) {
        height: 32px;
        padding-inline: 10px;
        white-space: nowrap;
      }
    }

    &__progress-wrap {
      grid-column: 1 / -1;
      width: 100%;
    }
    &__progress { flex: 1 1 auto; width: auto; }
    &__progress-text { font-size: 11px; }

    &__bar-actions {
      position: fixed;
      inset: auto 0 0;
      z-index: 120;
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      padding: 10px 12px calc(10px + env(safe-area-inset-bottom));
      background: rgba(255, 255, 255, 0.97);
      border-top: 1px solid $border-color;
      backdrop-filter: blur(12px);

      :deep(.el-button) {
        width: 100%;
        height: 40px;
        margin-left: 0;
      }
    }

    &__wrap {
      display: block;
      padding: 12px 12px 20px;
    }
    &__main { gap: 10px; }
    &__questions { gap: 10px; }
    &__question { scroll-margin-top: 92px; }

    // 手机按连续作答流展示，不渲染桌面右侧答题卡及考生信息。
    &__aside { display: none; }
    &__watermark { gap: 52px 64px; padding: 40px 12px; }
  }
}
</style>
