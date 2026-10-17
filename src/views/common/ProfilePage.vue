<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import { Calendar, Key, Lock, Message, OfficeBuilding, Postcard, Refresh, SwitchButton, User } from '@element-plus/icons-vue';
import PageHeader from '@/components/common/PageHeader.vue';
import AccountSecurityDialog from '@/components/account/AccountSecurityDialog.vue';
import ChangePasswordDialog from '@/components/account/ChangePasswordDialog.vue';
import { ROLE_LABELS } from '@/constants';
import { useAuthStore } from '@/stores/auth';
import { formatDateTime } from '@/utils/datetime';

const auth = useAuthStore();
const router = useRouter();
const passwordVisible = ref(false);
const securityVisible = ref(false);
const refreshing = ref(false);
const user = computed(() => auth.currentUser);
const roleLabel = computed(() => user.value ? ROLE_LABELS[user.value.role] : '—');

const details = computed(() => {
  const current = user.value;
  if (!current) return [];
  return [
    { label: '登录账号', value: current.username || '—', icon: User },
    { label: '所属科室', value: current.departmentName || '未分配', icon: OfficeBuilding },
    { label: '岗位', value: current.positionName || '未设置', icon: Postcard },
    { label: '邮箱', value: current.email || '未设置', icon: Message },
    { label: '注册时间', value: formatDateTime(current.createdAt), icon: Calendar },
    { label: '密码更新时间', value: formatDateTime(current.passwordChangedAt), icon: Key },
  ];
});

async function refresh(): Promise<void> {
  refreshing.value = true;
  try {
    await auth.fetchMe();
    ElMessage.success('个人资料已更新');
  } finally {
    refreshing.value = false;
  }
}

async function logout(): Promise<void> {
  auth.logout();
  ElMessage.success('已退出登录');
  await router.replace('/login');
}
</script>

<template>
  <div class="profile-page">
    <PageHeader class="profile-page__header" title="个人中心" description="查看账号资料与安全状态" />

    <section v-if="user" class="profile-page__hero">
      <span class="profile-page__avatar">{{ user.name.slice(0, 1) }}</span>
      <div class="profile-page__identity">
        <div class="profile-page__identity-heading">
          <h2>{{ user.name }}</h2>
          <span class="profile-page__status" :class="{ 'is-disabled': user.status !== 'active' }">
            <span class="profile-page__status-dot" aria-hidden="true" />
            {{ user.status === 'active' ? '账号正常' : '账号已停用' }}
          </span>
        </div>
        <p>{{ user.username }} · {{ roleLabel }}</p>
      </div>
      <el-button
        class="profile-page__refresh"
        :icon="Refresh"
        :loading="refreshing"
        text
        circle
        aria-label="刷新资料"
        title="刷新资料"
        @click="refresh"
      />
    </section>

    <div v-if="user" class="profile-page__grid">
      <el-card class="profile-page__card" shadow="never">
        <template #header>
          <h3><el-icon aria-hidden="true"><User /></el-icon>基本资料</h3>
        </template>
        <dl class="profile-page__details">
          <div v-for="item in details" :key="item.label" class="profile-page__detail">
            <dt><el-icon aria-hidden="true"><component :is="item.icon" /></el-icon>{{ item.label }}</dt>
            <dd :class="{ 'is-empty': item.value === '未设置' || item.value === '未分配' }">{{ item.value }}</dd>
          </div>
        </dl>
      </el-card>

      <el-card class="profile-page__card" shadow="never">
        <template #header>
          <h3><el-icon aria-hidden="true"><Lock /></el-icon>账号与安全</h3>
        </template>
        <div class="profile-page__security-row">
          <span class="profile-page__security-icon" aria-hidden="true"><el-icon><Lock /></el-icon></span>
          <div>
            <strong>两步验证</strong>
            <p>{{ user.twoFactorEnabled ? '已开启，登录时需要二次验证' : '未开启，建议启用以提高账号安全性' }}</p>
          </div>
          <span class="profile-page__security-state" :class="{ 'is-on': user.twoFactorEnabled }">
            {{ user.twoFactorEnabled ? '已开启' : '未开启' }}
          </span>
        </div>
        <div class="profile-page__actions">
          <el-button type="primary" :icon="Key" @click="passwordVisible = true">修改密码</el-button>
          <el-button :icon="Lock" @click="securityVisible = true">账号安全</el-button>
        </div>
        <div class="profile-page__logout-row">
          <el-button class="profile-page__logout" :icon="SwitchButton" @click="logout">退出登录</el-button>
        </div>
      </el-card>
    </div>

    <ChangePasswordDialog v-model="passwordVisible" />
    <AccountSecurityDialog v-model="securityVisible" />
  </div>
</template>

<style scoped lang="scss">
@use '@/styles/variables.scss' as *;

