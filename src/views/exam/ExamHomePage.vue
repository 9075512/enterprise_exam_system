<script setup lang="ts">
/**
 * 考试端首页（v1.9⑦ 建立，v2.0② 数据后端化）—— 考生默认落地页。
 *
 * 数据来自 `GET /api/home/summary` 一次拉取：
 *   - 统计：待考 / 进行中 / 已交卷 / 平均分 / 及格率（服务端全量口径）；
 *   - 趋势：最近 10 次已交卷成绩；
 *   - 待办：待考 / 未交卷 / 可申请补考 / 未读消息；
 *   - 个性化：快捷入口与推荐练题题库（v2.0⑥ 起按科室可配置）。
 *
 * 另有：欢迎条（姓名 / 日期 / 未读数）与公告轮播（复用 ContentBoard）。
 * 接口失败时整体降级为空态，不阻断页面。
 *
 * v3.1 方向 C（设计稿 p-exam-home 重排）：
 * 顶部改为主色渐变 hero（问候 + 待办摘要 + 主操作），统计改 `.stat` 卡（左缘 2px 条）；
 * 中部 2:1 分栏（左「待办事项」、右「快捷入口 / 推荐练题」）；
 * 底部 2:1 分栏（左「成绩趋势」手绘 SVG 折线图、右「最近成绩」列表）。
 * 图表遵循 DESIGN-C §2.5：单主色 + 线型区分，及格线用主色浅档虚线。
 */
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import dayjs from 'dayjs';
import { AlarmClock, Bell, Document, Refresh, TrendCharts, Warning } from '@element-plus/icons-vue';
import { getSummary } from '@/api/home';
import { useAuthStore } from '@/stores/auth';
import { formatDateTime } from '@/utils/datetime';
import ContentBoard from '@/components/common/ContentBoard.vue';
import EmptyState from '@/components/common/EmptyState.vue';
import LoadingSkeleton from '@/components/common/LoadingSkeleton.vue';
import StatCard from '@/components/common/StatCard.vue';
import type { HomeShortcut, HomeSummary } from '@/types';

const router = useRouter();
const auth = useAuthStore();

/** 后端下发的是图标名，前端映射为组件（未知回退 Bell）。 */
const ICONS: Record<string, unknown> = {
  AlarmClock,
  TrendCharts,
  Refresh,
  Bell,
  Document,
  Warning,
};
const TODO_ICON: Record<string, unknown> = {
  'pending-exam': AlarmClock,
  'ongoing-exam': Warning,
  retake: Refresh,
  message: Bell,
};

const loading = ref(true);
const summary = ref<HomeSummary | null>(null);

const userName = computed<string>(() => auth.currentUser?.name ?? '');

/** 中文日期（如 2026年10月13日 星期二） */
const todayText = computed<string>(() =>
  new Date().toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' }),
);

/** 按时段问候 */
const greeting = computed<string>(() => {
  const h = new Date().getHours();
  if (h < 6) return '凌晨好';
  if (h < 12) return '上午好';
  if (h < 14) return '中午好';
  if (h < 18) return '下午好';
  return '晚上好';
});

type Tone = 'primary' | 'success' | 'warning' | 'error';

const stats = computed<
  Array<{ key: string; label: string; value: number | string; unit: string; tone: Tone; icon: unknown }>
>(() => {
  const s = summary.value?.stats;
  return [
    { key: 'pending', label: '待考考试', value: s?.pending ?? 0, unit: '场', tone: 'primary', icon: AlarmClock },
    { key: 'ongoing', label: '进行中', value: s?.ongoing ?? 0, unit: '场', tone: 'warning', icon: Warning },
    { key: 'submitted', label: '已交卷', value: s?.submitted ?? 0, unit: '场', tone: 'primary', icon: Document },
    { key: 'avg', label: '平均分', value: s?.avgScore ?? 0, unit: '分', tone: 'primary', icon: TrendCharts },
    {
      key: 'passRate',
      label: '及格率',
      value: s?.passRate ?? 0,
      unit: '%',
      tone: 'primary',
      icon: TrendCharts,
    },
  ];
});

const todos = computed(() => summary.value?.todos ?? []);
const trend = computed(() => summary.value?.trend ?? []);
const recommendedBanks = computed(() => summary.value?.recommendedBanks ?? []);
const shortcuts = computed<HomeShortcut[]>(() => (summary.value?.shortcuts ?? []).filter((s) => s.enabled));

