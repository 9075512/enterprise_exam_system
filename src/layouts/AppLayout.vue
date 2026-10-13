<script setup lang="ts">
/**
 * 应用主布局（W2-T6）：可折叠侧栏 + 白色顶栏（面包屑 + 用户下拉）+ 卡片化内容区。
 */
import { computed, onMounted, reactive, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage, type FormInstance, type FormRules } from 'element-plus';
import { ArrowDown, Bell, Expand, Fold, Key, Lock, SwitchButton } from '@element-plus/icons-vue';
import { useAuthStore } from '@/stores/auth';
import { useAppStore } from '@/stores/app';
import { useSettingsStore } from '@/stores/settings';
import { usePermissionsStore } from '@/stores/permissions';
import { getUnreadCount } from '@/api/notifications';
import { ROLE_LABELS } from '@/constants';
import AccountSecurityDialog from '@/components/account/AccountSecurityDialog.vue';
import { getMenuItems } from './menuConfig';

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();
const app = useAppStore();
const settingsStore = useSettingsStore();
const permissions = usePermissionsStore();

/** 侧边栏品牌名（系统简称）；设置加载失败时 store 保留默认值 */
const brandName = computed(() => settingsStore.settings.systemShortName || '在线考试系统');

/** 站内信未读数 */
const unreadCount = ref(0);

// 拉取全局设置（store 内部只加载一次，失败静默）
onMounted(() => {
  void settingsStore.load();
  void permissions.load();
  void refreshUnread();
});

/** 刷新未读数（静默失败） */
async function refreshUnread(): Promise<void> {
  try {
    unreadCount.value = (await getUnreadCount()).unreadCount;
  } catch {
    unreadCount.value = 0;
  }
}

/** 打开消息中心 */
function openNotifications(): void {
  void router.push('/notifications');
}

const menus = computed(() =>
  auth.currentUser ? getMenuItems(auth.currentUser.role, permissions.myMenus) : [],
);
const activeMenu = computed(() => route.path);
const userName = computed(() => auth.currentUser?.name ?? '');
const roleLabel = computed(() => (auth.currentUser ? ROLE_LABELS[auth.currentUser.role] : ''));
const breadcrumbs = computed(() =>
  route.matched.filter((r) => r.meta && r.meta.title).map((r) => String(r.meta.title)),
);

/** 用户下拉命令 */
async function handleCommand(command: unknown): Promise<void> {
  if (command === 'logout') {
    auth.logout();
    ElMessage.success('已退出登录');
    await router.replace('/login');
  } else if (command === 'password') {
    pwdVisible.value = true;
  } else if (command === 'security') {
    securityVisible.value = true;
  }
}

/** 账号安全（v1.7③：两步验证 + 登录设备 + 密码策略） */
const securityVisible = ref(false);

// 修改密码对话框
const pwdVisible = ref(false);
const pwdFormRef = ref<FormInstance>();
const pwdLoading = ref(false);
const pwdForm = reactive({ oldPassword: '', newPassword: '', confirmPassword: '' });
// 密码最小长度可配置（系统设置），规则随设置动态生成
const pwdRules = computed<FormRules>(() => ({
  oldPassword: [{ required: true, message: '请输入旧密码', trigger: 'blur' }],
  newPassword: [
    { required: true, message: '请输入新密码', trigger: 'blur' },
    {
      min: settingsStore.settings.minPasswordLength,
      message: `新密码长度不能少于 ${settingsStore.settings.minPasswordLength} 位`,
      trigger: 'blur',
    },
  ],
  confirmPassword: [{ required: true, message: '请再次输入新密码', trigger: 'blur' }],
}));

