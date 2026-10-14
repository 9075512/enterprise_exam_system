<script setup lang="ts">
/**
 * 应用主布局（W2-T6）：可折叠侧栏 + 白色顶栏（面包屑 + 用户下拉）+ 卡片化内容区。
 */
import { computed, onMounted, reactive, ref, watch } from 'vue';
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
import { getMenuGroups, getMenuItems } from './menuConfig';

/** el-menu 实例（用于跨分组导航时同步展开态） */
interface MenuExposed {
  open: (index: string) => void;
}

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

/** 当前角色可见菜单（扁平，用于高亮 / 面包屑辅助判断） */
const menuItems = computed(() =>
  auth.currentUser ? getMenuItems(auth.currentUser.role, permissions.myMenus) : [],
);

/** 当前角色可见菜单（按分组，用于侧栏渲染） */
const menuGroups = computed(() =>
  auth.currentUser ? getMenuGroups(auth.currentUser.role, permissions.myMenus) : [],
);

/**
 * 菜单集合指纹：仅当「可见菜单发生变化」时变化（路由切换不影响）。
 * 绑到 el-menu 的 key 上，权限首次加载完成后重挂载一次，让 default-openeds 生效。
 */
const menusKey = computed(() =>
  menuGroups.value.map((g) => `${g.key}:${g.items.map((i) => i.key).join(',')}`).join('|'),
);

/** 高亮项：优先精确匹配路由；二级页（如监考监控）回退到 meta.menuKey 对应的菜单 */
const activeMenu = computed(() => {
  if (menuItems.value.some((m) => m.path === route.path)) return route.path;
  const key = route.meta.menuKey as string | undefined;
  return menuItems.value.find((m) => m.key === key)?.path ?? route.path;
});

/** 当前页所属分组 key（用于默认展开 + 跨组导航时同步展开） */
const activeGroupKey = computed(() => {
  const hit = menuItems.value.find((m) => m.path === activeMenu.value);
  return hit?.group ?? '';
});

/** 初始展开：当前页所在分组（只有 1 项的组不渲染子菜单，无需展开） */
const openedGroups = computed(() =>
  menuGroups.value.filter((g) => g.items.length > 1 && g.key === activeGroupKey.value).map((g) => g.key),
);

