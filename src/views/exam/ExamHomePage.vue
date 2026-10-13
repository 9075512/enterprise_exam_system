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
 */
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { AlarmClock, Bell, Document, Refresh, TrendCharts, Warning } from '@element-plus/icons-vue';
import { getSummary } from '@/api/home';
import { useAuthStore } from '@/stores/auth';
import { formatDateTime } from '@/utils/datetime';
import ContentBoard from '@/components/common/ContentBoard.vue';
import LoadingSkeleton from '@/components/common/LoadingSkeleton.vue';
import type { HomeSummary, HomeShortcut } from '@/types';

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

const stats = computed<Array<{ key: string; label: string; value: number; unit: string; hint: string; tone: string }>>(
  () => {
    const s = summary.value?.stats;
    return [
      { key: 'pending', label: '待考', value: s?.pending ?? 0, unit: '', hint: '可立即参加', tone: 'primary' },
      { key: 'ongoing', label: '进行中', value: s?.ongoing ?? 0, unit: '', hint: '未交卷', tone: 'warning' },
      { key: 'submitted', label: '已交卷', value: s?.submitted ?? 0, unit: '', hint: '累计次数', tone: 'success' },
      { key: 'avg', label: '平均分', value: s?.avgScore ?? 0, unit: '', hint: '按已出成绩计', tone: 'info' },
      {
        key: 'passRate',
        label: '及格率',
        value: s?.passRate ?? 0,
        unit: '%',
        hint: `及格线 ${s?.passLine ?? 60} 分`,
        tone: 'info',
      },
    ];
  },
);

const todos = computed(() => summary.value?.todos ?? []);
const trend = computed(() => summary.value?.trend ?? []);
const recommendedBanks = computed(() => summary.value?.recommendedBanks ?? []);
const shortcuts = computed<HomeShortcut[]>(() => (summary.value?.shortcuts ?? []).filter((s) => s.enabled));

/** 趋势条宽度（相对于 100 分）。 */
function barWidth(score: number): string {
  return `${Math.max(2, Math.min(100, score))}%`;
}

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

function iconOf(shortcut: HomeShortcut): unknown {
  return ICONS[shortcut.icon] ?? Bell;
}

function todoIcon(key: string): unknown {
  return TODO_ICON[key] ?? Bell;
}

onMounted(load);
</script>