/** 最近成绩（倒序取前 5 条用于列表卡） */
const recentScores = computed(() => [...trend.value].reverse().slice(0, 5));

/** 及格线（服务端下发，缺省 60） */
const passLine = computed<number>(() => summary.value?.stats.passLine ?? 60);

/* ------------------------------ 成绩趋势（手绘 SVG，无图表库依赖） ------------------------------ */
const CHART = { w: 560, h: 160, x0: 46, x1: 540, yTop: 24, yBottom: 126 };

interface ChartDot {
  x: number;
  y: number;
  score: number;
  passed: boolean;
  label: string;
}

/** 折线点位与及格线（取最近 6 次；均为 0–100 归一，与服务端口径一致） */
const chart = computed<{ dots: ChartDot[]; line: string; passY: number } | null>(() => {
  const items = trend.value.slice(-6);
  if (items.length === 0) return null;
  const { x0, x1, yTop, yBottom } = CHART;
  const step = items.length > 1 ? (x1 - x0) / (items.length - 1) : 0;
  const yOf = (score: number): number =>
    yBottom - (Math.max(0, Math.min(100, score)) / 100) * (yBottom - yTop);
  const dots: ChartDot[] = items.map((item, i) => ({
    x: Math.round(x0 + step * i),
    y: Math.round(yOf(item.score) * 10) / 10,
    score: item.score,
    passed: item.passed,
    label: dayjs(item.submittedAt).format('MM月'),
  }));
  return {
    dots,
    line: dots.map((d) => `${d.x},${d.y}`).join(' '),
    passY: Math.round(yOf(passLine.value) * 10) / 10,
  };
});

/** 趋势摘要（最近 / 最高 / 平均） */
const trendSummary = computed(() => {
  const items = trend.value;
  if (items.length === 0) return null;
  const scores = items.map((i) => i.score);
  const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
  return {
    latest: scores[scores.length - 1],
    max: Math.max(...scores),
    avg: Math.round(avg * 10) / 10,
  };
});

async function load(): Promise<void> {
  loading.value = true;
  try {
    summary.value = await getSummary();
  } catch {
    // 首页装饰性数据，失败静默降级（不阻断页面）
  } finally {
    loading.value = false;
  }
}

function go(path: string): void {
  void router.push(path);
}

function goDetail(recordId: string): void {
  void router.push(`/score-detail/${recordId}`);
}

function iconOf(shortcut: HomeShortcut): unknown {
  return ICONS[shortcut.icon] ?? Bell;
}

function todoIcon(key: string): unknown {
  return TODO_ICON[key] ?? Bell;
}

function examName(item: { examName?: string }): string {
  return item.examName?.trim() || '考试';
}

onMounted(load);
</script>