/** 仅在二级菜单组之间跳转时联动展开（避免同组内点击反复开关） */
const menuRef = ref<MenuExposed>();
watch(activeGroupKey, (key) => {
  const group = menuGroups.value.find((g) => g.key === key);
  if (group && group.items.length > 1) menuRef.value?.open(key);
});
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
        <span class="layout__brand-name">{{ brandName }}</span>
      </div>
      <el-menu
        ref="menuRef"
        :key="menusKey"
        :default-active="activeMenu"
        :default-openeds="openedGroups"
        :collapse="app.sidebarCollapsed"
        :collapse-transition="false"
        :unique-opened="true"
        router
        class="layout__menu"
      >
        <template v-for="group in menuGroups" :key="group.key">
          <!-- 组内只有 1 项 → 直接渲染为顶层菜单项，不套一层折叠 -->
          <el-menu-item v-if="group.items.length === 1" :index="group.items[0].path">
            <el-icon><component :is="group.items[0].icon" /></el-icon>
            <template #title>{{ group.items[0].text }}</template>
          </el-menu-item>

          <el-sub-menu v-else :index="group.key" popper-class="layout__menu-popper">
            <template #title>
              <el-icon><component :is="group.icon" /></el-icon>
              <span>{{ group.text }}</span>
            </template>
            <el-menu-item v-for="item in group.items" :key="item.path" :index="item.path">
              <el-icon><component :is="item.icon" /></el-icon>
              <template #title>{{ item.text }}</template>
            </el-menu-item>
          </el-sub-menu>
        </template>
      </el-menu>
    </aside>

    <div class="layout__main">
      <header class="layout__header">
        <el-button
          text
          class="layout__collapse"
          :title="app.sidebarCollapsed ? '展开侧栏' : '收起侧栏'"
          :aria-label="app.sidebarCollapsed ? '展开侧栏' : '收起侧栏'"
          @click="app.toggleSidebar()"
        >
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

  // ---------- 深色侧栏（v2.1：实色无渐变，尺寸与选中态统一） ----------
  &__aside {
    width: $sidebar-width;
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    background: $sidebar-bg;
    border-right: 1px solid $sidebar-border;
    transition: width $transition-base;

    &.is-collapsed {
      width: $sidebar-width-collapsed;

      .layout__brand {
        justify-content: center;
        padding: 0;
      }

      .layout__brand-name {
        max-width: 0;
        opacity: 0;
        transform: translateX(-8px);
      }
    }
  }

  &__brand {
    height: $header-height;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 0 16px;
    border-bottom: 1px solid $sidebar-border;
    overflow: hidden;
  }

  &__brand-mark {
    width: 30px;
    height: 30px;
    flex-shrink: 0;
    display: grid;
    place-items: center;
    border-radius: 8px;
    background: $color-primary;
    color: #fff;
    font-size: 15px;
    font-weight: 700;
  }

  &__brand-name {
    min-width: 0;
    max-width: 160px;
    overflow: hidden;
    font-size: 15px;
    font-weight: 700;
    letter-spacing: 0.03em;
    color: #fff;
    white-space: nowrap;
    text-overflow: ellipsis;
    transition: opacity $transition-fast, transform $transition-fast;
  }

  &__menu {
    flex: 1;
    min-height: 0;
    border-right: none;
    overflow-y: auto;
    overflow-x: hidden;
    background: transparent;
    padding: 10px 10px 16px;

    --el-menu-bg-color: transparent;
    --el-menu-hover-bg-color: #{$sidebar-hover-bg};
    --el-menu-active-color: #{$sidebar-text-active};
    --el-menu-text-color: #{$sidebar-text};
    --el-menu-item-height: 40px;
    --el-menu-sub-item-height: 36px;

    // 深色底细滚动条（覆盖全局浅色规则）
    scrollbar-width: thin;
    scrollbar-color: $sidebar-scrollbar transparent;

    &::-webkit-scrollbar {
      width: 6px;
    }

    &::-webkit-scrollbar-thumb {
      background: $sidebar-scrollbar;
      border-radius: 3px;
    }

    &::-webkit-scrollbar-thumb:hover {
      background: rgba(255, 255, 255, 0.28);
    }

    &::-webkit-scrollbar-track {
      background: transparent;
    }

    // 一级菜单项 + 分组标题共用外观
    :deep(.el-menu-item),
    :deep(.el-sub-menu__title) {
      margin-bottom: 2px;
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
    }

    // 选中项：主色软底 + 右缘 5px 主色圆点
    // （v3.1 方向 C：对齐设计稿 .nav__i.is-on；v2.x 的左缘 3px 指示条已废弃）
    :deep(.el-menu-item) {
      position: relative;

      &.is-active {
        background: $sidebar-active-bg;
        color: $sidebar-text-active;
        font-weight: 600;

        &::after {
          content: '';
          position: absolute;
          top: 50%;
          right: 10px;
          width: 5px;
          height: 5px;
          border-radius: 50%;
          background: $color-primary;
          transform: translateY(-50%);
        }
      }
    }

    // 分组标题：当前组内有高亮项时弱高亮，便于定位所在分组
    :deep(.el-sub-menu) {
      &.is-active > .el-sub-menu__title {
        color: $sidebar-text-active;
        font-weight: 600;
      }
    }

    // 二级菜单：显式缩进（43px = 菜单内边距 10 + 一级内边距 20 + 图标 18 + 间距 5），
    // 使二级图标与一级标题文字左对齐；不再手写引导线，避免缩进错位
    :deep(.el-menu--inline) {
      margin: 2px 0 4px;

      .el-menu-item {
        padding-left: 43px !important;
        height: 36px;
        line-height: 36px;
        font-size: 13px;

        .el-icon {
          font-size: 15px;
        }

        &.is-active::before {
          height: 16px;
        }
      }
    }

    // 折叠态：菜单铺满窄侧栏、图标居中、整块高亮（无窄指示条）。
    // ⚠️ `.el-menu--collapse` 与 `.layout__menu` 落在**同一个元素**上，
    //    必须用 `&` 连接；写成后代选择器（`:deep(.el-menu--collapse)`）永不命中，
    //    这正是此前「菜单收回后显示异常」的根因。
    &.el-menu--collapse {
      width: 100%;
      padding: 10px 8px 16px;

      :deep(.el-menu-item),
      :deep(.el-sub-menu__title) {
        padding: 0 !important;
        height: 40px;
        justify-content: center;
        border-radius: $radius-sm;
        margin-bottom: 4px;

        .el-icon {
          margin: 0;
          font-size: 18px;
        }
      }

      // 折叠态下 el-menu-item 的内容被包进 tooltip 触发层（绝对定位 + 自带 20px 内边距），
      // 不重置它图标就会整体右偏、无法真正居中
      :deep(.el-menu-tooltip__trigger) {
        width: 100%;
        padding: 0 !important;
        justify-content: center;
      }

      :deep(.el-menu-item.is-active) {
        &::before {
          display: none;
        }
      }

      :deep(.el-sub-menu.is-active > .el-sub-menu__title) {
        background: $sidebar-hover-bg;
      }

      :deep(.el-sub-menu__icon-arrow) {
        display: none;
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
    padding: 0 $page-padding;
    background: $bg-paper;
    border-bottom: 1px solid $border-color;
  }

  &__collapse {
    width: 32px;
    height: 32px;
    padding: 0;
    border-radius: $radius-sm;
    color: $text-secondary;
    transition: color $transition-fast, background-color $transition-fast;

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
    // v2.2：由品牌渐变改为实色（规范 §7「logo 实色 blue-600，无光晕无渐变」）
    background: $color-primary;
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
    // 四边同距（DESIGN-C §2.2 --pad-page）：顶栏内距与之对齐，
    // 面包屑与页面标题因此落在同一条竖轴上。
    padding: $page-padding;
    background: $bg-page;
  }
}
</style>

<!--
  折叠态下悬停二级分组弹出的浮层（teleport 到 body，scoped 样式无法命中，故单独用非 scoped 块）。
  深色侧栏 → 浮层保持同一深色语言，避免默认白色浮层的割裂感。
-->
<style lang="scss">
@use '@/styles/variables.scss' as *;

.layout__menu-popper {
  --el-menu-bg-color: #{$sidebar-bg};
  --el-menu-hover-bg-color: #{$sidebar-hover-bg};
  --el-menu-active-color: #{$sidebar-text-active};
  --el-menu-text-color: #{$sidebar-text};
  --el-menu-item-height: 36px;

  .el-menu {
    background: $sidebar-bg;
    border: 1px solid $sidebar-border;
    border-radius: $radius-base;
    padding: 6px;
    min-width: 168px;
    box-shadow: $shadow-lg;
  }

  .el-menu-item {
    border-radius: $radius-sm;
    color: $sidebar-text;
    font-size: 13px;
    margin-bottom: 2px;

    .el-icon {
      font-size: 15px;
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
    }
  }
}
</style>
