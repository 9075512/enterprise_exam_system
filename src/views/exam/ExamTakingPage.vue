<script setup lang="ts">
/**
 * 全屏答题页（W3-T1，全站逻辑最重）。
 * 快照答题 + 断点续答 + 倒计时（到时自动交卷）+ 节流暂存 + 切屏上报 + 交卷判分。
 * 不使用 AppLayout：自带顶部固定栏 / 左侧答题区 / 右侧答题卡 / 底部操作栏。
 */
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import dayjs from 'dayjs';
import { ElMessage, ElMessageBox } from 'element-plus';
import { ArrowLeft, Warning } from '@element-plus/icons-vue';
import * as examsApi from '@/api/exams';
import * as recordsApi from '@/api/records';
import { useAuthStore } from '@/stores/auth';
import { useSettingsStore } from '@/stores/settings';
import CountdownTimer from './components/CountdownTimer.vue';
import VisibilityGuard from './components/VisibilityGuard.vue';
import QuestionCard from './components/QuestionCard.vue';
import AnswerSheet from './components/AnswerSheet.vue';
import LoadingSkeleton from '@/components/common/LoadingSkeleton.vue';
import type { Exam, ExamRecord } from '@/types';

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();
const settingsStore = useSettingsStore();

const recordId = String(route.params.recordId ?? '');

const loading = ref(true);
const record = ref<ExamRecord | null>(null);
const exam = ref<Exam | null>(null);
const answers = ref<Record<string, number[]>>({});
const remaining = ref(0);
const submitted = ref(false);
const submitting = ref(false);
const cheatCount = ref(0);
const cheatAwayTotal = ref(0);
const currentIndex = ref(0);

/** 快照题目列表 */
const questions = computed(() => record.value?.paperSnapshot.questions ?? []);

/** 本次作答序号（>1 时标题旁展示标记） */
const attemptNo = computed<number>(() => record.value?.attemptNo ?? 1);

/** 已答 / 未答题数（底部操作栏实时进度） */
const answeredCount = computed<number>(
  () => questions.value.filter((q) => (answers.value[q.questionId]?.length ?? 0) > 0).length,
);
const unansweredCount = computed<number>(() => questions.value.length - answeredCount.value);

/** 姓名首字（头像占位） */
const avatarText = computed<string>(() => (auth.currentUser?.name ?? '').trim().slice(0, 1) || '考');

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

    // 倒计时基准：开考时刻 + 考试时长
    const deadline = dayjs(rec.startedAt).add(exam.value.durationMinutes, 'minute').valueOf();
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
function updateAnswer(questionId: string, value: number[]): void {
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
  if (cheatCount.value >= settingsStore.settings.cheatCountThreshold) {
    ElMessage.warning('检测到多次切屏，异常行为将被记录');
  }
}

/* ------------------------------ 交卷 ------------------------------ */
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

