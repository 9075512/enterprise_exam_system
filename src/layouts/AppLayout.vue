<script setup lang="ts">
/**
 * 应用主布局（W2-T6）：可折叠侧栏 + 白色顶栏（面包屑 + 用户下拉）+ 卡片化内容区。
 */
import { computed, nextTick, onMounted, onUnmounted, reactive, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage, type FormInstance, type FormRules } from 'element-plus';
import { ArrowDown, Bell, Expand, Fold, Key, Lock, QuestionFilled, Search, SwitchButton } from '@element-plus/icons-vue';
import { useAuthStore } from '@/stores/auth';
import { useAppStore } from '@/stores/app';
import { useSettingsStore } from '@/stores/settings';
import { usePermissionsStore } from '@/stores/permissions';
import { getUnreadCount } from '@/api/notifications';
import { ROLE_LABELS } from '@/constants';
import AccountSecurityDialog from '@/components/account/AccountSecurityDialog.vue';
import { MENU_GROUP_DEFS, getMenuGroups, getMenuItems } from './menuConfig';

/** el-menu 实例（用于跨分组导航时同步展开态） */
interface MenuExposed {
  open: (index: string) => void;
}

const route = useRoute();
const moduleTone = computed(() => {
  const path = route.path;
  if (/users|departments|home-config/.test(path)) return 'teal';
  if (/author\/banks|content|appeals|notifications/.test(path)) return 'violet';
  if (/author\/papers|reviews|retakes/.test(path)) return 'amber';
  return 'blue';
});
const searchShortcut = /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘ K' : 'Ctrl K';
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

/* ------------------------------ 顶栏：全局搜索（⌘K） ------------------------------ */
/** 设计稿 .search：顶栏中部的全局菜单搜索 + ⌘K 快捷键提示 */
const searchVisible = ref(false);
const searchKeyword = ref('');
const searchInputRef = ref<{ focus: () => void }>();

/** 分组名映射（搜索结果里显示「数据中心 / 数据看板」这类面包屑） */
const groupTextMap = computed<Record<string, string>>(() =>
  Object.fromEntries(MENU_GROUP_DEFS.map((g) => [g.key, g.text])),
);

const searchResults = computed(() => {
  const kw = searchKeyword.value.trim().toLowerCase();
  if (!kw) return menuItems.value;
  return menuItems.value.filter(
    (m) => m.text.toLowerCase().includes(kw) || m.path.toLowerCase().includes(kw),
  );
});

function groupOf(path: string): string {
  const hit = menuItems.value.find((m) => m.path === path);
  return hit ? groupTextMap.value[hit.group] ?? '' : '';
}

function openSearch(): void {
  searchVisible.value = true;
  void nextTick(() => searchInputRef.value?.focus());
}

function gotoSearch(path: string): void {
  searchVisible.value = false;
  searchKeyword.value = '';
  void router.push(path);
}

/** ⌘K / Ctrl+K 唤起搜索（与浏览器默认行为冲突时阻止默认） */
function onGlobalKey(event: KeyboardEvent): void {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
    event.preventDefault();
    openSearch();
  }
}

onMounted(() => window.addEventListener('keydown', onGlobalKey));
onUnmounted(() => window.removeEventListener('keydown', onGlobalKey));

/* ------------------------------ 顶栏：帮助 ------------------------------ */
const helpVisible = ref(false);

/** 帮助面板条目（静态速查，不引入文档依赖） */
const HELP_ITEMS = [
  { title: '快捷键', desc: '⌘K / Ctrl+K 唤起全局搜索，回车即可跳转菜单。' },
  { title: '菜单权限', desc: '菜单可见范围由「组织与系统 · 菜单权限」按角色授权，改后需重新登录生效。' },
  { title: '成绩与复核', desc: '考生可在「我的成绩」申请成绩复核，管理员在「成绩复核」中处理。' },
  { title: '遇到问题', desc: '请联系系统管理员，或在「审计日志」中核对操作记录。' },
] as const;

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
/** 侧栏角色行（设计稿考生显示「考生 · 科室」，其余角色仅职称） */
const roleLabel = computed(() => {
  const u = auth.currentUser;
  if (!u) return '';
  const base = ROLE_LABELS[u.role];
  if (u.role === 'examinee' && u.departmentName) return `${base} · ${u.departmentName}`;
  return base;
});

