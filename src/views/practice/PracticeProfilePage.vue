<script setup lang="ts">
/**
 * 练题端 · 我的页（底部导航第 3 个 Tab）。
 *
 * - 展示当前练题账号信息（复用内网账号）与练题统计（学习报告总览，与报告页同口径）；
 * - 提供退出登录（与主系统共用登录态）；
 * - 仅移动端；视觉与其余练题页一致（冷静蓝 · 商务风）。
 */
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessageBox } from 'element-plus';
import { SwitchButton, TrendCharts } from '@element-plus/icons-vue';
import PracticeLayout from '@/layouts/PracticeLayout.vue';
import RequestError from '@/components/common/RequestError.vue';
import PracticeLoading from '@/components/common/PracticeLoading.vue';
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
const configError = ref(false);
const reportError = ref(false);
const wrongError = ref(false);
const loadError = computed(() => configError.value || reportError.value || wrongError.value);
const loggingOut = ref(false);
let statsPending = false;
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
  if (statsPending || loggingOut.value) return;
  statsPending = true;
  loading.value = true;
  configError.value = false;
  reportError.value = false;
  wrongError.value = false;
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
    wrongError.value = configStore.config.wrongBookEnabled && !wrongPage;
    reportError.value = configStore.config.reportEnabled && !report;
    wrongTotal.value = wrongPage?.total ?? 0;
    streakDays.value = report?.streakDays ?? 0;
    doneTotal.value = report?.doneTotal ?? 0;
    correctTotal.value = report?.correctTotal ?? 0;
  } catch {
    configError.value = true;
    reportError.value = true;
    wrongError.value = true;
  } finally {
    loading.value = false;
    statsPending = false;
  }
}

/** 进入学习报告 */
function goReport(): void {
  void router.push({ name: 'practice-report' });
}

/** 退出当前系统账号（二次确认） */
async function handleLogout(): Promise<void> {
  if (loggingOut.value) return;
  loggingOut.value = true;
  try {
    await ElMessageBox.confirm('确认退出当前系统账号？', '退出登录', { confirmButtonText: '退出', cancelButtonText: '取消', type: 'warning' });
    practiceAuth.logout();
    configStore.reset();
    void router.replace('/login');
  } catch { /* 取消保留当前会话。 */ }
  finally { loggingOut.value = false; }
}

onMounted(loadStats);
</script>