async function submitPassword(): Promise<void> {
  if (!pwdFormRef.value) return;
  const valid = await pwdFormRef.value.validate().catch(() => false);
  if (!valid) return;
  if (pwdForm.newPassword !== pwdForm.confirmPassword) {
    ElMessage.error('两次输入的密码不一致');
    return;
  }
  pwdLoading.value = true;
  try {
    await auth.changePassword(pwdForm.oldPassword, pwdForm.newPassword);
    ElMessage.success('密码修改成功');
    pwdVisible.value = false;
    pwdForm.oldPassword = '';
    pwdForm.newPassword = '';
    pwdForm.confirmPassword = '';
  } catch {
    // http 拦截器已统一提示
  } finally {
    pwdLoading.value = false;
  }
}
</script>

<template>
  <div class="layout">
    <aside class="layout__aside" :class="{ 'is-collapsed': app.sidebarCollapsed }">
      <div class="layout__brand">
        <span class="layout__brand-mark">考</span>
        <span v-if="!app.sidebarCollapsed" class="layout__brand-name">{{ brandName }}</span>
      </div>
      <el-menu
        :default-active="activeMenu"
        :collapse="app.sidebarCollapsed"
        :collapse-transition="false"
        router
        class="layout__menu"
        background-color="transparent"
        text-color="#94a3b8"
        active-text-color="#ffffff"
      >
        <el-menu-item v-for="item in menus" :key="item.path" :index="item.path">
          <el-icon><component :is="item.icon" /></el-icon>
          <template #title>{{ item.text }}</template>
        </el-menu-item>
      </el-menu>
    </aside>

    <div class="layout__main">
      <header class="layout__header">
        <el-button text class="layout__collapse" @click="app.toggleSidebar()">
          <el-icon :size="18"><component :is="app.sidebarCollapsed ? Expand : Fold" /></el-icon>
        </el-button>
        <el-breadcrumb separator="/">
          <el-breadcrumb-item v-for="(title, index) in breadcrumbs" :key="index">
            {{ title }}
          </el-breadcrumb-item>
        </el-breadcrumb>
        <div class="layout__spacer" />
        <el-badge :value="unreadCount" :hidden="unreadCount === 0" :max="99" class="layout__bell">
          <el-button text class="layout__bell-btn" @click="openNotifications">
            <el-icon :size="18"><Bell /></el-icon>
          </el-button>
        </el-badge>
        <el-dropdown @command="handleCommand">
          <span class="layout__user">
            <span class="layout__avatar">{{ userName.slice(0, 1) }}</span>
            <span class="layout__user-meta">
              <span class="layout__user-name">{{ userName }}</span>
              <span class="layout__user-role">{{ roleLabel }}</span>
            </span>
            <el-icon class="layout__user-arrow"><ArrowDown /></el-icon>
          </span>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item command="password">
                <el-icon><Key /></el-icon> 修改密码
              </el-dropdown-item>
              <el-dropdown-item command="security">
                <el-icon><Lock /></el-icon> 账号安全
              </el-dropdown-item>
              <el-dropdown-item command="logout" divided>
                <el-icon><SwitchButton /></el-icon> 退出登录
              </el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
      </header>

      <main class="layout__content">
        <RouterView />
      </main>
    </div>

    <el-dialog v-model="pwdVisible" title="修改密码" width="420px">
      <el-form ref="pwdFormRef" :model="pwdForm" :rules="pwdRules" label-width="96px">
        <el-form-item label="旧密码" prop="oldPassword">
          <el-input v-model="pwdForm.oldPassword" type="password" show-password />
        </el-form-item>
        <el-form-item label="新密码" prop="newPassword">
          <el-input v-model="pwdForm.newPassword" type="password" show-password />
        </el-form-item>
        <el-form-item label="确认新密码" prop="confirmPassword">
          <el-input v-model="pwdForm.confirmPassword" type="password" show-password />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="pwdVisible = false">取消</el-button>
        <el-button type="primary" :loading="pwdLoading" @click="submitPassword">确定</el-button>
      </template>
    </el-dialog>

    <AccountSecurityDialog v-model="securityVisible" />
  </div>
</template>

<style scoped lang="scss">
@use '@/styles/variables.scss' as *;

