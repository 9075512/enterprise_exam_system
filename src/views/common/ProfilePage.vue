<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import { Calendar, Key, Lock, Message, OfficeBuilding, Postcard, SwitchButton, User } from '@element-plus/icons-vue';
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
    <PageHeader title="个人中心" description="查看账号资料与安全状态">
      <template #actions>
        <el-button :loading="refreshing" @click="refresh">刷新资料</el-button>
      </template>
    </PageHeader>

    <section v-if="user" class="profile-page__hero">
      <span class="profile-page__avatar">{{ user.name.slice(0, 1) }}</span>
      <div class="profile-page__identity">
        <h2>{{ user.name }}</h2>
        <p>{{ user.username }} · {{ roleLabel }}</p>
      </div>
      <span class="profile-page__status" :class="{ 'is-disabled': user.status !== 'active' }">
        {{ user.status === 'active' ? '账号正常' : '账号已停用' }}
      </span>
    </section>

    <div v-if="user" class="profile-page__grid">
      <el-card class="profile-page__card" shadow="never">
        <template #header>
          <h3>基本资料</h3>
        </template>
        <dl class="profile-page__details">
          <div v-for="item in details" :key="item.label" class="profile-page__detail">
            <dt><el-icon><component :is="item.icon" /></el-icon>{{ item.label }}</dt>
            <dd>{{ item.value }}</dd>
          </div>
        </dl>
      </el-card>

      <el-card class="profile-page__card" shadow="never">
        <template #header>
          <h3>账号与安全</h3>
        </template>
        <div class="profile-page__security-row">
          <span class="profile-page__security-icon"><el-icon><Lock /></el-icon></span>
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
  &__hero {
    display: flex;
    align-items: center;
    gap: 16px;
    margin-bottom: 16px;
    padding: 20px;
    border: 1px solid $border-color;
    border-radius: $radius-base;
    background: $bg-paper;
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

  &__identity {
    min-width: 0;
    flex: 1;

    h2 { margin: 0; font-size: 20px; color: $text-primary; }
    p { margin: 5px 0 0; color: $text-secondary; font-size: 13px; }
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
    grid-template-columns: minmax(0, 1.15fr) minmax(320px, 0.85fr);
    gap: 14px;
    align-items: start;
  }

  &__card {
    h3 { margin: 0; font-size: 14px; color: $text-primary; }
  }

  &__details {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0;
    margin: 0;
  }

  &__detail {
    min-width: 0;
    padding: 13px 0;
    border-bottom: 1px solid $border-color;

    &:nth-child(odd) { padding-right: 18px; }
    &:nth-child(even) { padding-left: 18px; border-left: 1px solid $border-color; }
    &:nth-last-child(-n + 2) { border-bottom: 0; }

    dt { display: flex; align-items: center; gap: 7px; color: $text-secondary; font-size: 12px; }
    dd { margin: 5px 0 0 23px; color: $text-primary; font-size: 13px; overflow-wrap: anywhere; }
  }

  &__security-row {
    display: flex;
    align-items: center;
    gap: 12px;
    padding-bottom: 16px;
    border-bottom: 1px solid $border-color;

    > div { min-width: 0; flex: 1; }
    strong { color: $text-primary; font-size: 13px; }
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

  &__logout { color: $color-error-text; }

  @media (max-width: 900px) {
    &__hero { padding: 16px; gap: 12px; }
    &__avatar { width: 48px; height: 48px; flex-basis: 48px; font-size: 19px; }
    &__identity h2 { font-size: 17px; }
    &__grid { grid-template-columns: minmax(0, 1fr); gap: 12px; }
    &__details { grid-template-columns: minmax(0, 1fr); }
    &__detail,
    &__detail:nth-child(odd),
    &__detail:nth-child(even) { padding: 12px 0; border-left: 0; border-bottom: 1px solid $border-color; }
    &__detail:last-child { border-bottom: 0; }
    &__actions { grid-template-columns: minmax(0, 1fr); }
  }
}
</style>
