<script setup lang="ts">
/**
 * 练题端 · 我的页（底部导航第 3 个 Tab）。
 *
 * - 展示当前练题账号信息（复用内网账号）与练题统计（学习报告总览，与报告页同口径）；
 * - 提供退出登录（练题登录态，不影响内网登录）；
 * - 仅移动端；视觉与其余练题页一致（冷静蓝 · 商务风）。
 */
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessageBox } from 'element-plus';
import PracticeLayout from '@/layouts/PracticeLayout.vue';
import * as practiceApi from '@/api/practice';
import { usePracticeAuthStore } from '@/stores/practiceAuth';
import { usePracticeConfigStore } from '@/stores/practiceConfig';
import type { Role } from '@/types';

const router = useRouter();
const practiceAuth = usePracticeAuthStore();
const configStore = usePracticeConfigStore();
/** 练题端公开配置（页面入口开关，v1.9⑤） */
const config = computed(() => configStore.config);

const loading = ref(true);
const doneTotal = ref(0);
const correctTotal = ref(0);
const wrongTotal = ref(0);
/** 连续打卡天数（来自学习报告总览） */
const streakDays = ref(0);

const user = computed(() => practiceAuth.currentUser);
const userName = computed<string>(() => user.value?.name ?? '');
/** 所属科室名称（未分配时统一提示） */
const departmentName = computed<string>(() => user.value?.departmentName?.trim() || '未分配科室');
/** 头像占位字符（姓名首字） */
const initial = computed<string>(() => (userName.value || user.value?.username || '?').slice(0, 1));

/** 角色中文名 */
const ROLE_LABEL: Record<Role, string> = { admin: '管理员', author: '出题人', examinee: '考生' };
const roleLabel = computed<string>(() => (user.value ? ROLE_LABEL[user.value.role] : ''));

/** 正确率（无作答时为 0） */
const accuracy = computed<number>(() =>
  doneTotal.value > 0 ? Math.round((correctTotal.value / doneTotal.value) * 100) : 0,
);

/** 加载练题统计：统一走学习报告总览（与报告页同口径，全量 practice_answers 聚合） */
async function loadStats(): Promise<void> {
  loading.value = true;
  try {
    await configStore.load();
    // 功能被后台关闭时接口会 404 → 各自静默降级（不影响另一项统计）
    const [wrongPage, report] = await Promise.all([
      configStore.config.wrongBookEnabled
        ? practiceApi.wrongBook({ page: 1, pageSize: 1 }).catch(() => null)
        : Promise.resolve(null),
      configStore.config.reportEnabled
        ? practiceApi.reportSummary().catch(() => null)
        : Promise.resolve(null),
    ]);
    wrongTotal.value = wrongPage?.total ?? 0;
    streakDays.value = report?.streakDays ?? 0;
    doneTotal.value = report?.doneTotal ?? 0;
    correctTotal.value = report?.correctTotal ?? 0;
  } catch {
    // 错误提示已由 http 拦截器统一弹出
  } finally {
    loading.value = false;
  }
}

/** 进入学习报告 */
function goReport(): void {
  void router.push({ name: 'practice-report' });
}

/** 退出练题登录（二次确认；不影响内网登录态） */
async function handleLogout(): Promise<void> {
  try {
    await ElMessageBox.confirm('确认退出当前练题账号？', '退出登录', {
      confirmButtonText: '退出',
      cancelButtonText: '取消',
      type: 'warning',
    });
  } catch {
    return;
  }
  practiceAuth.logout();
  configStore.reset();
  void router.replace('/practice');
}

onMounted(loadStats);
</script>

