<script setup lang="ts">
/**
 * 练题端 · 学习报告（底部导航第 3 个 Tab，二期）。
 *
 * 数据来源（全部服务端聚合，忽略任何客户端计数）：
 *   - `GET /api/practice/report/summary`  总览 + 连续打卡 + 今日任务量
 *   - `GET /api/practice/report/trend`    近 7 / 30 日趋势（无记录日补 0）
 *   - `GET /api/practice/report/subjects` 科目掌握度（正确率升序，weak 标记）
 *   - `GET /api/practice/report/banks`    开放题库概览
 *   - `GET /api/practice/daily`           今日任务（每日一练关闭时 enabled=false）
 *
 * 仅移动端；视觉沿用「冷静蓝 · 商务风」。
 */
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import PracticeLayout from '@/layouts/PracticeLayout.vue';
import PracticeTrendChart from './components/PracticeTrendChart.vue';
import * as practiceApi from '@/api/practice';
import { usePracticeAuthStore } from '@/stores/practiceAuth';
import type {
  PracticeBankStat,
  PracticeDailyTask,
  PracticeReportSummary,
  PracticeSubjectStat,
  PracticeTrendPoint,
} from '@/types';

const router = useRouter();
const practiceAuth = usePracticeAuthStore();

const loading = ref(true);
const summary = ref<PracticeReportSummary | null>(null);
const trend = ref<PracticeTrendPoint[]>([]);
const subjects = ref<PracticeSubjectStat[]>([]);
const banks = ref<PracticeBankStat[]>([]);
const daily = ref<PracticeDailyTask | null>(null);

/** 趋势区间（7 / 30 天） */
const trendDays = ref<7 | 30>(7);
const trendLoading = ref(false);

const userName = computed<string>(() => practiceAuth.currentUser?.name ?? '');

/** 今日任务是否可用（开启且有题） */
const dailyAvailable = computed<boolean>(
  () => Boolean(daily.value?.enabled) && (daily.value?.total ?? 0) > 0,
);

/** 今日任务进度文案 */
const dailyProgressText = computed<string>(() => {
  const d = daily.value;
  if (!d || !d.enabled || d.total === 0) return '';
  return d.completed ? `今日已全部完成（${d.total} 题）` : `已答 ${d.doneCount} / ${d.total} 题`;
});

/** 题库概览进度百分比 */
function bankPercent(item: PracticeBankStat): number {
  return item.totalCount > 0 ? Math.round((item.doneCount / item.totalCount) * 100) : 0;
}

/** 加载全部报告数据 */
async function load(): Promise<void> {
  loading.value = true;
  try {
    const [s, t, sub, b, d] = await Promise.all([
      practiceApi.reportSummary(),
      practiceApi.reportTrend(trendDays.value),
      practiceApi.reportSubjects(),
      practiceApi.reportBanks(),
      practiceApi.daily().catch(() => null),
    ]);
    summary.value = s;
    trend.value = t;
    subjects.value = sub;
    banks.value = b;
    daily.value = d;
  } catch {
    // 错误提示已由 http 拦截器统一弹出
  } finally {
    loading.value = false;
  }
}

/** 切换趋势区间 */
async function switchDays(days: 7 | 30): Promise<void> {
  if (trendDays.value === days) return;
  trendDays.value = days;
  trendLoading.value = true;
  try {
    trend.value = await practiceApi.reportTrend(days);
  } catch {
    /* 提示已统一 */
  } finally {
    trendLoading.value = false;
  }
}

/** 去完成今日一练 */
function goDaily(): void {
  void router.push({ name: 'practice-session', params: { bankId: 'daily' }, query: { source: 'daily' } });
}

/** 去练某题库 */
function goBank(bankId: string): void {
  void router.push({ name: 'practice-session', params: { bankId }, query: { mode: 'sequence' } });
}

onMounted(load);
</script>