<template>
  <div class="exam-home">
    <!-- 欢迎条 -->
    <div class="exam-home__hero">
      <div class="exam-home__hero-main">
        <p class="exam-home__hello">你好，{{ userName || '同学' }}</p>
        <p class="exam-home__date">{{ todayText }}</p>
      </div>
      <el-badge
        :value="summary?.unreadCount ?? 0"
        :hidden="!summary?.unreadCount"
        :max="99"
        class="exam-home__badge"
      >
        <el-button @click="go('/notifications')">消息中心</el-button>
      </el-badge>
    </div>

    <!-- 公告与轮播 -->
    <ContentBoard scope="exam" />

    <LoadingSkeleton v-if="loading" :rows="4" />

    <template v-else>
      <!-- 待办提醒 -->
      <div v-if="todos.length > 0" class="exam-home__todos">
        <div
          v-for="todo in todos"
          :key="todo.key"
          class="exam-home__todo"
          @click="go(todo.path)"
        >
          <el-icon class="exam-home__todo-icon"><component :is="todoIcon(todo.key)" /></el-icon>
          <span class="exam-home__todo-text">{{ todo.text }}</span>
          <span class="exam-home__todo-go">去处理</span>
        </div>
      </div>

      <!-- 统计 -->
      <div class="exam-home__stats">
        <div v-for="item in stats" :key="item.key" class="exam-home__stat" :class="`is-${item.tone}`">
          <p class="exam-home__stat-value">
            {{ item.value }}<span v-if="item.unit" class="exam-home__stat-unit">{{ item.unit }}</span>
          </p>
          <p class="exam-home__stat-label">{{ item.label }}</p>
          <p class="exam-home__stat-hint">{{ item.hint }}</p>
        </div>
      </div>

      <!-- 最近成绩趋势 -->
      <template v-if="trend.length > 0">
        <div class="exam-home__section-title">最近成绩</div>
        <div class="exam-home__trend">
          <div v-for="point in trend" :key="point.recordId" class="exam-home__trend-row">
            <div class="exam-home__trend-head">
              <span class="exam-home__trend-name" :title="point.examName">{{ point.examName || '考试' }}</span>
              <span class="exam-home__trend-score" :class="{ 'is-fail': !point.passed }">
                {{ point.score }}<span class="exam-home__trend-line">/{{ point.passScore }}</span>
              </span>
            </div>
            <div class="exam-home__trend-bar">
              <span
                class="exam-home__trend-fill"
                :class="{ 'is-fail': !point.passed }"
                :style="{ width: barWidth(point.score) }"
              />
            </div>
            <span class="exam-home__trend-time">{{ formatDateTime(point.submittedAt) }}</span>
          </div>
        </div>
      </template>

      <!-- 快捷入口 -->
      <template v-if="shortcuts.length > 0">
        <div class="exam-home__section-title">快捷入口</div>
        <div class="exam-home__shortcuts">
          <div v-for="item in shortcuts" :key="item.key" class="exam-home__shortcut" @click="go(item.path)">
            <el-icon class="exam-home__shortcut-icon"><component :is="iconOf(item)" /></el-icon>
            <div class="exam-home__shortcut-body">
              <span class="exam-home__shortcut-text">{{ item.text }}</span>
              <span class="exam-home__shortcut-desc">{{ item.desc }}</span>
            </div>
          </div>
        </div>
      </template>

      <!-- 推荐练题题库（按科室配置，未配置则不展示） -->
      <template v-if="recommendedBanks.length > 0">
        <div class="exam-home__section-title">推荐练题</div>
        <div class="exam-home__banks">
          <div v-for="bank in recommendedBanks" :key="bank.bankId" class="exam-home__bank">
            <div class="exam-home__bank-main">
              <span class="exam-home__bank-name">{{ bank.bankName }}</span>
              <span class="exam-home__bank-meta">共 {{ bank.questionCount }} 题 · {{ bank.reason }}</span>
            </div>
            <span class="exam-home__bank-hint">请前往练题端「题库」练习</span>
          </div>
        </div>
      </template>
    </template>
  </div>
</template>

<style scoped lang="scss">
@use '@/styles/variables.scss' as *;