<template>
  <PracticeLayout data-ui-layout="profile" data-ui-page="PracticeProfilePage" tabbar>
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
      <div class="pf__section pf__section--actions">练题统计<el-button text type="primary" :loading="loading" :disabled="loggingOut" @click="loadStats">刷新统计</el-button></div>
      <p class="learner-scope">当前账号累计首次作答记录 · 未作答时正确率显示“—”；错题数为当前可见题库中的错题本条数。</p>
      <div class="pf__stats">
        <div class="pf__stat">
          <span class="pf__num">{{ loading || reportError || !config.reportEnabled ? '—' : doneTotal }}</span>
          <span class="pf__label">累计练题</span>
        </div>
        <div class="pf__stat">
          <span class="pf__num pf__num--ok">{{ loading || reportError || !config.reportEnabled ? '—' : correctTotal }}</span>
          <span class="pf__label">累计答对</span>
        </div>
        <div class="pf__stat">
          <span class="pf__num">{{ loading || reportError || !config.reportEnabled || !doneTotal ? '—' : `${accuracy}%` }}</span>
          <span class="pf__label">正确率</span>
        </div>
        <div class="pf__stat">
          <span class="pf__num pf__num--err">{{ loading || wrongError || !config.wrongBookEnabled ? '—' : wrongTotal }}</span>
          <span class="pf__label">错题数</span>
        </div>
      </div>
      <PracticeLoading :loading="loading" compact caption="正在加载练题统计…" />
      <RequestError v-if="loadError" text="练题统计加载失败" @retry="loadStats" />

      <p v-if="!loading && !configError && (!config.reportEnabled || !config.wrongBookEnabled)" class="learner-scope">{{ !config.reportEnabled ? '学习报告统计未开放；' : '' }}{{ !config.wrongBookEnabled ? '错题本统计未开放。' : '' }}</p>
      <!-- 学习（学习报告入口可被后台关闭，v1.9⑤） -->
      <template v-if="config.reportEnabled">
        <div class="pf__section">学习</div>
        <div class="pf__list">
          <button type="button" class="pf__row" @click="goReport">
            <el-icon class="pf__row-icon"><TrendCharts /></el-icon>
            <span class="pf__row-text">学习报告</span>
            <span class="pf__row-tail">
              <span v-if="!loading && !reportError && streakDays > 0" class="pf__badge">连续 {{ streakDays }} 天</span>
              <span class="pf__row-arrow" aria-hidden="true">›</span>
            </span>
          </button>
        </div>
      </template>

      <!-- 账号操作 -->
      <div class="pf__section">账号</div>
      <div class="pf__list">
        <button type="button" class="pf__row" :disabled="loggingOut" @click="handleLogout">
          <el-icon class="pf__row-icon pf__row-icon--muted"><SwitchButton /></el-icon>
          <span class="pf__row-text">退出登录</span>
          <span class="pf__row-arrow" aria-hidden="true">›</span>
        </button>
      </div>

      <p class="pf__tip">练题与考试共用当前账号；练题数据独立保存，不影响考试成绩统计。</p>
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
    margin-bottom: 18px;
    padding: 16px;
    background: $bg-paper;
    border: 1px solid $border-color;
    border-radius: $practice-radius;
  }

  &__avatar {
    flex: 0 0 auto;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 54px;
    height: 54px;
    border-radius: 50%;
    background: $practice-primary;
    color: #fff;
    font-size: 20px;
    font-weight: 660;
    line-height: 1;
  }

  &__info {
    min-width: 0;
  }

  &__name {
    margin: 0;
    font-size: 16px;
    font-weight: 650;
    letter-spacing: -0.01em;
    color: $text-primary;
    overflow-wrap: anywhere;
  }

  &__dept {
    display: flex;
    align-items: flex-start;
    gap: 6px;
    margin: 6px 0 0;
    font-size: 12px;
    line-height: 1.4;
  }

  &__dept-label {
    flex: 0 0 auto;
    display: inline-flex;
    align-items: center;
    height: 18px;
    padding: 0 6px;
    border-radius: $radius-xs;
    background: $practice-soft;
    color: $practice-primary;
    font-size: 12px;
    font-weight: 600;
  }

  &__dept-value {
    min-width: 0;
    color: $text-secondary;
    overflow-wrap: anywhere;
  }

  &__meta {
    margin: 5px 0 0;
    font-size: 12px;
    color: $text-secondary;
    word-break: break-word;
  }

  /* 区块标题：v3.1 去掉左缘竖条 */
  &__section--actions { display: flex; align-items: center; justify-content: space-between; gap: 12px; .el-button { min-height: 44px; } }
  &__row:focus-visible { outline: 2px solid $color-primary; outline-offset: -2px; }
  &__section {
    margin: 0 2px 9px;
    font-size: 13px;
    font-weight: 640;
    color: $text-primary;
  }

  /* 统计四宫格（设计图 .pf-stats：4 列居中） */
  &__stats {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 8px;
    margin-bottom: 18px;
  }

  &__stat {
    min-width: 0;
    padding: 12px 6px;
    text-align: center;
    background: $bg-paper;
    border: 1px solid $border-color;
    border-radius: $practice-radius;
  }

  &__num {
    display: block;
    font-size: 18px;
    font-weight: 700;
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
    margin-top: 4px;
    font-size: 12px;
    color: $text-secondary;
  }

  &__loading {
    margin: -8px 0 16px;
    font-size: 12px;
    color: $text-secondary;
  }

  /* 列表：卡片承载 + 行分隔线（设计图 .pf-list / .pf-row） */
  &__list {
    margin-bottom: 18px;
    background: $bg-paper;
    border: 1px solid $border-color;
    border-radius: $practice-radius;
    overflow: hidden;
  }

  &__row {
    display: flex;
    align-items: center;
    gap: 11px;
    width: 100%;
    padding: 14px;
    background: none;
    border: none;
    border-bottom: 1px solid $border-color;
    font-size: 13.5px;
    color: $text-primary;
    text-align: left;
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
    transition: background-color $transition-fast;

    &:last-child {
      border-bottom: none;
    }

    &:active {
      background: $practice-surface-2;
    }
  }

  &__row-icon {
    flex: 0 0 auto;
    font-size: 16px;
    color: $practice-primary;

    &--muted {
      color: $text-disabled;
    }
  }

  &__row-text {
    flex: 1;
    min-width: 0;
    font-weight: 550;
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
    display: inline-flex;
    align-items: center;
    height: 19px;
    padding: 0 7px;
    border-radius: 99px; // radius-exception: status badge pill
    background: $practice-soft;
    font-size: 12px;
    font-weight: 620;
    color: $practice-primary;
  }

  &__tip {
    margin: 0 2px;
    font-size: 12px;
    line-height: 1.7;
    color: $text-secondary;
  }

  @media (max-width: 480px) {
    &__stats { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
    &__stat { padding: 18px 12px; border-radius: $radius-lg; }
    &__num { font-size: 22px; line-height: 1.4; }
  }
}
</style>