/** 考生端侧栏扁平化（设计稿 examinee 导航无折叠子菜单，全部一级项平铺） */
const flatMenu = computed(() => auth.currentUser?.role === 'examinee');
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
  <div class="layout" :data-module-tone="moduleTone">
    <aside class="layout__aside" :class="{ 'is-collapsed': app.sidebarCollapsed }">
      <div class="layout__brand">
        <span class="layout__brand-mark">考</span>
        <span class="layout__brand-name">
          {{ brandName }}
          <small>EXAM CENTER</small>
        </span>
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
          <!-- 考生端：全部一级平铺，不套折叠 -->
          <template v-if="flatMenu">
            <el-menu-item v-for="item in group.items" :key="item.path" :index="item.path">
              <el-icon><component :is="item.icon" /></el-icon>
              <template #title>{{ item.text }}</template>
            </el-menu-item>
          </template>

          <template v-else>
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
        </template>
      </el-menu>

      <!-- 侧栏底部用户块（设计稿 .side__foot / .side__user；折叠态只留头像） -->
      <div class="layout__side-foot">
        <el-dropdown trigger="click" placement="top-start" @command="handleCommand">
          <span class="layout__side-user">
            <span class="layout__avatar layout__avatar--side">{{ userName.slice(0, 1) }}</span>
            <span class="layout__side-user-meta">
              <span class="layout__side-user-name">{{ userName }}</span>
              <span class="layout__side-user-role">{{ roleLabel }}</span>
            </span>
            <el-icon class="layout__side-user-arrow"><ArrowDown /></el-icon>
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
      </div>
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
        <!-- 全局搜索（设计稿 .search + ⌘K 提示） -->
        <button type="button" class="layout__search" @click="openSearch">
          <el-icon class="layout__search-ic"><Search /></el-icon>
          <span class="layout__search-ph">搜索菜单与功能</span>
          <kbd class="layout__kbd">{{ searchShortcut }}</kbd>
        </button>
        <el-badge :value="unreadCount" :hidden="unreadCount === 0" :max="99" class="layout__bell">
          <el-button text class="layout__bell-btn" aria-label="消息中心" @click="openNotifications">
            <el-icon :size="18"><Bell /></el-icon>
          </el-button>
        </el-badge>
        <!-- 帮助（设计稿 .iconbtn title="帮助"） -->
        <button type="button" class="layout__iconbtn" title="帮助" aria-label="帮助" @click="helpVisible = true">
          <el-icon :size="18"><QuestionFilled /></el-icon>
        </button>
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

    <!-- 全局搜索面板（⌘K） -->
    <el-dialog v-model="searchVisible" width="520px" append-to-body class="layout__search-dialog">
      <template #header>
        <span class="layout__search-title">搜索</span>
      </template>
      <el-input
        ref="searchInputRef"
        v-model="searchKeyword"
        placeholder="输入菜单名称或路径…"
        clearable
        :prefix-icon="Search"
      />
      <ul class="layout__search-list">
        <li v-for="item in searchResults" :key="item.path">
          <button type="button" class="layout__search-item" @click="gotoSearch(item.path)">
            <el-icon class="layout__search-item-ic"><component :is="item.icon" /></el-icon>
            <span class="layout__search-item-text">{{ item.text }}</span>
            <span class="layout__search-item-group">{{ groupOf(item.path) }}</span>
          </button>
        </li>
        <li v-if="searchResults.length === 0" class="layout__search-empty">没有匹配的菜单</li>
      </ul>
    </el-dialog>

    <!-- 帮助面板 -->
    <el-dialog v-model="helpVisible" title="使用帮助" width="520px" append-to-body>
      <ul class="layout__help-list">
        <li v-for="h in HELP_ITEMS" :key="h.title" class="layout__help-item">
          <p class="layout__help-title">{{ h.title }}</p>
          <p class="layout__help-desc">{{ h.desc }}</p>
        </li>
      </ul>
    </el-dialog>

    <AccountSecurityDialog v-model="securityVisible" />
  </div>
</template>

<style scoped lang="scss">
@use '@/styles/variables.scss' as *;