.exam-home {
  &__hero {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    margin-bottom: 16px;
    padding: 18px 22px;
    background: #fff;
    border: 1px solid $border-color;
    border-left: 3px solid $color-primary;
    border-radius: 6px;
  }

  &__hello {
    margin: 0;
    font-size: 19px;
    font-weight: 700;
    color: $text-primary;
  }

  &__date {
    margin: 5px 0 0;
    font-size: 13px;
    color: $text-secondary;
  }

  &__badge {
    flex: 0 0 auto;
  }

  /* 待办提醒 */
  &__todos {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin-bottom: 16px;
  }

  &__todo {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 11px 14px;
    background: #fffbeb;
    border: 1px solid #fde68a;
    border-radius: 6px;
    cursor: pointer;
    transition: background-color 0.15s;

    &:hover {
      background: #fef3c7;
    }
  }

  &__todo-icon {
    flex: 0 0 auto;
    color: #d97706;
    font-size: 16px;
  }

  &__todo-text {
    flex: 1;
    min-width: 0;
    font-size: 13px;
    color: $text-primary;
  }

  &__todo-go {
    flex: 0 0 auto;
    font-size: 12px;
    font-weight: 600;
    color: #b45309;
  }

  &__stats {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
    gap: 12px;
    margin-bottom: 18px;
  }

  &__stat {
    padding: 16px 18px;
    background: #fff;
    border: 1px solid $border-color;
    border-top: 3px solid $color-primary;
    border-radius: 6px;

    &.is-warning {
      border-top-color: #f59e0b;
    }

    &.is-success {
      border-top-color: #16a34a;
    }

    &.is-info {
      border-top-color: $color-primary-light;
    }
  }

  &__stat-value {
    margin: 0;
    font-size: 26px;
    font-weight: 700;
    line-height: 1.1;
    color: $text-primary;
    font-variant-numeric: tabular-nums;
  }

  &__stat-unit {
    margin-left: 1px;
    font-size: 15px;
    font-weight: 600;
    color: $text-secondary;
  }

  &__stat-label {
    margin: 6px 0 0;
    font-size: 13px;
    font-weight: 600;
    color: $text-primary;
  }

  &__stat-hint {
    margin: 3px 0 0;
    font-size: 12px;
    color: $text-disabled;
  }

  &__section-title {
    margin-bottom: 12px;
    padding-left: 10px;
    position: relative;
    font-size: 14px;
    font-weight: 700;
    color: $text-primary;

    &::before {
      content: '';
      position: absolute;
      top: 50%;
      left: 0;
      width: 3px;
      height: 14px;
      margin-top: -7px;
      border-radius: 2px;
      background: $color-primary;
    }
  }

  /* 最近成绩趋势 */
  &__trend {
    margin-bottom: 18px;
    padding: 14px 16px;
    background: #fff;
    border: 1px solid $border-color;
    border-radius: 6px;
  }

  &__trend-row {
    & + & {
      margin-top: 12px;
    }
  }

  &__trend-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    margin-bottom: 5px;
  }

  &__trend-name {
    min-width: 0;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
    font-size: 13px;
    color: $text-primary;
  }

  &__trend-score {
    flex: 0 0 auto;
    font-size: 13px;
    font-weight: 700;
    color: #16a34a;
    font-variant-numeric: tabular-nums;

    &.is-fail {
      color: $color-error;
    }
  }

  &__trend-line {
    font-size: 11px;
    font-weight: 400;
    color: $text-disabled;
  }

  &__trend-bar {
    display: block;
    height: 6px;
    border-radius: 3px;
    background: $color-table-head;
    overflow: hidden;
  }

  &__trend-fill {
    display: block;
    height: 100%;
    border-radius: 3px;
    background: #16a34a;

    &.is-fail {
      background: $color-error;
    }
  }

  &__trend-time {
    display: block;
    margin-top: 4px;
    font-size: 11px;
    color: $text-disabled;
  }

  &__shortcuts {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12px;
    margin-bottom: 18px;
  }

  &__shortcut {
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 16px 18px;
    background: #fff;
    border: 1px solid $border-color;
    border-radius: 6px;
    cursor: pointer;
    transition: border-color 0.15s, background-color 0.15s;

    &:hover {
      border-color: rgba(37, 99, 235, 0.45);
      background: $bg-page;
    }
  }

  &__shortcut-icon {
    flex: 0 0 auto;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 38px;
    height: 38px;
    border-radius: 6px;
    background: $color-primary-soft;
    border: 1px solid $border-color;
    font-size: 18px;
    color: $color-primary;
  }

  &__shortcut-body {
    display: flex;
    flex-direction: column;
    gap: 3px;
    min-width: 0;
  }

  &__shortcut-text {
    font-size: 14px;
    font-weight: 700;
    color: $text-primary;
  }

  &__shortcut-desc {
    font-size: 12px;
    color: $text-secondary;
  }

  /* 推荐练题题库 */
  &__banks {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12px;
  }

  &__bank {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    padding: 14px 16px;
    background: #fff;
    border: 1px solid $border-color;
    border-left: 3px solid $color-primary;
    border-radius: 6px;
  }

  &__bank-hint {
    flex: none;
    font-size: 12px;
    color: $text-secondary;
  }

  &__bank-main {
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-width: 0;
  }

  &__bank-name {
    font-size: 14px;
    font-weight: 700;
    color: $text-primary;
  }

  &__bank-meta {
    font-size: 12px;
    color: $text-secondary;
  }
}
</style>
