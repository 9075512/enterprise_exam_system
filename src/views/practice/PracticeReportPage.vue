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
 * 桌面与移动端统一采用 Workbuddy 白卡、蓝色操作与16 px圆角。
 */
import { computed, onMounted, ref } from 'vue';
import { useRequest } from '@/composables/useRequest';
import { useRouter } from 'vue-router';
import PracticeLayout from '@/layouts/PracticeLayout.vue';
import RequestError from '@/components/common/RequestError.vue';
import EmptyState from '@/components/common/EmptyState.vue';
import PracticeLoading from '@/components/common/PracticeLoading.vue';
import PagedOverview from '@/components/common/PagedOverview.vue';
import PracticeTrendChart from './components/PracticeTrendChart.vue';
import * as practiceApi from '@/api/practice';
import { usePracticeAuthStore } from '@/stores/practiceAuth';
import type {
  PracticeBankStat,
  PracticeTrendPoint,
} from '@/types';

const router = useRouter();
const practiceAuth = usePracticeAuthStore();

const loading = ref(true);
const requestOptions = { immediate: false, keepPreviousData: false };
const { data: summary, loading: summaryLoading, error: loadError, refresh: loadSummary } = useRequest(practiceApi.reportSummary, [], requestOptions);
const { data: subjectData, loading: subjectsLoading, error: subjectsError, refresh: loadSubjects } = useRequest(practiceApi.reportSubjects, [], requestOptions);
const { data: bankData, loading: banksLoading, error: banksError, refresh: loadBanks } = useRequest(practiceApi.reportBanks, [], requestOptions);
const { data: daily, loading: dailyLoading, error: dailyError, refresh: loadDaily } = useRequest(practiceApi.daily, [], requestOptions);
const subjects = computed(() => subjectData.value ?? []);
const banks = computed(() => bankData.value ?? []);
const trendError = ref(false);
const requestedDays = ref<7 | 30>(7);
const trend = ref<PracticeTrendPoint[]>([]);
let reportPending = false;

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

/**
 * 科目掌握度正确率色调（设计图 .sub__a：≥90 优 / ≥70 中 / 其余告警）。
 * 只改文字色，不表达「状态标签」语义（薄弱仍由 badge 承载）。
 */
function accTone(acc: number): string {
  if (acc >= 90) return 'is-ok';
  if (acc >= 70) return 'is-warn';
  return 'is-low';
}

/** 加载全部报告数据 */
async function load(): Promise<void> {
  if (reportPending || trendLoading.value) return;
  reportPending = true;
  loading.value = true;
  try { await Promise.all([loadSummary(), loadSubjects(), loadBanks(), loadDaily(), loadTrend(trendDays.value)]); }
  finally { reportPending = false; loading.value = false; }
}

async function loadTrend(days: 7 | 30): Promise<void> {
  requestedDays.value = days;
  trendLoading.value = true;
  trendError.value = false;
  try { trend.value = await practiceApi.reportTrend(days); trendDays.value = days; }
  catch { trendError.value = true; }
  finally { trendLoading.value = false; }
}

/** 切换趋势区间 */
async function switchDays(days: 7 | 30): Promise<void> {
  if ((trendDays.value === days && !trendError.value) || trendLoading.value) return;
  await loadTrend(days);
}