.profile-page {
  max-width: 1120px;
  margin-inline: auto;

  &__hero {
    display: flex;
    align-items: center;
    gap: 16px;
    margin-bottom: 16px;
    padding: 24px;
    border: 1px solid $color-primary-border;
    border-radius: $radius-base;
    background: $color-primary-soft;
  }

  &__avatar {
    display: grid;
    place-items: center;
    width: 56px;
    height: 56px;
    flex: 0 0 56px;
    border-radius: 50%;
    background: $color-primary;
    color: #fff;
    font-size: 22px;
    font-weight: 700;
  }

  &__refresh.el-button {
    flex: 0 0 40px;
    width: 40px;
    height: 40px;
    margin: 0;
    padding: 0;
    color: $text-secondary;
    font-size: 18px;

    &:hover, &:focus-visible { color: $color-primary; background: $bg-paper; }
    &:focus-visible { outline: 2px solid $color-primary; outline-offset: 2px; }
  }

  &__identity {
    min-width: 0;
    flex: 1;

    h2 { margin: 0; font-size: 22px; color: $text-primary; overflow-wrap: anywhere; }
    p { margin: 6px 0 0; color: $text-secondary; font-size: 13px; overflow-wrap: anywhere; }
  }

  &__identity-heading {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px 12px;
  }

  &__status {
    display: inline-flex;
    align-items: center;
    gap: 5px;
  }

  &__status-dot {
    width: 5px;
    height: 5px;
    border-radius: 50%;
    background: currentColor;
  }

  &__status,
  &__security-state {
    flex: 0 0 auto;
    padding: 4px 9px;
    border-radius: $radius-xs;
    background: $color-success-bg;
    color: $color-success-text;
    font-size: 11.5px;
    font-weight: 600;

    &.is-disabled { background: $color-error-bg; color: $color-error-text; }
  }

  &__grid {
    display: grid;
    grid-template-columns: minmax(0, 1.3fr) minmax(320px, 0.9fr);
    gap: 16px;
    align-items: start;
  }

  &__card {
    min-width: 0;

    h3 {
      display: flex;
      align-items: center;
      gap: 8px;
      margin: 0;
      font-size: 15px;
      font-weight: 600;
      color: $text-primary;

      .el-icon { color: $color-primary; font-size: 17px; }
    }

    :deep(.el-card__body) { padding: 4px 20px; }
  }

  &__card + &__card {
    :deep(.el-card__body) { padding: 20px; }
  }

  &__details {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 0;
    margin: 0;
  }

  &__detail {
    min-width: 0;
    display: grid;
    grid-template-columns: 132px minmax(0, 1fr);
    align-items: baseline;
    gap: 16px;
    padding: 15px 0;
    border-bottom: 1px solid $border-color;

    &:last-child { border-bottom: 0; }

    dt { display: flex; align-items: center; gap: 8px; color: $text-secondary; font-size: 13px; }
    dt .el-icon { flex-shrink: 0; }
    dd { min-width: 0; margin: 0; color: $text-primary; font-size: 14px; overflow-wrap: anywhere; font-variant-numeric: tabular-nums; }
    dd.is-empty { color: $text-secondary; }
  }

  &__security-row {
    display: flex;
    align-items: center;
    gap: 12px;

    > div { min-width: 0; flex: 1; }
    strong { color: $text-primary; font-size: 14px; font-weight: 600; }
    p { margin: 4px 0 0; color: $text-secondary; font-size: 12px; line-height: 1.55; }
  }

  &__security-icon {
    display: grid;
    place-items: center;
    width: 36px;
    height: 36px;
    flex: 0 0 36px;
    border-radius: $radius-xs;
    background: $color-primary-soft;
    color: $color-primary;
    font-size: 18px;
  }

  &__security-state { background: $color-neutral-bg; color: $text-secondary; }
  &__security-state.is-on { background: $color-success-bg; color: $color-success-text; }

  &__actions {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
    margin-top: 16px;

    :deep(.el-button) { width: 100%; margin-left: 0; }
  }

  &__logout-row {
    margin-top: 20px;
    padding-top: 16px;
    border-top: 1px solid $border-color;
  }

  &__logout.el-button {
    width: 100%;
    color: $color-error-text;
    border-color: $color-error-border;
    background: $bg-paper;

    &:hover, &:focus-visible { background: $color-error-bg; }
  }

  @media (max-width: 900px) {
    // The mobile shell already shows the page title; start directly with the identity card.
    .profile-page__header { display: none; }

    &__hero { padding: 16px; gap: 12px; }
    &__avatar { width: 48px; height: 48px; flex-basis: 48px; font-size: 19px; }
    &__identity h2 { font-size: 20px; }
    &__identity-heading { gap: 6px 10px; }
    &__identity p { font-size: 12px; }
    &__status { padding: 3px 7px; font-size: 11px; }
    &__grid { grid-template-columns: minmax(0, 1fr); gap: 12px; }
    &__card :deep(.el-card__header) { min-height: 48px; padding: 12px 16px; }
    &__card :deep(.el-card__body) { padding: 2px 16px; }
    &__card + &__card :deep(.el-card__body) { padding: 16px; }
    &__detail {
      grid-template-columns: 112px minmax(0, 1fr);
      gap: 10px;
      padding: 12px 0;

      dt { font-size: 12px; gap: 7px; }
      dd { font-size: 13px; text-align: right; }
    }
    &__security-row { gap: 10px; align-items: flex-start; }
    &__security-state { padding: 3px 7px; }
    &__card :deep(.el-button.el-button:not(.is-link):not(.is-text)) { min-height: 42px; }
    &__logout-row { margin-top: 16px; padding-top: 12px; }
  }

  @media (max-width: 360px) {
    &__detail { grid-template-columns: 100px minmax(0, 1fr); gap: 8px; }
    &__security-icon { display: none; }
  }
}
</style>