.layout {
  display: flex;
  height: 100vh;
  height: 100dvh;
  min-width: 0;
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

      // 折叠态用户块：只留头像居中（设计稿侧栏底部用户块的收窄形态）
      .layout__side-user {
        justify-content: center;
        gap: 0;
        padding: 6px 0;
      }

      .layout__side-user-meta,
      .layout__side-user-arrow {
        display: none;
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

  // 品牌区：对齐设计稿 .side__brand / .side__mark / .side__name（保真度审计 A8）
  &__brand-mark {
    width: 24px;
    height: 24px;
    flex-shrink: 0;
    display: grid;
    place-items: center;
    border-radius: 6px;
    background: $color-primary;
    color: #fff;
    font-size: 11.5px;
    font-weight: 700;
  }

  &__brand-name {
    min-width: 0;
    max-width: 160px;
    overflow: hidden;
    font-size: 13.5px;
    font-weight: 600;
    line-height: 1.2;
    color: $sidebar-text-active;
    white-space: nowrap;
    text-overflow: ellipsis;
    transition: opacity $transition-fast, transform $transition-fast;

    // 英文副标题（设计稿 .side__name small）
    small {
      display: block;
      font-size: 9.5px;
      font-weight: 500;
      letter-spacing: 0.1em;
      color: $sidebar-text;
    }
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
    min-height: 0;
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

  // 全局搜索（设计稿 .search：白底输入框 + ⌘K 提示）
  &__search {
    display: flex;
    align-items: center;
    gap: 7px;
    min-width: 240px;
    height: 32px;
    padding: 0 10px;
    border: 1px solid $line-strong;
    border-radius: $radius-sm;
    background: $color-table-head;
    color: $text-disabled;
    font: inherit;
    cursor: pointer;
    transition: border-color $transition-fast, background-color $transition-fast;

    &:hover {
      border-color: $color-primary-border;
      background: $bg-paper;
    }
  }

  &__search-ic {
    font-size: 14px;
  }

  &__search-ph {
    flex: 1;
    text-align: left;
    font-size: 12.5px;
    color: $text-secondary;
  }

  &__kbd {
    font-family: inherit;
    font-size: 10px;
    font-weight: 600;
    color: $text-secondary;
    background: $bg-paper;
    border: 1px solid $line-strong;
    border-radius: 3px;
    padding: 1px 4px;
  }

  // 顶栏图标按钮（设计稿 .iconbtn）
  &__iconbtn {
    width: 32px;
    height: 32px;
    display: grid;
    place-items: center;
    border: 1px solid transparent;
    border-radius: $radius-sm;
    background: transparent;
    color: $text-body;
    cursor: pointer;
    transition: color $transition-fast, background-color $transition-fast;

    &:hover {
      color: $color-primary;
      background: $color-primary-50;
    }
  }

  // 侧栏底部用户块（设计稿 .side__foot / .side__user）
  &__side-foot {
    flex-shrink: 0;
    padding: 8px 10px;
    border-top: 1px solid $sidebar-border;
  }

  &__side-user {
    display: flex;
    align-items: center;
    gap: 9px;
    padding: 6px 8px;
    border-radius: $radius-sm;
    cursor: pointer;
    outline: none;
    transition: background-color $transition-fast;

    &:hover {
      background: $sidebar-hover-bg;
    }
  }

  &__side-user-meta {
    display: flex;
    flex-direction: column;
    min-width: 0;
    line-height: 1.25;
  }

  &__side-user-name {
    font-size: 12.5px;
    font-weight: 600;
    color: $sidebar-text-active;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  &__side-user-role {
    font-size: 10.5px;
    color: $sidebar-text;
  }

  &__side-user-arrow {
    margin-left: auto;
    font-size: 12px;
    color: $sidebar-text;
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

  // 侧栏头像小一号（设计稿 .av--sm）
  &__avatar--side {
    // 设计稿 .av--sm：22px / 9.5px
    width: 22px;
    height: 22px;
    font-size: 9.5px;
  }

  &__content {
    flex: 1;
    min-width: 0;
    min-height: 0;
    overflow: auto;
    scrollbar-gutter: stable;
    // 四边同距（DESIGN-C §2.2 --pad-page）：顶栏内距与之对齐，
    // 面包屑与页面标题因此落在同一条竖轴上。
    padding: $page-padding;
    background: $bg-page;

    > :deep(*) {
      min-width: 0;
      max-width: 100%;
    }
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

/* =============================================================
   全局搜索面板 / 帮助面板（el-dialog append-to-body，故独立于 .layout 书写）
   ============================================================= */
.layout__search-title {
  font-size: 14px;
  font-weight: 600;
  color: $text-primary;
}

.layout__search-list {
  margin: 12px 0 0;
  padding: 0;
  list-style: none;
  max-height: 320px;
  overflow-y: auto;
}

.layout__search-item {
  display: flex;
  align-items: center;
  gap: 9px;
  width: 100%;
  padding: 8px 10px;
  border: none;
  border-radius: $radius-xs;
  background: transparent;
  font: inherit;
  text-align: left;
  cursor: pointer;
  transition: background-color 0.12s;

  &:hover {
    background: $color-primary-soft;
  }
}

.layout__search-item-ic {
  font-size: 15px;
  color: $text-secondary;
}

.layout__search-item-text {
  flex: 1;
  min-width: 0;
  font-size: 13px;
  color: $text-primary;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.layout__search-item-group {
  flex: 0 0 auto;
  font-size: 11.5px;
  color: $text-secondary;
}

.layout__search-empty {
  padding: 20px 0;
  text-align: center;
  font-size: 12.5px;
  color: $text-secondary;
}

.layout__help-list {
  margin: 0;
  padding: 0;
  list-style: none;
}

.layout__help-item + .layout__help-item {
  margin-top: 14px;
  padding-top: 14px;
  border-top: 1px solid $border-color;
}

.layout__help-title {
  margin: 0 0 4px;
  font-size: 13px;
  font-weight: 600;
  color: $text-primary;
}

.layout__help-desc {
  margin: 0;
  font-size: 12.5px;
  line-height: 1.7;
  color: $text-body;
}
</style>