async function doSubmit(auto: boolean): Promise<void> {
  if (submitted.value) return;
  submitting.value = true;
  try {
    if (saveTimer) window.clearTimeout(saveTimer);
    const res = await recordsApi.submit(recordId, auto);
    submitted.value = true;
    if (tickTimer) window.clearInterval(tickTimer);
    ElMessage.success(`交卷成功，得分 ${res.score} 分`);
    void router.replace(`/score-detail/${recordId}`);
  } catch {
    // 错误提示已由 http.ts 响应拦截器统一弹出
  } finally {
    submitting.value = false;
  }
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
  <div class="taking">
    <LoadingSkeleton v-if="loading" :rows="8" />

    <template v-else-if="record && exam">
      <!-- 顶部固定栏 -->
      <header class="taking__header">
        <div class="taking__header-left">
          <button type="button" class="taking__back" aria-label="返回（需先交卷）" @click="handleSubmit">
            <el-icon><ArrowLeft /></el-icon>
          </button>
          <span class="taking__title" :title="exam.name">{{ exam.name }}</span>
          <el-tag v-if="attemptNo > 1" size="small" type="warning" effect="light" round>
            第 {{ attemptNo }} 次作答
          </el-tag>
          <span v-if="auth.currentUser" class="taking__examinee">
            <span class="taking__avatar">{{ avatarText }}</span>
            <span class="taking__examinee-name">{{ auth.currentUser.name }}</span>
            <span class="taking__examinee-dept">
              {{ auth.currentUser.departmentName || '未分配科室' }}
            </span>
          </span>
        </div>
        <div class="taking__header-right">
          <span v-if="cheatCount > 0" class="taking__cheat">
            <el-icon><Warning /></el-icon>
            切屏 {{ cheatCount }} 次 / {{ cheatAwayTotal }} 秒
          </span>
          <CountdownTimer :remaining-seconds="remaining" />
        </div>
      </header>

      <!-- 主体 -->
      <main class="taking__body">
        <section
          class="taking__questions"
          :class="{ 'taking__questions--disabled': submitted }"
        >
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

        <aside class="taking__aside">
          <AnswerSheet
            :questions="questions.map((q) => ({ id: q.questionId, type: q.question.type }))"
            :answers="answers"
            :current-index="currentIndex"
            @jump="jump"
          />
        </aside>
      </main>

      <!-- 底部操作栏 -->
      <footer class="taking__footer">
        <div class="taking__progress">
          <span class="taking__progress-item">
            已答 <b class="num">{{ answeredCount }}</b> / {{ questions.length }}
          </span>
          <span class="taking__progress-sep" aria-hidden="true" />
          <span class="taking__progress-item taking__progress-item--muted">
            未答 <b class="num">{{ unansweredCount }}</b>
          </span>
        </div>
        <div class="taking__footer-right">
          <span class="taking__footer-hint">答案将自动暂存；倒计时结束将自动交卷。</span>
          <el-button
            class="taking__submit"
            type="primary"
            size="large"
            :loading="submitting"
            :disabled="submitted"
            @click="handleSubmit"
          >
            交 卷
          </el-button>
        </div>
      </footer>

      <VisibilityGuard :disabled="submitted" @away="onAway" />
    </template>
  </div>
</template>

<style scoped lang="scss">
@use '@/styles/variables.scss' as *;

.taking {
  min-height: 100vh;
  background: $bg-page;

  &__header {
    position: sticky;
    top: 0;
    z-index: 100;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    height: 64px;
    padding: 0 24px;
    background: rgba(255, 255, 255, 0.88);
    backdrop-filter: blur(10px);
    border-bottom: 1px solid $border-color;
    box-shadow: $shadow-sm;

    /* 顶部品牌渐变细条 */
    &::before {
      content: '';
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      height: 3px;
      background: $gradient-brand;
    }
  }

  &__header-left {
    display: flex;
    align-items: center;
    gap: 12px;
    min-width: 0;
  }

  &__back {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    width: 34px;
    height: 34px;
    padding: 0;
    border: 1px solid $border-color;
    border-radius: $radius-sm;
    background: $bg-paper;
    font-size: 17px;
    color: $text-secondary;
    cursor: pointer;
    transition: color $transition-fast, border-color $transition-fast, background-color $transition-fast;

    &:hover {
      color: $color-primary;
      border-color: rgba($color-primary, 0.4);
      background: $color-primary-soft;
    }
  }

  &__title {
    flex-shrink: 0;
    max-width: 320px;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
    font-size: 16px;
    font-weight: 600;
    color: $text-primary;
  }

  &__examinee {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
    padding-left: 12px;
    border-left: 1px solid $border-color;
  }

  &__avatar {
    flex-shrink: 0;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    border-radius: 50%;
    background: $gradient-brand;
    font-size: 13px;
    font-weight: 600;
    color: #fff;
  }

  &__examinee-name {
    flex-shrink: 0;
    font-size: 14px;
    font-weight: 500;
    color: $text-primary;
  }

  &__examinee-dept {
    flex-shrink: 0;
    padding: 2px 10px;
    border-radius: 999px;
    background: $color-table-head;
    border: 1px solid $border-color;
    font-size: 12px;
    color: $text-secondary;
  }

  &__header-right {
    display: flex;
    align-items: center;
    gap: 16px;
    flex-shrink: 0;
  }

  &__cheat {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 5px 12px;
    border-radius: 999px;
    background: rgba($color-error, 0.08);
    border: 1px solid rgba($color-error, 0.22);
    font-size: 12px;
    font-weight: 500;
    color: $color-error;
  }

  &__body {
    display: flex;
    align-items: flex-start;
    gap: 24px;
    max-width: 1280px;
    margin: 0 auto;
    padding: 24px 24px 112px;
  }

  &__questions {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 18px;

    &--disabled {
      pointer-events: none;
      opacity: 0.75;
    }
  }

  &__question {
    /* 答题卡跳转时避免被吸顶栏遮挡 */
    scroll-margin-top: 84px;
  }

  &__aside {
    flex: 0 0 280px;
    width: 280px;
    position: sticky;
    top: 88px;
    background: $bg-paper;
    border: 1px solid $border-color;
    border-radius: $radius-lg;
    box-shadow: $shadow-sm;
    padding: 18px;
  }

  &__footer {
    position: fixed;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 100;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    height: 72px;
    padding: 0 24px;
    background: rgba(255, 255, 255, 0.9);
    backdrop-filter: blur(10px);
    border-top: 1px solid $border-color;
    box-shadow: 0 -2px 10px rgba(16, 24, 40, 0.06);
  }

  &__progress {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  &__progress-item {
    display: inline-flex;
    align-items: baseline;
    gap: 4px;
    font-size: 13px;
    color: $text-secondary;

    b {
      font-size: 18px;
      font-weight: 700;
      color: $color-primary;
    }

    &--muted b {
      color: $color-warning;
    }
  }

  &__progress-sep {
    width: 1px;
    height: 14px;
    background: $border-color;
  }

  &__footer-right {
    display: flex;
    align-items: center;
    gap: 18px;
    min-width: 0;
  }

  &__footer-hint {
    font-size: 13px;
    color: $text-disabled;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  &__submit {
    padding: 0 34px;
    font-weight: 600;
    letter-spacing: 3px;
    border: none;
    background: $gradient-brand;
    box-shadow: 0 8px 18px -8px rgba(37, 99, 235, 0.75);
    transition: box-shadow $transition-base, transform $transition-fast, filter $transition-fast;

    &:hover,
    &:focus {
      background: $gradient-brand;
      filter: brightness(1.06);
      box-shadow: 0 10px 22px -8px rgba(37, 99, 235, 0.85);
    }

    &:active {
      transform: translateY(1px);
    }

    &.is-disabled,
    &.is-loading {
      background: $gradient-brand;
      opacity: 0.6;
      box-shadow: none;
      filter: none;
    }
  }

  @media (max-width: 900px) {
    &__footer-hint {
      display: none;
    }

    &__title {
      max-width: 160px;
    }
  }
}
</style>
