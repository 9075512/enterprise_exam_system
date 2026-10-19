<script setup lang="ts">
/**
 * 应用主布局：管理/出题/PC 考生使用桌面框架；900px 以下的考生端切换为移动框架。
 */
import { computed, nextTick, onMounted, onUnmounted, provide, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import { ArrowDown, Bell, Expand, Fold, Key, Lock, QuestionFilled, Search, SwitchButton, User } from '@element-plus/icons-vue';
import { useAuthStore } from '@/stores/auth';
import { useAppStore } from '@/stores/app';
import { useSettingsStore } from '@/stores/settings';
import { usePermissionsStore } from '@/stores/permissions';
import { getUnreadCount } from '@/api/notifications';
import { ROLE_LABELS } from '@/constants';
import AccountSecurityDialog from '@/components/account/AccountSecurityDialog.vue';
import ChangePasswordDialog from '@/components/account/ChangePasswordDialog.vue';
import { MENU_GROUP_DEFS, getMenuGroups, getMenuItems, type MenuItem } from './menuConfig';

const route = useRoute();
const isPracticeRoute = computed(() => route.path.startsWith('/exam/practice'));
const isExamManagementRoute = computed(() => route.path.startsWith('/admin/exams'));
const examViewport = window.matchMedia?.('(max-width: 700px)');
const isSmallExamViewport = ref(examViewport?.matches ?? false);
const examNavOpen = ref(false);
// 小屏管理端所有工作流共用导航抽屉，不只限于考试列表。
const isExamMobile = computed(() => !isExaminee.value && isSmallExamViewport.value);
function syncExamViewport(event: MediaQueryListEvent): void { isSmallExamViewport.value = event.matches; examNavOpen.value = false; }
function closeExamNavOnEscape(event: KeyboardEvent): void { if (event.key === 'Escape') examNavOpen.value = false; }
onMounted(() => { examViewport?.addEventListener('change', syncExamViewport); window.addEventListener('keydown', closeExamNavOnEscape); });
onUnmounted(() => { examViewport?.removeEventListener('change', syncExamViewport); window.removeEventListener('keydown', closeExamNavOnEscape); });
watch(() => route.path, () => { examNavOpen.value = false; });
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
const isExaminee = computed(() => auth.currentUser?.role === 'examinee');
/** 练题作答是沉浸式页面，移动端隐藏通用头部和底栏，由作答页自己的工具栏接管。 */
const isFocusedExamineeRoute = computed(() =>
  isExaminee.value && (route.name === 'practice-session' || route.name === 'practice-reans'),
);
const isFocusedLearningRoute = computed(() => route.name === 'practice-session' || route.name === 'practice-reans');

/** 侧边栏品牌名（系统简称）；设置加载失败时 store 保留默认值 */
const brandName = computed(() => settingsStore.settings.systemShortName);

// 浏览器标题跟随后台“系统全称”，管理员保存品牌设置后无需重新构建前端。
watch(
  () => settingsStore.settings.systemName,
  (name) => {
    if (name.trim()) document.title = name.trim();
  },
  { immediate: true },
);

/** 站内信未读数 */
const unreadCount = ref(0);
const canViewNotifications = computed(() => permissions.hasMenu('exam-messages', auth.currentUser?.role ?? 'examinee'));
watch(canViewNotifications, (allowed) => { if (allowed) void refreshUnread(); else unreadCount.value = 0; }, { immediate: true });

// 拉取全局设置（store 内部只加载一次，失败静默）
onMounted(() => {
  void settingsStore.load();
  void permissions.load();
});

/** 刷新未读数（静默失败） */
async function refreshUnread(): Promise<void> {
  if (!canViewNotifications.value) return;
  try {
    unreadCount.value = (await getUnreadCount()).unreadCount;
  } catch {
    unreadCount.value = 0;
  }
}

/** 打开消息中心 */
function openNotifications(): void {
  if (!canViewNotifications.value) return;
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

/** 手机考生端的一级任务导航；消息中心保留在顶部铃铛入口。 */
const mobileNavItems = computed(() => {
  const order = ['home', 'my-exams', 'practice', 'my-scores'];
  const items = order
    .map((key) => menuItems.value.find((item) => item.key === key))
    .filter((item): item is NonNullable<typeof item> => Boolean(item));
  const profileItem: MenuItem = {
    key: 'profile',
    text: '我的',
    path: '/profile',
    icon: User,
    roles: ['examinee'],
    group: 'examinee',
  };
  return [...items, profileItem];
});

/** 移动端底栏导航：重复点击当前页时回到顶部，其余情况立即切换路由。 */
async function navigateMobile(path: string): Promise<void> {
  if (route.path === path) {
    document.querySelector<HTMLElement>('.layout__content')?.scrollTo({ top: 0, behavior: 'smooth' });
    window.scrollTo({ top: 0, behavior: 'smooth' });
    return;
  }
  await router.push(path);
}

/** 当前角色可见菜单（按分组，用于侧栏渲染） */
const menuGroups = computed(() =>
  auth.currentUser ? getMenuGroups(auth.currentUser.role, permissions.myMenus) : [],
);

/**
 * 菜单集合指纹：仅当「可见菜单发生变化」时变化（路由切换不影响）。
 * 权限首次加载完成后重挂载菜单，所有入口继续取相同的权限过滤结果。
 */
const menusKey = computed(() =>
  menuGroups.value.map((g) => `${g.key}:${g.items.map((i) => i.key).join(',')}`).join('|'),
);

/** 高亮项：优先精确匹配路由；二级页（如监考监控）回退到 meta.menuKey 对应的菜单 */
const activeMenu = computed(() => {
  if (menuItems.value.some((m) => m.path === route.path)) return route.path;
  // 成绩明细由管理员和考生共用，根据当前角色回落到各自的成绩菜单。
  if (route.path.startsWith('/score-detail/')) {
    const scoreKey = auth.currentUser?.role === 'examinee' ? 'my-scores' : 'scores';
    const scoreMenu = menuItems.value.find((m) => m.key === scoreKey);
    if (scoreMenu) return scoreMenu.path;
  }
  const key = route.meta.menuKey as string | undefined;
  return menuItems.value.find((m) => m.key === key)?.path ?? route.path;
});

/** 考生端侧栏扁平化（设计稿 examinee 导航无折叠子菜单，全部一级项平铺） */
const flatMenu = computed(() => auth.currentUser?.role === 'examinee');
const userName = computed(() => auth.currentUser?.name ?? '');
/** 侧栏角色行（设计稿考生显示「考生 · 科室」，其余角色仅职称） */
const roleLabel = computed(() => {
  const u = auth.currentUser;
  if (!u) return '';
  const base = u.roleName || ROLE_LABELS[u.role];
  if (u.role === 'examinee' && u.departmentName) return `${base} · ${u.departmentName}`;
  return base;
});
const breadcrumbs = computed(() => {
  const titles = route.matched.filter((r) => r.meta && r.meta.title).map((r) => String(r.meta.title));
  const group = groupOf(activeMenu.value);
  return group && titles[0] !== group ? [group, ...titles] : titles;
});
const mobileTitle = computed(() => breadcrumbs.value.at(-1) || brandName.value);
const desktopTitle = computed(() => breadcrumbs.value.at(-1) || menuItems.value.find(item => item.path === activeMenu.value)?.text || brandName.value);
provide('exam-layout-page-title', desktopTitle);
const currentDate = ref(new Date());
const dateLabel = computed(() => currentDate.value.toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' }));
let dateTimer: ReturnType<typeof setInterval> | undefined;
onMounted(() => { dateTimer = setInterval(() => { currentDate.value = new Date(); }, 60_000); });
onUnmounted(() => { if (dateTimer) clearInterval(dateTimer); });

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
  } else if (command === 'profile') {
    await router.push('/profile');
  }
}

/** 账号安全（v1.7③：两步验证 + 登录设备 + 密码策略） */
const securityVisible = ref(false);

// 修改密码对话框
const pwdVisible = ref(false);
</script>

<template>
  <div
    class="layout"
    :class="{
      'is-practice-route': isPracticeRoute,
      'is-exam-management': isExamManagementRoute,
      'is-management-layout': !isExaminee,
      'is-exam-nav-open': isExamMobile && examNavOpen,
      'is-examinee-layout': isExaminee,
      'is-focused-examinee-route': isFocusedExamineeRoute,
      'is-focused-learning-route': isFocusedLearningRoute,
    }"
    :data-module-tone="moduleTone"
  >
    <button v-if="isExamMobile && examNavOpen" class="layout__exam-nav-backdrop" type="button" aria-label="关闭导航" @click="examNavOpen = false" />
    <aside id="app-main-navigation" aria-label="主导航" class="layout__aside" :class="{ 'is-collapsed': !isExamMobile && app.sidebarCollapsed }" :inert="isExamMobile && !examNavOpen ? true : undefined">
      <div class="layout__brand">
        <span class="layout__brand-mark">考</span>
        <span class="layout__brand-name" :title="brandName">
          {{ brandName }}
          <small>EXAM CENTER</small>
        </span>
      </div>
      <el-menu
        :key="menusKey"
        :default-active="activeMenu"
        :collapse="!isExamMobile && app.sidebarCollapsed"
        :collapse-transition="false"
        router
        class="layout__menu"
        @select="examNavOpen = false"
      >
        <template v-for="group in menuGroups" :key="group.key">
          <li v-if="!flatMenu && (isExamMobile || !app.sidebarCollapsed)" class="layout__nav-label" role="presentation">{{ group.text }}</li>
          <el-menu-item v-for="item in group.items" :key="item.path" :index="item.path">
            <el-icon><component :is="item.icon" /></el-icon>
            <template #title>{{ item.text }}</template>
          </el-menu-item>
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
              <el-dropdown-item command="profile">
                <el-icon><User /></el-icon> 个人中心
              </el-dropdown-item>
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

    <div class="layout__main" :inert="isExamMobile && examNavOpen ? true : undefined">
      <header v-if="isExaminee && !isFocusedExamineeRoute" class="layout__mobile-header">
        <div class="layout__mobile-brand">
          <span class="layout__mobile-mark">考</span>
          <div class="layout__mobile-heading">
            <small>{{ brandName }}</small>
            <strong>{{ mobileTitle }}</strong>
          </div>
        </div>
        <div class="layout__mobile-actions">
          <el-badge v-if="canViewNotifications" :value="unreadCount" :hidden="unreadCount === 0" :max="99">
            <button type="button" class="layout__mobile-icon" aria-label="消息中心" @click="openNotifications">
              <el-icon><Bell /></el-icon>
            </button>
          </el-badge>
          <button
            type="button"
            class="layout__mobile-avatar"
            aria-label="进入个人中心"
            @click="handleCommand('profile')"
          >
            {{ userName.slice(0, 1) }}
          </button>
        </div>
      </header>

      <header class="layout__header">
        <el-button
          text
          class="layout__collapse"
          :title="isExamMobile ? (examNavOpen ? '收起导航' : '展开导航') : app.sidebarCollapsed ? '展开侧栏' : '收起侧栏'"
          :aria-label="isExamMobile ? (examNavOpen ? '收起导航' : '展开导航') : app.sidebarCollapsed ? '展开侧栏' : '收起侧栏'"
          :aria-expanded="isExamMobile ? examNavOpen : !app.sidebarCollapsed"
          aria-controls="app-main-navigation"
          @click="isExamMobile ? (examNavOpen = !examNavOpen) : app.toggleSidebar()"
        >
          <el-icon :size="18"><component :is="isExamMobile || app.sidebarCollapsed ? Expand : Fold" /></el-icon>
        </el-button>
        <div class="layout__page-context"><el-breadcrumb separator="/">
          <el-breadcrumb-item v-for="(title, index) in breadcrumbs" :key="index">
            {{ title }}
          </el-breadcrumb-item>
        </el-breadcrumb><h1 class="layout__page-title">{{ desktopTitle }}</h1></div>
        <div class="layout__spacer" />
        <time class="layout__date" :datetime="currentDate.toISOString()">{{ dateLabel }}</time>
        <!-- 全局搜索（设计稿 .search + ⌘K 提示） -->
        <button type="button" aria-label="搜索菜单与功能" class="layout__search" @click="openSearch">
          <el-icon class="layout__search-ic"><Search /></el-icon>
          <span class="layout__search-ph">搜索菜单与功能</span>
          <kbd class="layout__kbd">{{ searchShortcut }}</kbd>
        </button>
        <el-badge v-if="canViewNotifications" :value="unreadCount" :hidden="unreadCount === 0" :max="99" class="layout__bell">
          <el-button text class="layout__bell-btn" aria-label="消息中心" @click="openNotifications">
            <el-icon :size="18"><Bell /></el-icon>
          </el-button>
        </el-badge>
        <!-- 帮助（设计稿 .iconbtn title="帮助"） -->
        <button type="button" class="layout__iconbtn" title="帮助" aria-label="帮助" @click="helpVisible = true">
          <el-icon :size="18"><QuestionFilled /></el-icon>
        </button>
        <el-dropdown trigger="click" @command="handleCommand" class="layout__account-menu"><button type="button" class="layout__account" aria-label="账号菜单"><span class="layout__account-avatar">{{ userName.slice(0, 1) }}</span><span class="layout__account-info"><strong>{{ userName }}</strong><small>{{ roleLabel }}</small></span><el-icon><ArrowDown /></el-icon></button><template #dropdown><el-dropdown-menu><el-dropdown-item command="profile"><el-icon><User /></el-icon>个人中心</el-dropdown-item><el-dropdown-item command="password"><el-icon><Key /></el-icon>修改密码</el-dropdown-item><el-dropdown-item command="security"><el-icon><Lock /></el-icon>账号安全</el-dropdown-item><el-dropdown-item command="logout" divided><el-icon><SwitchButton /></el-icon>退出登录</el-dropdown-item></el-dropdown-menu></template></el-dropdown>
      </header>

      <main class="layout__content">
        <!-- 同类详情切换实体时重新初始化表单与监控连接；查询筛选变化仍保留页面。 -->
        <RouterView :key="route.path" />
      </main>
    </div>

    <nav v-if="isExaminee && !isFocusedExamineeRoute" class="layout__mobile-nav" aria-label="考生导航">
      <button
        v-for="item in mobileNavItems"
        :key="item.key"
        type="button"
        class="layout__mobile-nav-item"
        :class="{ 'is-active': activeMenu === item.path }"
        :aria-current="activeMenu === item.path ? 'page' : undefined"
        @click="navigateMobile(item.path)"
      >
        <el-icon><component :is="item.icon" /></el-icon>
        <span>{{ item.text.replace('我的', '') || item.text }}</span>
      </button>
    </nav>

    <el-backtop
      v-if="isExaminee && !isFocusedExamineeRoute"
      class="layout__mobile-backtop"
      :visibility-height="600"
      aria-label="返回顶部"
      title="返回顶部"
    />

    <ChangePasswordDialog v-model="pwdVisible" />

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

  // ---------- 白色侧栏：菜单权限与分组结构沿用现有实现 ----------
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
    gap: 8px;
    padding: 0 12px;
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
    flex: 1;
    min-width: 0;
    max-width: none;
    overflow: visible;
    font-size: 13.5px;
    font-weight: 600;
    line-height: 1.2;
    letter-spacing: -0.01em;
    color: $text-primary;
    white-space: nowrap;
    text-overflow: clip;
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
      background: $text-secondary;
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

  &__mobile-header,
  &__mobile-nav,
  &__mobile-backtop {
    display: none;
  }

  @media (max-width: 700px) {
    &.is-management-layout {
      .layout__aside { position: fixed; inset: 0 auto 0 0; z-index: 90; width: $sidebar-width; transform: translateX(-100%); transition: transform $transition-base; }
      &.is-exam-nav-open .layout__aside { transform: translateX(0); }
      .layout__exam-nav-backdrop { position: fixed; inset: 0; z-index: 80; border: 0; background: rgba($text-primary, 0.32); }
      .layout__main { width: 100%; }
      .layout__content { padding: 16px; }
      .layout__header { padding: 0 12px; gap: 8px; }
      .layout__header :deep(.el-breadcrumb) { min-width: 0; white-space: nowrap; }
    }
  }

  // 手机考生端使用统一的移动信息架构，而不是只在练题路由切换外壳。
  @media (max-width: 900px) {
    &.is-examinee-layout {
      height: auto;
      min-height: 100vh;
      min-height: 100dvh;
      overflow: visible;

      .layout__aside,
      .layout__header {
        display: none;
      }

      .layout__main,
      .layout__content {
        min-height: 100vh;
        min-height: 100dvh;
        overflow: visible;
      }

      .layout__main {
        width: 100%;
      }

      .layout__mobile-header {
        position: sticky;
        top: 0;
        z-index: 40;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        height: calc(58px + env(safe-area-inset-top));
        padding: env(safe-area-inset-top) 16px 0;
        box-sizing: border-box;
        background: rgba(255, 255, 255, 0.96);
        border-bottom: 1px solid $border-color;
        backdrop-filter: blur(12px);
      }

      .layout__mobile-brand,
      .layout__mobile-actions {
        display: flex;
        align-items: center;
      }

      .layout__mobile-brand { min-width: 0; gap: 10px; }
      .layout__mobile-actions { flex: 0 0 auto; gap: 10px; }
      .layout__mobile-mark {
        display: grid;
        place-items: center;
        width: 30px;
        height: 30px;
        flex: 0 0 30px;
        border-radius: 8px;
        background: $color-primary;
        color: #fff;
        font-size: 14px;
        font-weight: 700;
      }
      .layout__mobile-heading {
        min-width: 0;
        display: flex;
        flex-direction: column;
        line-height: 1.2;

        small {
          overflow: hidden;
          color: $text-secondary;
          font-size: 10px;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        strong {
          overflow: hidden;
          color: $text-primary;
          font-size: 15px;
          font-weight: 650;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
      }
      .layout__mobile-icon,
      .layout__mobile-avatar {
        display: grid;
        place-items: center;
        width: 34px;
        height: 34px;
        padding: 0;
        border: 1px solid $border-color;
        border-radius: 50%;
        background: $bg-paper;
        color: $text-secondary;
      }
      .layout__mobile-avatar {
        border-color: $color-primary-border;
        background: $color-primary-soft;
        color: $color-primary;
        font-size: 12px;
        font-weight: 700;
      }

      .layout__content {
        padding: 14px 12px calc(76px + env(safe-area-inset-bottom));
        scrollbar-gutter: auto;
        scroll-padding-bottom: calc(82px + env(safe-area-inset-bottom));
        background: $bg-page;
      }

      // 长列表仅渲染视口附近的卡片；不支持该属性的浏览器会自然回退为普通渲染。
      .layout__content :deep(.my-exam__item),
      .layout__content :deep(.my-score__mobile-card),
      .layout__content :deep(.my-retake__mobile-card),
      .layout__content :deep(.notif__item),
      .layout__content :deep(.sd__q),
      .layout__content :deep(.wb__item),
      .layout__content :deep(.fav__item) {
        content-visibility: auto;
        contain-intrinsic-size: auto 180px;
      }

      .layout__mobile-nav {
        position: fixed;
        inset: auto 0 0;
        z-index: 50;
        display: grid;
        grid-template-columns: repeat(5, minmax(0, 1fr));
        padding: 5px 6px calc(5px + env(safe-area-inset-bottom));
        background: rgba(255, 255, 255, 0.97);
        border-top: 1px solid $border-color;
        box-shadow: 0 -4px 18px rgba(15, 23, 42, 0.06);
        backdrop-filter: blur(12px);
        isolation: isolate;
        pointer-events: auto;
      }
      .layout__mobile-nav-item {
        position: relative;
        z-index: 1;
        min-width: 0;
        height: 50px;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 3px;
        padding: 0 2px;
        border: 0;
        border-radius: 8px;
        background: transparent;
        color: $text-secondary;
        font-size: 10px;
        cursor: pointer;
        touch-action: manipulation;
        user-select: none;
        -webkit-tap-highlight-color: transparent;

        .el-icon { font-size: 19px; }
        &.is-active { background: $color-primary-soft; color: $color-primary; font-weight: 650; }
      }

      .layout__mobile-backtop {
        right: 14px !important;
        bottom: calc(70px + env(safe-area-inset-bottom)) !important;
        z-index: 49;
        display: grid;
        width: 38px;
        height: 38px;
        border: 1px solid $color-primary-border;
        background: $bg-paper;
        color: $color-primary;
        box-shadow: 0 2px 10px rgba(15, 23, 42, 0.1);
      }

      :deep(.page-header) {
        align-items: flex-start;
        gap: 10px;
        margin-bottom: 12px;
      }
      :deep(.page-header__title) { display: none; }
      :deep(.page-header__text) { flex-basis: 100%; }
      :deep(.page-header__desc) { margin-top: 0; line-height: 1.55; }
      :deep(.page-header__actions) { width: 100%; margin-left: 0; }
      :deep(.stat-card .el-card__body) { padding: 12px; }

      &.is-practice-route .layout__content,
      &.is-focused-examinee-route .layout__content {
        padding: 0;
        background: $practice-bg;
      }

      &.is-focused-examinee-route {
        .layout__main,
        .layout__content { min-height: 100vh; min-height: 100dvh; }
      }
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