.layout {
  display: flex;
  height: 100vh;
  min-width: 1280px;
  overflow: hidden;

  // ---------- 深色侧栏 ----------
  &__aside {
    width: 232px;
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    background: linear-gradient(180deg, $sidebar-bg 0%, $sidebar-bg-end 100%);
    transition: width $transition-base;

    &.is-collapsed {
      width: 64px;
    }
  }

  &__brand {
    height: $header-height;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    padding: 0 14px;
    border-bottom: 1px solid $sidebar-border;
    white-space: nowrap;
  }

  &__brand-mark {
    width: 30px;
    height: 30px;
    flex-shrink: 0;
    display: grid;
    place-items: center;
    border-radius: 9px;
    background: $gradient-brand;
    color: #fff;
    font-size: 15px;
    font-weight: 700;
    box-shadow: 0 2px 8px rgba(37, 99, 235, 0.45);
  }

  &__brand-name {
    min-width: 0;
    overflow: hidden;
    font-size: 15px;
    font-weight: 700;
    letter-spacing: 0.04em;
    color: #fff;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  &__menu {
    flex: 1;
    border-right: none;
    overflow-y: auto;
    overflow-x: hidden;
    background: transparent;
    padding: 10px;

    --el-menu-bg-color: transparent;
    --el-menu-hover-bg-color: #{$sidebar-hover-bg};
    --el-menu-active-color: #{$sidebar-text-active};
    --el-menu-text-color: #{$sidebar-text};
    --el-menu-item-height: 42px;

    :deep(.el-menu-item) {
      margin-bottom: 3px;
      border-radius: $radius-sm;
      color: $sidebar-text;
      transition: background-color $transition-fast, color $transition-fast;

      .el-icon {
        color: inherit;
      }

      &:hover {
        background: $sidebar-hover-bg;
        color: $sidebar-text-hover;
      }

      &.is-active {
        background: $sidebar-active-bg;
        color: $sidebar-text-active;
        font-weight: 600;
        box-shadow: inset 3px 0 0 $color-primary-light;
      }
    }

    // 折叠态：菜单铺满窄侧栏并居中
    :deep(.el-menu--collapse) {
      width: 100%;

      .el-menu-item {
        padding: 0 !important;
        justify-content: center;
      }
    }
  }

  // ---------- 主区 ----------
  &__main {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    background: $bg-page;
  }

  &__header {
    height: $header-height;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 0 20px;
    background: $bg-paper;
    border-bottom: 1px solid $border-color;
  }

  &__collapse {
    padding: 4px;
    color: $text-secondary;

    &:hover {
      color: $color-primary;
      background: $color-primary-50;
    }
  }

  &__spacer {
    flex: 1;
  }

  &__bell {
    margin-right: 4px;

    :deep(.el-badge__content) {
      top: 4px;
      right: 6px;
    }
  }

  &__bell-btn {
    padding: 6px;
    color: $text-secondary;

    &:hover {
      color: $color-primary;
      background: $color-primary-50;
    }
  }

  &__user {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 5px 10px 5px 5px;
    border-radius: 999px;
    cursor: pointer;
    color: $text-primary;
    outline: none;
    transition: background-color $transition-fast;

    &:hover {
      background: $color-primary-50;
    }
  }

  &__avatar {
    width: 32px;
    height: 32px;
    flex-shrink: 0;
    display: grid;
    place-items: center;
    border-radius: 50%;
    background: $gradient-brand;
    color: #fff;
    font-size: 14px;
    font-weight: 700;
  }

  &__user-meta {
    display: flex;
    flex-direction: column;
    line-height: 1.2;
  }

  &__user-name {
    font-size: 13.5px;
    font-weight: 600;
  }

  &__user-role {
    font-size: 11.5px;
    color: $text-secondary;
  }

  &__user-arrow {
    color: $text-secondary;
    font-size: 13px;
  }

  &__content {
    flex: 1;
    overflow: auto;
    padding: 22px 24px 28px;
    background: $bg-page;
  }
}
</style>
