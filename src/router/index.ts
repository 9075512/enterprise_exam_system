/**
 * 路由表 + 全局守卫（架构 §5.7）。
 * 权限三重同步：路由 meta.roles（角色）+ meta.menuKey（菜单权限）+ 后端 requireRole（接口）。
 * 菜单权限：v1.5 起，带 `meta.menuKey` 的路由在进入时校验当前角色是否被授权该菜单（见守卫）。
 */
import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import { usePermissionsStore } from '@/stores/permissions';
import type { Role } from '@/types';

const routes: RouteRecordRaw[] = [
  {
    path: '/login',
    name: 'login',
    component: () => import('@/views/LoginPage.vue'),
    meta: { public: true, title: '登录' },
  },

  // 全屏答题页（不经 AppLayout）
  {
    path: '/exam/taking/:recordId',
    name: 'exam-taking',
    component: () => import('@/views/exam/ExamTakingPage.vue'),
    meta: { roles: ['examinee'], title: '在线答题' },
  },

  {
    path: '/',
    component: () => import('@/layouts/AppLayout.vue'),
    redirect: '/login',
    children: [
      // 管理员
      {
        path: 'admin/dashboard',
        component: () => import('@/views/admin/DashboardPage.vue'),
        meta: { roles: ['admin'], menuKey: 'dashboard', title: '数据总览' },
      },
      {
        path: 'admin/departments',
        component: () => import('@/views/admin/DepartmentPage.vue'),
        meta: { roles: ['admin'], menuKey: 'departments', title: '科室管理' },
      },
      {
        path: 'admin/users',
        component: () => import('@/views/admin/UserPage.vue'),
        meta: { roles: ['admin'], menuKey: 'users', title: '用户管理' },
      },
      {
        path: 'admin/exams',
        component: () => import('@/views/admin/ExamManagePage.vue'),
        meta: { roles: ['admin'], menuKey: 'exams', title: '考试管理' },
      },
      {
        path: 'admin/retakes',
        component: () => import('@/views/admin/RetakeManagePage.vue'),
        meta: { roles: ['admin'], menuKey: 'retakes', title: '补考管理' },
      },
      {
        path: 'admin/scores',
        component: () => import('@/views/admin/ScoreReportPage.vue'),
        meta: { roles: ['admin'], menuKey: 'scores', title: '成绩报表' },
      },
      {
        path: 'admin/reviews',
        component: () => import('@/views/admin/ReviewPage.vue'),
        meta: { roles: ['admin', 'author'], menuKey: 'reviews', title: '人工阅卷' },
      },
      {
        path: 'admin/practice-settings',
        component: () => import('@/views/admin/PracticeSettingsPage.vue'),
        meta: { roles: ['admin'], menuKey: 'practice-settings', title: '练题端设置' },
      },
      {
        path: 'admin/settings',
        component: () => import('@/views/admin/SettingsPage.vue'),
        meta: { roles: ['admin'], menuKey: 'settings', title: '系统设置' },
      },
      {
        path: 'admin/permissions',
        component: () => import('@/views/admin/MenuPermissionPage.vue'),
        meta: { roles: ['admin'], menuKey: 'permissions', title: '菜单权限' },
      },
      // 出题人 + 管理员（题库/试卷域同权）
      {
        path: 'author/banks',
        component: () => import('@/views/author/QuestionBankListPage.vue'),
        meta: { roles: ['admin', 'author'], menuKey: 'banks', title: '题库管理' },
      },
      {
        path: 'author/banks/:bankId',
        component: () => import('@/views/author/QuestionBankDetailPage.vue'),
        meta: { roles: ['admin', 'author'], title: '题库详情' },
      },
      {
        path: 'author/papers',
        component: () => import('@/views/author/PaperPage.vue'),
        meta: { roles: ['admin', 'author'], menuKey: 'papers', title: '试卷管理' },
      },
      {
        path: 'author/papers/composer',
        component: () => import('@/views/author/PaperComposerPage.vue'),
        meta: { roles: ['admin', 'author'], title: '组卷' },
      },
      {
        path: 'author/papers/:paperId/preview',
        component: () => import('@/views/author/PaperPreviewPage.vue'),
        meta: { roles: ['admin', 'author'], title: '试卷预览' },
      },
      // 考生
      {
        path: 'exam/my',
        component: () => import('@/views/exam/MyExamPage.vue'),
        meta: { roles: ['examinee'], menuKey: 'my-exams', title: '我的考试' },
      },
      {
        path: 'exam/scores',
        component: () => import('@/views/exam/MyScorePage.vue'),
        meta: { roles: ['examinee'], menuKey: 'my-scores', title: '我的成绩' },
      },
      {
        path: 'exam/retakes',
        component: () => import('@/views/exam/MyRetakePage.vue'),
        meta: { roles: ['examinee'], title: '我的补考' },
      },
      // 成绩明细：管理员（任意）/ 考生（仅本人，页面内校验）
      {
        path: 'score-detail/:recordId',
        component: () => import('@/views/exam/ScoreDetailPage.vue'),
        meta: { roles: ['admin', 'examinee'], title: '成绩明细' },
      },
      // 消息中心：所有登录角色（顶栏铃铛入口）
      {
        path: 'notifications',
        component: () => import('@/views/common/NotificationCenterPage.vue'),
        meta: { roles: ['admin', 'author', 'examinee'], title: '消息中心' },
      },
    ],
  },
  { path: '/:pathMatch(.*)*', redirect: '/' },
];

const router = createRouter({ history: createWebHistory(), routes });

/** 角色首页 */
function homePath(role: Role): string {
  if (role === 'admin') return '/admin/dashboard';
  if (role === 'author') return '/author/banks';
  return '/exam/my';
}

// 全局守卫（内网异步恢复会话 + 角色/菜单权限校验）
router.beforeEach(async (to) => {
  const auth = useAuthStore();
  if (auth.initializing) await auth.fetchMe();

  if (to.meta.public) {
    return auth.isLoggedIn && auth.currentUser ? homePath(auth.currentUser.role) : true;
  }
  if (!auth.isLoggedIn) {
    return { path: '/login', query: { redirect: to.fullPath } };
  }

  const roles = to.meta.roles as Role[] | undefined;
  if (roles && auth.currentUser && !roles.some((r) => auth.hasRole(r))) {
    return homePath(auth.currentUser.role); // 无权限 → 回本人首页
  }

  // 菜单权限（v1.5）：带 menuKey 的路由校验当前角色是否被授权该菜单
  const menuKey = to.meta.menuKey as string | undefined;
  if (menuKey && auth.currentUser) {
    const permissions = usePermissionsStore();
    if (!permissions.loaded) await permissions.load();
    if (!permissions.hasMenu(menuKey, auth.currentUser.role)) {
      return homePath(auth.currentUser.role);
    }
  }

  return true;
});

export default router;