<template>
  <PracticeLayout tabbar>
    <template #actions>
      <span class="rpt__user">{{ userName }}</span>
    </template>

    <div class="rpt">
      <div v-if="loading" class="rpt__skeleton">
        <el-skeleton :rows="3" animated />
        <el-skeleton :rows="4" animated />
      </div>

      <template v-else>
        <!-- 总览 -->
        <div class="rpt__hero">
          <div class="rpt__hero-left">
            <p class="rpt__hero-title">学习报告</p>
            <p class="rpt__hero-sub">基于每次练习的首次作答记录统计</p>
          </div>
          <div class="rpt__streak">
            <span class="rpt__streak-num">{{ summary?.streakDays ?? 0 }}</span>
            <span class="rpt__streak-label">连续打卡（天）</span>
          </div>
        </div>

        <div class="rpt__stats">
          <div class="rpt__stat">
            <span class="rpt__num">{{ summary?.doneTotal ?? 0 }}</span>
            <span class="rpt__label">累计练题</span>
          </div>
          <div class="rpt__stat">
            <span class="rpt__num rpt__num--ok">{{ summary?.correctTotal ?? 0 }}</span>
            <span class="rpt__label">累计答对</span>
          </div>
          <div class="rpt__stat">
            <span class="rpt__num">{{ summary?.accuracy ?? 0 }}%</span>
            <span class="rpt__label">正确率</span>
          </div>
          <div class="rpt__stat">
            <span class="rpt__num rpt__num--err">{{ summary?.wrongTotal ?? 0 }}</span>
            <span class="rpt__label">错题数</span>
          </div>
        </div>

        <!-- 今日一练 -->
        <template v-if="dailyAvailable">
          <div class="rpt__section">今日一练</div>
          <div class="rpt__daily" :class="{ 'is-done': daily?.completed }">
            <div class="rpt__daily-body">
              <span class="rpt__daily-title">
                {{ daily?.completed ? '今日已完成' : '今日任务待完成' }}
              </span>
              <span class="rpt__daily-sub">{{ dailyProgressText }}</span>
            </div>
            <el-button v-if="!daily?.completed" type="primary" size="small" @click="goDaily">
              去完成
            </el-button>
          </div>
        </template>

        <!-- 趋势 -->
        <div class="rpt__section">
          练题趋势
          <span class="rpt__switch">
            <button
              type="button"
              class="rpt__switch-btn"
              :class="{ 'is-active': trendDays === 7 }"
              @click="switchDays(7)"
            >
              近 7 天
            </button>
            <button
              type="button"
              class="rpt__switch-btn"
              :class="{ 'is-active': trendDays === 30 }"
              @click="switchDays(30)"
            >
              近 30 天
            </button>
          </span>
        </div>
        <div class="rpt__card" :class="{ 'is-loading': trendLoading }">
          <PracticeTrendChart :points="trend" />
        </div>

        <!-- 科目掌握度 -->
        <div class="rpt__section">科目掌握度</div>
        <div class="rpt__card">
          <p v-if="subjects.length === 0" class="rpt__empty">还没有作答记录，先去练几道题吧</p>
          <div v-for="item in subjects" :key="item.subject" class="rpt__subject">
            <div class="rpt__subject-top">
              <span class="rpt__subject-name">{{ item.subject }}</span>
              <span v-if="item.weak" class="rpt__weak">薄弱</span>
              <span class="rpt__subject-acc">{{ item.accuracy }}%</span>
            </div>
            <div class="rpt__bar" role="img" :aria-label="`正确率 ${item.accuracy}%`">
              <span class="rpt__bar-fill" :style="{ width: `${item.accuracy}%` }" />
            </div>
            <p class="rpt__subject-meta">已练 {{ item.doneCount }} 题 · 答对 {{ item.correctCount }} 题</p>
          </div>
        </div>

        <!-- 题库概览 -->
        <div class="rpt__section">题库进度</div>
        <div class="rpt__card">
          <p v-if="banks.length === 0" class="rpt__empty">暂无可练习的题库</p>
          <button
            v-for="item in banks"
            :key="item.bankId"
            type="button"
            class="rpt__bank"
            @click="goBank(item.bankId)"
          >
            <div class="rpt__bank-top">
              <span class="rpt__bank-name">{{ item.bankName }}</span>
              <span class="rpt__bank-acc">正确率 {{ item.accuracy }}%</span>
            </div>
            <div class="rpt__bar">
              <span class="rpt__bar-fill" :style="{ width: `${bankPercent(item)}%` }" />
            </div>
            <p class="rpt__bank-meta">
              已练 {{ item.doneCount }} / {{ item.totalCount }} 题
              <template v-if="item.doneCount === 0"> · 尚未开始</template>
            </p>
          </button>
        </div>

        <p class="rpt__tip">统计口径与考试一致（每题以首次作答为准）；练题数据独立保存，不影响考试成绩。</p>
      </template>
    </div>
  </PracticeLayout>
</template>

<style scoped lang="scss">
@use '@/styles/variables.scss' as *;