function goPracticeHome(): void { void router.push({ name: 'practice-home' }); }

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
  <PracticeLayout data-ui-layout="learning" data-ui-page="PracticeReportPage" tabbar>
    <template #actions>
      <span class="rpt__user">{{ userName }}</span>
    </template>

    <div class="rpt">
      <PracticeLoading v-if="loading" :loading="loading" :rows="6" caption="正在加载学习报告…" />

      <template v-else>
        <!-- 总览 -->
        <div class="rpt__hero">
          <div class="rpt__hero-left">
            <p class="rpt__hero-title">学习报告</p>
            <p class="rpt__hero-sub">基于每次练习的首次作答记录统计</p>
          </div>
          <div class="rpt__streak">
            <span class="rpt__streak-num">{{ summaryLoading || loadError ? '—' : summary?.streakDays ?? '—' }}</span>
            <span class="rpt__streak-label">连续打卡（天）</span>
          </div>
          <el-button :disabled="trendLoading" @click="load">刷新报告</el-button>
        </div>

        <div class="rpt__stats">
          <div class="rpt__stat">
            <span class="rpt__num">{{ summaryLoading || loadError ? '—' : summary?.doneTotal ?? '—' }}</span>
            <span class="rpt__label">累计练题</span>
          </div>
          <div class="rpt__stat">
            <span class="rpt__num rpt__num--ok">{{ summaryLoading || loadError ? '—' : summary?.correctTotal ?? '—' }}</span>
            <span class="rpt__label">累计答对</span>
          </div>
          <div class="rpt__stat">
            <span class="rpt__num">{{ !summaryLoading && !loadError && summary?.doneTotal ? `${summary.accuracy}%` : '—' }}</span>
            <span class="rpt__label">正确率</span>
          </div>
          <div class="rpt__stat">
            <span class="rpt__num rpt__num--err">{{ summaryLoading || loadError ? '—' : summary?.wrongTotal ?? '—' }}</span>
            <span class="rpt__label">错题数</span>
          </div>
        </div>

        <RequestError v-if="loadError" text="学习报告加载失败（总览统计暂不可用）" @retry="loadSummary" />
        <p class="learner-scope">当前账号累计首次作答记录；错题数为当前可见题库中的错题本条数，趋势限所选7 / 30天；未作答正确率显示“—”。</p>
        <!-- 今日一练 -->
        <RequestError v-if="dailyError" text="今日一练状态加载失败" @retry="loadDaily" />
        <PracticeLoading v-if="dailyLoading" :loading="true" compact caption="正在读取今日一练…" />
        <template v-if="dailyAvailable">
          <div class="rpt__section">今日一练</div>
          <div class="rpt__daily">
            <span class="rpt__daily-icon" aria-hidden="true">今日</span>
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
              :disabled="trendLoading"
              :class="{ 'is-active': trendDays === 7 }"
              :aria-pressed="trendDays === 7"
              @click="switchDays(7)"
            >
              近 7 天
            </button>
            <button
              type="button"
              class="rpt__switch-btn"
              :disabled="trendLoading"
              :class="{ 'is-active': trendDays === 30 }"
              :aria-pressed="trendDays === 30"
              @click="switchDays(30)"
            >
              近 30 天
            </button>
          </span>
        </div>
        <div class="rpt__card" :aria-busy="trendLoading">
          <PracticeLoading :loading="trendLoading" compact caption="正在更新趋势…" />
          <RequestError v-if="trendError" text="练题趋势加载失败" @retry="switchDays(requestedDays)" />
          <PracticeTrendChart v-else :points="trend" />
        </div>

        <!-- 科目掌握度 -->
        <div class="rpt__section">科目掌握度</div>
        <div class="rpt__card">
          <PracticeLoading v-if="subjectsLoading" :loading="true" compact caption="正在读取科目掌握度…" />
          <RequestError v-else-if="subjectsError" text="科目掌握度加载失败" @retry="loadSubjects" />
          <EmptyState v-else-if="subjects.length === 0" text="还没有作答记录，先去练几道题吧" action-text="去练题" @action="goPracticeHome" />
          <PagedOverview v-if="!subjectsLoading && !subjectsError" :items="subjects" title="科目掌握度" dialog-class="learning-overview-dialog">
            <template #default="{ items }">
              <div v-for="item in items" :key="item.subject" class="rpt__subject">
                <div class="rpt__subject-top">
                  <span class="rpt__subject-name">{{ item.subject }}</span>
                  <span v-if="item.weak" class="rpt__weak">薄弱</span>
                  <span class="rpt__subject-acc" :class="item.doneCount ? accTone(item.accuracy) : ''">{{ item.doneCount ? `${item.accuracy}%` : '未练' }}</span>
                </div>
                <div class="rpt__bar" role="img" :aria-label="item.doneCount ? `正确率 ${item.accuracy}%` : '尚未练习，暂无正确率'">
                  <span
                    class="rpt__bar-fill"
                    :class="{ 'is-weak': item.weak }"
                    :style="{ width: `${item.accuracy}%` }"
                  />
                </div>
                <p class="rpt__subject-meta">已练 {{ item.doneCount }} 题 · 答对 {{ item.correctCount }} 题</p>
              </div>
            </template>
          </PagedOverview>
        </div>

        <!-- 题库概览 -->
        <div class="rpt__section">题库进度</div>
        <div class="rpt__card">
          <PracticeLoading v-if="banksLoading" :loading="true" compact caption="正在读取题库进度…" />
          <RequestError v-else-if="banksError" text="题库进度加载失败" @retry="loadBanks" />
          <EmptyState v-else-if="banks.length === 0" text="暂无可练习的题库" action-text="返回练题首页" @action="goPracticeHome" />
          <PagedOverview v-if="!banksLoading && !banksError" :items="banks" title="题库进度" dialog-class="learning-overview-dialog">
            <template #default="{ items }">
              <button
                v-for="item in items"
                :key="item.bankId"
                type="button"
                class="rpt__bank"
                @click="goBank(item.bankId)"
              >
                <div class="rpt__bank-top">
                  <span class="rpt__bank-name">{{ item.bankName }}</span>
                  <span class="rpt__bank-acc">{{ item.doneCount ? `正确率 ${item.accuracy}%` : '尚未开始' }}</span>
                </div>
                <div class="rpt__bar">
                  <span class="rpt__bar-fill" :style="{ width: `${bankPercent(item)}%` }" />
                </div>
                <p class="rpt__bank-meta">
                  已练 {{ item.doneCount }} / {{ item.totalCount }} 题
                  <template v-if="item.doneCount === 0"> · 尚未开始</template>
                </p>
              </button>
            </template>
          </PagedOverview>
        </div>

        <p class="rpt__tip">累计统计采用练题首次作答记录；趋势限于所选 7 / 30 天。练题数据独立保存，不影响考试成绩。</p>
      </template>
    </div>
  </PracticeLayout>