<template>
  <div class="exam-home">
    <!-- 欢迎条（hero：主色渐变 + 待办摘要 + 主操作） -->
    <div class="exam-home__hero">
      <h2 class="exam-home__hero-title">{{ userName || '同学' }}，{{ greeting }}</h2>
      <p class="exam-home__hero-text">
        <template v-if="todos.length > 0">
          {{ todos[0].text }}<template v-if="todos.length > 1">，另有 {{ todos.length - 1 }} 项待办</template>。
        </template>
        <template v-else>当前没有待办事项，保持状态，随时可以开始练习。</template>
      </p>
      <div class="exam-home__hero-act">
        <el-button size="small" @click="go('/exam/my')">查看我的考试</el-button>
        <el-button size="small" class="exam-home__hero-msg" @click="go('/notifications')">
          消息中心<template v-if="summary?.unreadCount"> · {{ summary?.unreadCount }}</template>
        </el-button>
      </div>
    </div>

    <!-- 公告与轮播 -->
    <ContentBoard scope="exam" />

    <LoadingSkeleton v-if="loading" :rows="4" />

    <template v-else>
      <!-- 统计 -->
      <div class="exam-home__stats">
        <StatCard
          v-for="item in stats"
          :key="item.key"
          :label="item.label"
          :value="item.value"
          :unit="item.unit"
          :tone="item.tone"
          :icon="item.icon as never"
        />
      </div>

      <!-- 待办 + 快捷入口 / 推荐练题 -->
      <div class="exam-home__row exam-home__row--2-1">
        <el-card class="exam-home__card" shadow="never">
          <template #header>
            <h3 class="exam-home__card-title">待办事项</h3>
            <span v-if="todos.length > 0" class="exam-home__card-sub">{{ todos.length }} 项</span>
          </template>

          <div v-if="todos.length > 0" class="exam-home__todos">
            <button
              v-for="todo in todos"
              :key="todo.key"
              type="button"
              class="exam-home__todo"
              @click="go(todo.path)"
            >
              <span class="exam-home__todo-icon"><el-icon><component :is="todoIcon(todo.key)" /></el-icon></span>
              <span class="exam-home__todo-text">{{ todo.text }}</span>
              <span class="exam-home__todo-go">去处理</span>
            </button>
          </div>
          <EmptyState v-else text="暂无待办事项" :image-size="42" />
        </el-card>

        <div class="exam-home__stack">
          <el-card v-if="shortcuts.length > 0" class="exam-home__card" shadow="never">
            <template #header>
              <h3 class="exam-home__card-title">快捷入口</h3>
            </template>
            <div class="exam-home__shortcuts">
              <button
                v-for="item in shortcuts"
                :key="item.key"
                type="button"
                class="exam-home__shortcut"
                :title="item.desc"
                @click="go(item.path)"
              >
                <el-icon class="exam-home__shortcut-icon"><component :is="iconOf(item)" /></el-icon>
                <span class="exam-home__shortcut-text">{{ item.text }}</span>
              </button>
            </div>
          </el-card>

          <el-card v-if="recommendedBanks.length > 0" class="exam-home__card" shadow="never">
            <template #header>
              <h3 class="exam-home__card-title">推荐练题</h3>
            </template>
            <div class="exam-home__banks">
              <div v-for="bank in recommendedBanks" :key="bank.bankId" class="exam-home__bank">
                <span class="exam-home__bank-name">{{ bank.bankName }}</span>
                <span class="exam-home__bank-meta">共 {{ bank.questionCount }} 题 · {{ bank.reason }}</span>
              </div>
            </div>
          </el-card>
        </div>
      </div>

      <!-- 成绩趋势 + 最近成绩 -->
      <div v-if="trend.length > 0" class="exam-home__row exam-home__row--2-1">
        <el-card class="exam-home__card" shadow="never">
          <template #header>
            <h3 class="exam-home__card-title">成绩趋势</h3>
            <span class="exam-home__card-sub">近 {{ chart?.dots.length ?? 0 }} 场</span>
          </template>

          <template v-if="chart && trendSummary">
            <svg class="exam-home__chart" :viewBox="`0 0 ${CHART.w} ${CHART.h}`" role="img" aria-label="最近成绩趋势">
              <!-- 网格 -->
              <g class="exam-home__chart-grid">
                <line :x1="CHART.x0" :y1="CHART.yTop" :x2="CHART.x1" :y2="CHART.yTop" />
                <line :x1="CHART.x0" y1="58" :x2="CHART.x1" y2="58" />
                <line :x1="CHART.x0" y1="92" :x2="CHART.x1" y2="92" />
                <line class="is-base" :x1="CHART.x0" :y1="CHART.yBottom" :x2="CHART.x1" :y2="CHART.yBottom" />
              </g>
              <!-- 轴标签 -->
              <g class="exam-home__chart-axis exam-home__chart-axis--y" text-anchor="end">
                <text :x="CHART.x0 - 8" y="27.5">100</text>
                <text :x="CHART.x0 - 8" y="61.5">75</text>
                <text :x="CHART.x0 - 8" y="95.5">50</text>
                <text :x="CHART.x0 - 8" y="129.5">0</text>
              </g>
              <!-- 及格线（主色浅档虚线，DESIGN-C §2.5） -->
              <line
                class="exam-home__chart-pass"
                :x1="CHART.x0"
                :y1="chart.passY"
                :x2="CHART.x1"
                :y2="chart.passY"
              />
              <text class="exam-home__chart-pass-label" :x="CHART.x1" :y="chart.passY - 4" text-anchor="end">
                及格线 {{ passLine }}
              </text>
              <!-- 折线 -->
              <polyline class="exam-home__chart-line" :points="chart.line" />
              <g>
                <circle
                  v-for="dot in chart.dots"
                  :key="dot.x"
                  class="exam-home__chart-dot"
                  :class="{ 'is-fail': !dot.passed }"
                  :cx="dot.x"
                  :cy="dot.y"
                  r="3.5"
                />
              </g>
              <g class="exam-home__chart-axis exam-home__chart-axis--x" text-anchor="middle">
                <text v-for="dot in chart.dots" :key="`x-${dot.x}`" :x="dot.x" :y="146">{{ dot.label }}</text>
              </g>
            </svg>

            <div class="exam-home__chart-foot">
              <div>
                <span class="exam-home__kicker">最近得分</span>
                <span class="exam-home__num">{{ trendSummary.latest }}</span>
              </div>
              <div>
                <span class="exam-home__kicker">最高分</span>
                <span class="exam-home__num">{{ trendSummary.max }}</span>
              </div>
              <div>
                <span class="exam-home__kicker">平均分</span>
                <span class="exam-home__num">{{ trendSummary.avg }}</span>
              </div>
            </div>
          </template>
        </el-card>

        <el-card class="exam-home__card" shadow="never">
          <template #header>
            <h3 class="exam-home__card-title">最近成绩</h3>
            <el-button class="exam-home__card-link" link type="primary" @click="go('/exam/scores')">
              全部成绩
            </el-button>
          </template>

          <table class="exam-home__tbl">
            <thead>
              <tr>
                <th>考试名称</th>
                <th class="is-num">得分</th>
                <th class="is-num">操作</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="item in recentScores" :key="item.recordId">
                <td>
                  <span class="exam-home__tbl-name" :title="examName(item)">{{ examName(item) }}</span>
                  <span class="exam-home__tbl-meta">{{ formatDateTime(item.submittedAt) }}</span>
                </td>
                <td class="is-num">
                  <span class="exam-home__tbl-score" :class="{ 'is-fail': !item.passed }">{{ item.score }}</span>
                  <span class="exam-home__tbl-pass" :class="item.passed ? 'is-ok' : 'is-err'">
                    {{ item.passed ? '及格' : '未及格' }}
                  </span>
                </td>
                <td class="is-num">
                  <el-button link type="primary" @click="goDetail(item.recordId)">明细</el-button>
                </td>
              </tr>
            </tbody>
          </table>
        </el-card>
      </div>
    </template>
  </div>