<template>
  <PracticeLayout tabbar>
    <template #actions>
      <span class="pf__user">{{ userName }}</span>
    </template>

    <div class="pf">
      <!-- 账号信息 -->
      <div class="pf__card">
        <div class="pf__avatar" aria-hidden="true">{{ initial }}</div>
        <div class="pf__info">
          <p class="pf__name">{{ userName || '未登录' }}</p>
          <p class="pf__dept">
            <span class="pf__dept-label">科室</span>
            <span class="pf__dept-value">{{ departmentName }}</span>
          </p>
          <p class="pf__meta">
            账号 {{ user?.username || '—' }}
            <template v-if="roleLabel"> · {{ roleLabel }}</template>
          </p>
        </div>
      </div>

      <!-- 练题统计 -->
      <div class="pf__section">练题统计</div>
      <div class="pf__stats">
        <div class="pf__stat">
          <span class="pf__num">{{ doneTotal }}</span>
          <span class="pf__label">累计练题</span>
        </div>
        <div class="pf__stat">
          <span class="pf__num pf__num--ok">{{ correctTotal }}</span>
          <span class="pf__label">累计答对</span>
        </div>
        <div class="pf__stat">
          <span class="pf__num">{{ accuracy }}%</span>
          <span class="pf__label">正确率</span>
        </div>
        <div class="pf__stat">
          <span class="pf__num pf__num--err">{{ wrongTotal }}</span>
          <span class="pf__label">错题数</span>
        </div>
      </div>
      <p v-if="loading" class="pf__loading">统计加载中…</p>

      <!-- 学习（学习报告入口可被后台关闭，v1.9⑤） -->
      <template v-if="config.reportEnabled">
        <div class="pf__section">学习</div>
        <button type="button" class="pf__row" @click="goReport">
          <span class="pf__row-text">学习报告</span>
          <span class="pf__row-tail">
            <span v-if="streakDays > 0" class="pf__badge">连续 {{ streakDays }} 天</span>
            <span class="pf__row-arrow" aria-hidden="true">›</span>
          </span>
        </button>
      </template>

      <!-- 账号操作 -->
      <div class="pf__section">账号</div>
      <button type="button" class="pf__row" @click="handleLogout">
        <span class="pf__row-text">退出登录</span>
        <span class="pf__row-arrow" aria-hidden="true">›</span>
      </button>

      <p class="pf__tip">练题账号与公司内网考试系统一致；练题数据独立保存，不影响考试成绩统计。</p>
    </div>
  </PracticeLayout>
</template>

<style scoped lang="scss">
@use '@/styles/variables.scss' as *;

.pf {
  &__user {
    max-width: 120px;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  &__card {
    display: flex;
    align-items: center;
    gap: 14px;
    margin-bottom: 20px;
    padding: 16px;
    background: #fff;
    border: 1px solid $practice-border;
    border-radius: $practice-radius;
  }

  &__avatar {
    flex: 0 0 auto;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 48px;
    height: 48px;
    border-radius: $practice-radius;
    background: $practice-primary;
    color: #fff;
    font-size: 20px;
    font-weight: 700;
    line-height: 1;
  }

  &__info {
    min-width: 0;
  }

  &__name {
    margin: 0;
    font-size: 16px;
    font-weight: 700;
    color: $text-primary;
  }

  &__dept {
    display: flex;
    align-items: center;
    gap: 6px;
    margin: 7px 0 0;
    font-size: 13px;
    line-height: 1.4;
  }

  &__dept-label {
    flex: 0 0 auto;
    padding: 1px 6px;
    border-radius: 3px;
    background: $practice-soft;
    color: $practice-primary;
    font-size: 11px;
  }

  &__dept-value {
    min-width: 0;
    color: $text-primary;
    word-break: break-word;
  }

  &__meta {
    margin: 5px 0 0;
    font-size: 12px;
    color: $text-secondary;
    word-break: break-word;
  }

  &__section {
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
      color: $color-success;
    }

    &--err {
      color: $color-error;
    }
  }

  &__label {
    display: block;
    margin-top: 4px;
    font-size: 12px;
    color: $text-secondary;
  }

  &__loading {
    margin: -12px 0 16px;
    font-size: 12px;
    color: $text-disabled;
  }

  &__row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    min-height: 48px;
    padding: 0 16px;
    margin-bottom: 16px;
    background: #fff;
    border: 1px solid $practice-border;
    border-radius: $practice-radius;
    font-size: 14px;
    color: $text-primary;
    text-align: left;
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
    transition: background-color $transition-fast;

    &:active {
      background: #fafbfd;
    }
  }

  &__row-arrow {
    font-size: 18px;
    color: $text-disabled;
    line-height: 1;
  }

  &__row-tail {
    display: inline-flex;
    align-items: center;
    gap: 8px;
  }

  &__badge {
    padding: 1px 7px;
    border: 1px solid $practice-border;
    border-radius: 10px;
    background: $practice-soft;
    font-size: 11px;
    font-weight: 600;
    color: $practice-primary;
  }

  &__tip {
    margin: 0;
    font-size: 12px;
    line-height: 1.7;
    color: $text-disabled;
  }
}
</style>