.rpt {
  &__user {
    max-width: 120px;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  &__skeleton {
    padding: 18px;
    background: #fff;
    border: 1px solid $practice-border;
    border-radius: $practice-radius;

    :deep(.el-skeleton) {
      margin-bottom: 12px;
    }
  }

  /* 顶部：标题 + 连续打卡 */
  &__hero {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 16px;
    margin-bottom: 12px;
    background: #fff;
    border: 1px solid $practice-border;
    border-left: 3px solid $practice-primary;
    border-radius: $practice-radius;
  }

  &__hero-title {
    margin: 0;
    font-size: 16px;
    font-weight: 700;
    color: $text-primary;
  }

  &__hero-sub {
    margin: 4px 0 0;
    font-size: 12px;
    color: $text-secondary;
  }

  &__streak {
    flex: 0 0 auto;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
    padding: 6px 12px;
    border: 1px solid $practice-border;
    border-radius: $practice-radius-sm;
    background: $practice-soft;
  }

  &__streak-num {
    font-size: 20px;
    font-weight: 700;
    color: $practice-primary;
    font-variant-numeric: tabular-nums;
    line-height: 1.1;
  }

  &__streak-label {
    font-size: 11px;
    color: $practice-primary;
  }

  &__stats {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
    margin-bottom: 20px;
  }

  &__stat {
    padding: 14px 12px;
    background: #fff;
    border: 1px solid $practice-border;
    border-radius: $practice-radius;
  }

  &__num {
    display: block;
    font-size: 22px;
    font-weight: 700;
    color: $practice-primary;
    font-variant-numeric: tabular-nums;

    &--ok {
      color: $color-success-text;
    }

    &--err {
      color: $color-error-text;
    }
  }

  &__label {
    display: block;
    margin-top: 4px;
    font-size: 12px;
    color: $text-secondary;
  }

  /* 区块标题（沿用练题端左强调条） */
  &__section {
    display: flex;
    align-items: center;
    gap: 8px;
    position: relative;
    margin: 0 0 10px;
    padding-left: 10px;
    font-size: 13px;
    font-weight: 700;
    color: $text-primary;

    &::before {
      content: '';
      position: absolute;
      top: 50%;
      left: 0;
      width: 3px;
      height: 13px;
      margin-top: -6.5px;
      border-radius: 2px;
      background: $practice-primary;
    }
  }

  &__switch {
    display: inline-flex;
    margin-left: auto;
    border: 1px solid $practice-border;
    border-radius: $practice-radius-sm;
    overflow: hidden;
    background: #fff;
  }

  &__switch-btn {
    min-height: 28px;
    padding: 0 10px;
    border: none;
    background: transparent;
    font-size: 11px;
    color: $text-secondary;
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;

    &.is-active {
      background: $practice-primary;
      color: #fff;
      font-weight: 600;
    }
  }

  &__card {
    padding: 14px;
    margin-bottom: 20px;
    background: #fff;
    border: 1px solid $practice-border;
    border-radius: $practice-radius;
    transition: opacity $transition-fast;

    &.is-loading {
      opacity: 0.6;
    }
  }

  &__empty {
    margin: 0;
    padding: 12px 0;
    text-align: center;
    font-size: 13px;
    color: $text-disabled;
  }

  /* 今日一练 */
  &__daily {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 14px 16px;
    margin-bottom: 20px;
    background: #fff;
    border: 1px solid $practice-border;
    border-left: 3px solid $practice-primary;
    border-radius: $practice-radius;

    &.is-done {
      border-left-color: $color-success;
    }

    :deep(.el-button) {
      flex: 0 0 auto;
      border: none;
      border-radius: $practice-radius-sm;
      background: $practice-primary;

      &:hover,
      &:active {
        background: $practice-primary-dark;
      }
    }
  }

  &__daily-body {
    display: flex;
    flex-direction: column;
    gap: 3px;
    min-width: 0;
    flex: 1;
  }

  &__daily-title {
    font-size: 14px;
    font-weight: 700;
    color: $text-primary;
  }

  &__daily-sub {
    font-size: 12px;
    color: $text-secondary;
  }

  /* 科目掌握度 */
  &__subject {
    padding: 10px 0;

    & + & {
      border-top: 1px solid $practice-border;
    }
  }

  &__subject-top {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 7px;
  }

  &__subject-name {
    min-width: 0;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
    font-size: 14px;
    font-weight: 600;
    color: $text-primary;
  }

  &__weak {
    flex: 0 0 auto;
    padding: 1px 6px;
    border: 1px solid $color-error-border;
    border-radius: 4px;
    background: $color-error-bg;
    font-size: 11px;
    color: $color-error-text;
  }

  &__subject-acc {
    flex: 0 0 auto;
    margin-left: auto;
    font-size: 13px;
    font-weight: 700;
    color: $practice-primary;
    font-variant-numeric: tabular-nums;
  }

  &__subject-meta {
    margin: 6px 0 0;
    font-size: 11px;
    color: $text-secondary;
  }

  &__bar {
    height: 6px;
    border-radius: 3px;
    background: #eef1f6;
    overflow: hidden;
  }

  &__bar-fill {
    display: block;
    height: 100%;
    border-radius: 3px;
    background: $practice-primary;
    transition: width $transition-fast;
  }

  /* 题库概览 */
  &__bank {
    display: block;
    width: 100%;
    padding: 10px 0;
    border: none;
    background: transparent;
    text-align: left;
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;

    & + & {
      border-top: 1px solid $practice-border;
    }
  }

  &__bank-top {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 7px;
  }

  &__bank-name {
    min-width: 0;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
    font-size: 14px;
    font-weight: 600;
    color: $text-primary;
  }

  &__bank-acc {
    flex: 0 0 auto;
    margin-left: auto;
    font-size: 11px;
    color: $text-secondary;
  }

  &__bank-meta {
    margin: 6px 0 0;
    font-size: 11px;
    color: $text-secondary;
  }

  &__tip {
    margin: 0;
    font-size: 12px;
    line-height: 1.7;
    color: $text-disabled;
  }
}
</style>