</template>

<style scoped lang="scss">
@use '@/styles/variables.scss' as *;

.rpt {
  &__user {
    max-width: 120px;
    overflow-wrap: anywhere;
    white-space: normal;
  }

  &__skeleton {
    padding: 14px;
    background: $bg-paper;
    border: 1px solid $border-color;
    border-radius: $practice-radius;

    :deep(.el-skeleton) {
      margin-bottom: 12px;
    }
  }

  /* 顶部：标题、连续打卡与刷新入口，统一白色卡片。 */
  &__hero {
    display: flex;
    flex-wrap: wrap;
    .el-button { min-height: 44px; }
    align-items: center;
    gap: 12px;
    padding: 16px;
    margin-bottom: 10px;
    background: $bg-paper;
    border: 1px solid $border-color;
    color: $text-primary;
    border-radius: $practice-radius;
  }

  &__hero-title {
    margin: 0;
    font-size: 17px;
    font-weight: 660;
    color: $text-primary;
  }

  &__hero-sub {
    margin: 5px 0 0;
    font-size: 12px;
    line-height: 1.55;
    opacity: 0.85;
  }

  &__streak {
    flex: 0 0 auto;
    margin-left: auto;
    text-align: right;
  }

  &__streak-num {
    display: block;
    font-size: 24px;
    font-weight: 700;
    letter-spacing: -0.03em;
    line-height: 1;
    color: $text-primary;
    font-variant-numeric: tabular-nums;
    overflow-wrap: anywhere;
  }

  &__streak-label {
    font-size: 12px;
    opacity: 0.85;
  }

  &__stats {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 9px;
    margin-top: 10px;
  }

  &__stat {
    padding: 12px 13px;
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
    overflow-wrap: anywhere;

    &--ok {
      color: $color-success-text;
    }

    &--err {
      color: $color-error-text;
    }
  }

  &__label {
    display: block;
    margin-top: 3px;
    font-size: 12px;
    color: $text-secondary;
  }

  /* 区块标题（v3.1 去 3px 左强调条，设计图 .rp__sec） */
  &__section {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 18px 2px 9px;
    font-size: 14px;
    font-weight: 640;
    color: $text-primary;
  }

  /* 趋势区间切换（设计图 .rp__sw：灰底分段器 + 白滑块） */
  &__switch {
    display: inline-flex;
    margin-left: auto;
    padding: 2px;
    background: $practice-surface-3;
    border-radius: $radius-xs;
  }

  &__switch-btn {
    height: 22px;
    padding: 0 9px;
    border: none;
    border-radius: 4px;
    background: transparent;
    font-size: 12px;
    font-weight: 580;
    color: $text-secondary;
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;

    &.is-active {
      background: $bg-paper;
      color: $text-primary;
      font-weight: 620;
      box-shadow: 0 1px 2px rgba(13, 18, 32, 0.08);
    }
  }

  &__card {
    padding: 14px;
    margin-bottom: 18px;
    background: $bg-paper;
    border: 1px solid $border-color;
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
    font-size: 12px;
    color: $text-secondary;
  }

  /* 今日一练（设计图 .m-card .m-row：图标块 + 文案 + 按钮） */
  &__daily {
    display: flex;
    align-items: center;
    gap: 11px;
    padding: 14px;
    margin-bottom: 18px;
    background: $bg-paper;
    border: 1px solid $border-color;
    border-radius: $practice-radius;

    :deep(.el-button) {
      flex: 0 0 auto;
      min-height: 44px;
      padding: 0 13px;
      border: none;
      border-radius: $radius-sm;
      font-size: 12.5px;
      background: $practice-primary;

      &:hover,
      &:active {
        background: $practice-primary-dark;
      }
    }
  }

  &__daily-icon {
    flex: 0 0 auto;
    display: grid;
    place-items: center;
    width: 30px;
    height: 30px;
    border-radius: $radius-xs;
    background: $practice-soft;
    font-size: 12px;
    font-weight: 680;
    color: $practice-primary;
  }

  &__daily-body {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
    flex: 1;
  }

  &__daily-title {
    font-size: 13.5px;
    font-weight: 600;
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
      border-top: 1px solid $border-color;
    }
  }

  &__subject-top {
    flex-wrap: wrap;
    display: flex;
    align-items: center;
    gap: 7px;
    margin-bottom: 6px;
  }

  &__subject-name {
    min-width: 0;
    overflow-wrap: anywhere;
    white-space: normal;
    font-size: 12.5px;
    font-weight: 580;
    color: $text-primary;
  }

  &__weak {
    flex: 0 0 auto;
    display: inline-flex;
    align-items: center;
    height: 17px;
    padding: 0 6px;
    border-radius: 4px;
    background: $color-error-bg;
    font-size: 12px;
    font-weight: 620;
    color: $color-error-text;
  }

  &__subject-acc {
    flex: 0 0 auto;
    margin-left: auto;
    font-size: 12px;
    font-weight: 640;
    color: $text-primary;
    font-variant-numeric: tabular-nums;
    overflow-wrap: anywhere;

    &.is-ok {
      color: $color-success-text;
    }

    &.is-warn {
      color: $color-warning-text;
    }

    &.is-low {
      color: $color-error-text;
    }
  }

  &__subject-meta {
    margin: 5px 0 0;
    font-size: 12px;
    color: $text-secondary;
  }

  &__bar {
    height: 6px;
    border-radius: 3px;
    background: $practice-surface-3;
    overflow: hidden;
  }

  &__bar-fill {
    display: block;
    height: 100%;
    border-radius: 3px;
    background: $practice-primary;
    transition: width $transition-fast;

    &.is-weak {
      background: $color-error;
    }
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
      border-top: 1px solid $border-color;
    }
  }

  &__bank:focus-visible { outline: 2px solid $color-primary; outline-offset: 2px; }
  &__bank-top {
    flex-wrap: wrap;
    display: flex;
    align-items: center;
    gap: 7px;
    margin-bottom: 6px;
  }

  &__bank-name {
    min-width: 0;
    overflow-wrap: anywhere;
    white-space: normal;
    font-size: 12.5px;
    font-weight: 580;
    color: $text-primary;
  }

  &__bank-acc {
    flex: 0 0 auto;
    margin-left: auto;
    font-size: 12px;
    font-weight: 640;
    color: $text-secondary;
    font-variant-numeric: tabular-nums;
    overflow-wrap: anywhere;
  }

  &__bank-meta {
    margin: 5px 0 0;
    font-size: 12px;
    color: $text-secondary;
  }

  &__tip {
    margin: 0;
    font-size: 12px;
    line-height: 1.7;
    color: $text-secondary;
  }
}
@media (max-width: 600px) {
  :global(.learning-overview-dialog.el-dialog.el-dialog) { width: 100%; max-width: 100%; height: 100dvh; max-height: 100dvh; margin: 0 !important; border-radius: 0; }
  :global(.learning-overview-dialog.el-dialog .el-dialog__body) { flex: 1; }
  :global(.learning-overview-dialog.el-dialog .el-dialog__footer) { padding-bottom: calc(16px + env(safe-area-inset-bottom)); }
}
</style>