</template>

<style scoped lang="scss">
@use '@/styles/variables.scss' as *;

.exam-home {
  &__hero {
    padding: 18px 20px;
    margin-bottom: 16px;
    border-radius: $radius-base;
    background: $gradient-brand;
    color: #fff;
  }

  &__hero-title {
    margin: 0 0 5px;
    font-size: 16px;
    font-weight: 640;
  }

  &__hero-text {
    margin: 0;
    max-width: 560px;
    font-size: 12.5px;
    line-height: 1.6;
    opacity: 0.88;
  }

  &__hero-act {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-top: 12px;

    /* hero 内按钮：白底主色字（设计稿 .hero .btn） */
    :deep(.el-button) {
      border-color: transparent;
      background: #fff;
      color: $color-primary-dark;
      font-weight: 620;
    }

    :deep(.el-button + .el-button) {
      margin-left: 0;
    }
  }

  &__hero-msg {
    opacity: 0.92;
  }

  &__stats {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(168px, 1fr));
    gap: 14px;
    margin-bottom: 16px;
  }

  &__row {
    margin-bottom: 16px;

    &--2-1 {
      display: grid;
      grid-template-columns: minmax(0, 2fr) minmax(0, 1fr);
      gap: 14px;
      align-items: start;
    }
  }

  &__stack {
    display: flex;
    flex-direction: column;
    gap: 14px;
  }

  &__card {
    :deep(.el-card__header) {
      gap: 9px;
    }
  }

  &__card-title {
    margin: 0;
    font-size: 13.5px;
    font-weight: 620;
    color: $text-primary;
  }

  &__card-sub {
    font-size: 11.5px;
    color: $text-secondary;
  }

  &__card-link {
    margin-left: auto;
    font-size: 12px;
  }

  /* 待办事项 */
  &__todos {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  &__todo {
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    padding: 11px 12px;
    border: 1px solid $border-color;
    border-radius: $radius-sm;
    background: $bg-paper;
    text-align: left;
    cursor: pointer;
    transition: border-color $transition-fast, background-color $transition-fast;

    &:hover {
      border-color: $color-primary-border;
      background: $color-primary-soft;
    }
  }

  &__todo-icon {
    flex: 0 0 22px;
    display: grid;
    place-items: center;
    width: 22px;
    height: 22px;
    border-radius: $radius-xs;
    background: $color-primary-soft;
    color: $color-primary;
    font-size: 13px;
  }

  &__todo-text {
    flex: 1;
    min-width: 0;
    font-size: 12.5px;
    color: $text-primary;
  }

  &__todo-go {
    flex: 0 0 auto;
    font-size: 12px;
    font-weight: 600;
    color: $color-primary;
  }

  /* 快捷入口：2×2 竖排图标块（设计稿 .btn--s 竖排） */
  &__shortcuts {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 9px;
  }

  &__shortcut {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 6px;
    padding: 12px 8px;
    border: 1px solid $line-strong;
    border-radius: $radius-sm;
    background: $bg-paper;
    cursor: pointer;
    transition: border-color $transition-fast, background-color $transition-fast;

    &:hover {
      border-color: $color-primary-border;
      background: $color-primary-soft;
    }
  }

  &__shortcut-icon {
    font-size: 16px;
    color: $color-primary;
  }

  &__shortcut-text {
    font-size: 12px;
    color: $text-primary;
  }

  /* 推荐练题 */
  &__banks {
    display: flex;
    flex-direction: column;
  }

  &__bank {
    display: flex;
    flex-direction: column;
    gap: 3px;
    padding: 9px 0;

    & + & {
      border-top: 1px solid $border-color;
    }
  }

  &__bank-name {
    font-size: 13px;
    font-weight: 600;
    color: $text-primary;
  }

  &__bank-meta {
    font-size: 11.5px;
    color: $text-secondary;
  }

  /* 趋势图 */
  &__chart {
    display: block;
    width: 100%;
    height: 168px;
  }

  &__chart-grid line {
    stroke: $border-color;

    &.is-base {
      stroke: $line-strong;
    }
  }

  &__chart-axis {
    fill: $text-secondary;
    font-size: 10.5px;
  }

  &__chart-pass {
    stroke: $color-primary-light;
    stroke-width: 1;
    stroke-dasharray: 4 4;
  }

  &__chart-pass-label {
    fill: $color-primary-light;
    font-size: 10px;
  }

  &__chart-line {
    fill: none;
    stroke: $color-primary;
    stroke-width: 2;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  &__chart-dot {
    fill: $bg-paper;
    stroke: $color-primary;
    stroke-width: 2;

    &.is-fail {
      stroke: $color-error;
    }
  }

  &__chart-foot {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 10px;
    margin-top: 8px;
  }

  &__kicker {
    display: block;
    font-size: 10.5px;
    font-weight: 600;
    letter-spacing: 0.11em;
    text-transform: uppercase;
    color: $text-secondary;
  }

  &__num {
    display: block;
    margin-top: 4px;
    font-size: 13px;
    font-weight: 640;
    color: $text-primary;
    font-variant-numeric: tabular-nums;
  }

  /* 最近成绩小表（设计稿 .tbl 的窄列变体） */
  &__tbl {
    width: 100%;
    border-collapse: separate;
    border-spacing: 0;

    th {
      padding: 0 10px;
      height: 30px;
      border-bottom: 1px solid $line-strong;
      font-size: 11px;
      font-weight: 600;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: $text-secondary;
      white-space: nowrap;
      text-align: left;
    }

    td {
      padding: 0 10px;
      height: 44px;
      border-bottom: 1px solid $border-color;
      font-size: 12.5px;
      color: $text-secondary;
      vertical-align: middle;
    }

    tbody tr:last-child td {
      border-bottom: none;
    }

    .is-num {
      text-align: right;
      white-space: nowrap;
    }
  }

  &__tbl-name {
    display: block;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
    max-width: 180px;
    font-weight: 560;
    color: $text-primary;
  }

  &__tbl-meta {
    display: block;
    margin-top: 1px;
    font-size: 11px;
    color: $text-secondary;
  }

  &__tbl-score {
    font-size: 13.5px;
    font-weight: 640;
    color: $text-primary;
    font-variant-numeric: tabular-nums;

    &.is-fail {
      color: $color-error-text;
    }
  }

  &__tbl-pass {
    display: block;
    margin-top: 1px;
    font-size: 11px;

    &.is-ok {
      color: $color-success-text;
    }

    &.is-err {
      color: $color-error-text;
    }
  }

  @media (max-width: 1080px) {
    &__row--2-1 {
      grid-template-columns: minmax(0, 1fr);
    }
  }
}
</style>
