<script setup lang="ts">
/**
 * 考试端首页（v1.9⑦）—— 考生默认落地页。
 *
 * 聚合四块内容：
 *   1) 欢迎条：本人姓名 / 当日日期 / 未读消息数（点击进消息中心）；
 *   2) 公告与轮播：复用 ContentBoard（数据来自 /api/content/feed?scope=exam）；
 *   3) 我的考试统计：待考 / 进行中 / 已交卷 / 平均分；
 *   4) 快捷入口：我的考试、我的成绩、我的补考、消息中心。
 *
 * 统计口径全部由前端基于考生可见数据即时计算，不新增接口：
 *   待考 = 正在进行且本人尚无记录的考试；进行中 = 有未交卷记录；
 *   已交卷 = 已有交卷记录（含待阅卷）；平均分 = 已交卷记录的平均分（保留一位小数）。
 */
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { AlarmClock, Bell, Refresh, TrendCharts } from '@element-plus/icons-vue';
import * as examsApi from '@/api/exams';
import * as recordsApi from '@/api/records';
import { getUnreadCount } from '@/api/notifications';
import { useAuthStore } from '@/stores/auth';
import { getExamStatus } from '@/utils/examStatus';
import ContentBoard from '@/components/common/ContentBoard.vue';
import LoadingSkeleton from '@/components/common/LoadingSkeleton.vue';
import type { ExamMy, ExamRecord } from '@/types';

const router = useRouter();
const auth = useAuthStore();

const loading = ref(true);
const exams = ref<ExamMy[]>([]);
const records = ref<ExamRecord[]>([]);
const recordTotal = ref(0);
const unread = ref(0);

const userName = computed<string>(() => auth.currentUser?.name ?? '');

/** 中文日期（如 2026年10月13日 星期二） */
const todayText = computed<string>(() =>
  new Date().toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' }),
);

/** 待考：正在进行中且本人尚无记录的考试 */
const pendingCount = computed<number>(
  () => exams.value.filter((e) => getExamStatus(e) === 'ongoing' && !e.recordStatus).length,
);

/** 进行中：有未交卷记录 */
const ongoingCount = computed<number>(() => exams.value.filter((e) => e.recordStatus === 'in_progress').length);

/** 已交卷（本人，含待人工阅卷） */
const submittedCount = computed<number>(() => recordTotal.value);

/** 平均分（已交卷记录，保留一位小数；无记录为 0） */
const avgScore = computed<number>(() => {
  if (records.value.length === 0) return 0;
  const sum = records.value.reduce((acc, r) => acc + (Number.isFinite(r.score) ? r.score : 0), 0);
  return Math.round((sum / records.value.length) * 10) / 10;
});

const stats = computed<Array<{ key: string; label: string; value: number; hint: string; tone: string }>>(() => [
  { key: 'pending', label: '待考', value: pendingCount.value, hint: '可立即参加', tone: 'primary' },
  { key: 'ongoing', label: '进行中', value: ongoingCount.value, hint: '未交卷', tone: 'warning' },
  { key: 'submitted', label: '已交卷', value: submittedCount.value, hint: '累计次数', tone: 'success' },
  { key: 'avg', label: '平均分', value: avgScore.value, hint: '按已出成绩计', tone: 'info' },
]);

async function load(): Promise<void> {
  loading.value = true;
  try {
    const [examList, scorePage, unreadData] = await Promise.all([
      examsApi.my().catch(() => [] as ExamMy[]),
      recordsApi.my({ page: 1, pageSize: 100 }).catch(() => null),
      getUnreadCount().catch(() => ({ unreadCount: 0 })),
    ]);
    exams.value = examList;
    records.value = scorePage?.list ?? [];
    recordTotal.value = scorePage?.total ?? 0;
    unread.value = unreadData.unreadCount;
  } finally {
    loading.value = false;
  }
}

/** 快捷入口 */
const shortcuts = computed<Array<{ key: string; text: string; desc: string; path: string; icon: unknown }>>(() => [
  { key: 'my-exams', text: '我的考试', desc: '查看并参加本科室考试', path: '/exam/my', icon: AlarmClock },
  { key: 'my-scores', text: '我的成绩', desc: '成绩明细与作答回顾', path: '/exam/scores', icon: TrendCharts },
  { key: 'my-retakes', text: '我的补考', desc: '补考申请与审批进度', path: '/exam/retakes', icon: Refresh },
  { key: 'notifications', text: '消息中心', desc: '系统通知与考试提醒', path: '/notifications', icon: Bell },
]);

function go(path: string): void {
  void router.push(path);
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
      <el-badge :value="unread" :hidden="unread === 0" :max="99" class="exam-home__badge">
        <el-button @click="go('/notifications')">消息中心</el-button>
      </el-badge>
    </div>

    <!-- 公告与轮播 -->
    <ContentBoard scope="exam" />

    <LoadingSkeleton v-if="loading" :rows="4" />

    <template v-else>
      <!-- 统计 -->
      <div class="exam-home__stats">
        <div v-for="item in stats" :key="item.key" class="exam-home__stat" :class="`is-${item.tone}`">
          <p class="exam-home__stat-value">{{ item.value }}</p>
          <p class="exam-home__stat-label">{{ item.label }}</p>
          <p class="exam-home__stat-hint">{{ item.hint }}</p>
        </div>
      </div>

      <!-- 快捷入口 -->
      <div class="exam-home__section-title">快捷入口</div>
      <div class="exam-home__shortcuts">
        <div v-for="item in shortcuts" :key="item.key" class="exam-home__shortcut" @click="go(item.path)">
          <el-icon class="exam-home__shortcut-icon"><component :is="item.icon" /></el-icon>
          <div class="exam-home__shortcut-body">
            <span class="exam-home__shortcut-text">{{ item.text }}</span>
            <span class="exam-home__shortcut-desc">{{ item.desc }}</span>
          </div>
        </div>
      </div>
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

  &__stats {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
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

  &__shortcuts {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12px;
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
}
</style>
