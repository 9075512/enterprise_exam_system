/**
 * 路由表 + 全局守卫（架构 §5.7）。
 * 权限三重同步之一（路由 meta.roles）；另见 layouts/menuConfig.ts（菜单）与后端 requireRole（接口）。
 */
import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import { usePracticeAuthStore } from '@/stores/practiceAuth';
import type { Role } from '@/types';

const routes: RouteRecordRaw[] = [
  // ============================================================
  // 公网练题（独立布局，无后台侧栏；仅移动端）
  // 说明：练题路由使用 `meta.practice` 走独立的登录守卫（练题登录态），
  //       与内网 `meta.public/roles` 互不干扰。
  // ============================================================
  {
    path: '/practice',
    name: 'practice-login',
    component: () => import('@/views/practice/PracticeLoginPage.vue'),
    meta: { practice: true, title: '在线练题' },
  },
  {
    path: '/practice/home',
    name: 'practice-home',
    component: () => import('@/views/practice/PracticeHomePage.vue'),
    meta: { practice: true, requiresPracticeAuth: true, title: '在线练题' },
  },
  {
    path: '/practice/banks/:bankId',
    name: 'practice-session',
    component: () => import('@/views/practice/PracticeSessionPage.vue'),
    meta: { practice: true, requiresPracticeAuth: true, title: '练题' },
  },
  {
    path: '/practice/reans',
    name: 'practice-reans',
    component: () => import('@/views/practice/PracticeSessionPage.vue'),
    meta: { practice: true, requiresPracticeAuth: true, reans: true, title: '错题复习' },
  },
  {
    path: '/practice/wrong-book',
    name: 'practice-wrong-book',
    component: () => import('@/views/practice/PracticeWrongBookPage.vue'),
    meta: { practice: true, requiresPracticeAuth: true, title: '错题本' },
  },
  {
    path: '/practice/report',
    name: 'practice-report',
    component: () => import('@/views/practice/PracticeReportPage.vue'),
    meta: { practice: true, requiresPracticeAuth: true, title: '学习报告' },
  },
  {
    path: '/practice/favorites',
    name: 'practice-favorites',
    component: () => import('@/views/practice/PracticeFavoritesPage.vue'),
    meta: { practice: true, requiresPracticeAuth: true, title: '我的收藏' },
  },
  {
    path: '/practice/profile',
    name: 'practice-profile',
    component: () => import('@/views/practice/PracticeProfilePage.vue'),
    meta: { practice: true, requiresPracticeAuth: true, title: '我的' },
  },

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
        meta: { roles: ['admin'], title: '数据总览' },
      },
      {
        path: 'admin/departments',
        component: () => import('@/views/admin/DepartmentPage.vue'),
        meta: { roles: ['admin'], title: '科室管理' },
      },
      {
        path: 'admin/users',
        component: () => import('@/views/admin/UserPage.vue'),
        meta: { roles: ['admin'], title: '用户管理' },
      },
      {
        path: 'admin/exams',
        component: () => import('@/views/admin/ExamManagePage.vue'),
        meta: { roles: ['admin'], title: '考试管理' },
      },
      {
        path: 'admin/scores',
        component: () => import('@/views/admin/ScoreReportPage.vue'),
        meta: { roles: ['admin'], title: '成绩报表' },
      },
      {
        path: 'admin/settings',
        component: () => import('@/views/admin/SettingsPage.vue'),
        meta: { roles: ['admin'], title: '系统设置' },
      },
      // 出题人 + 管理员（题库/试卷域同权）
      {
        path: 'author/banks',
        component: () => import('@/views/author/QuestionBankListPage.vue'),
        meta: { roles: ['admin', 'author'], title: '题库管理' },
      },
      {
        path: 'author/banks/:bankId',
        component: () => import('@/views/author/QuestionBankDetailPage.vue'),
        meta: { roles: ['admin', 'author'], title: '题库详情' },
      },
      {
        path: 'author/papers',
        component: () => import('@/views/author/PaperPage.vue'),
        meta: { roles: ['admin', 'author'], title: '试卷管理' },
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
        meta: { roles: ['examinee'], title: '我的考试' },
      },
      {
        path: 'exam/scores',
        component: () => import('@/views/exam/MyScorePage.vue'),
        meta: { roles: ['examinee'], title: '我的成绩' },
      },
      // 成绩明细：管理员（任意）/ 考生（仅本人，页面内校验）
      {
        path: 'score-detail/:recordId',
        component: () => import('@/views/exam/ScoreDetailPage.vue'),
        meta: { roles: ['admin', 'examinee'], title: '成绩明细' },
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

// 全局守卫（练题登录态 + 内网异步恢复会话 + 权限校验）
router.beforeEach(async (to) => {
  // 练题路由：走独立的练题登录守卫（不触碰内网登录态）
  if (to.meta.practice) {
    const practiceAuth = usePracticeAuthStore();
    if (practiceAuth.initializing) await practiceAuth.restore();
    if (to.meta.requiresPracticeAuth && !practiceAuth.isLoggedIn) {
      return { path: '/practice', query: { redirect: to.fullPath } };
    }
    if (to.path === '/practice' && practiceAuth.isLoggedIn) {
      return typeof to.query.redirect === 'string' && to.query.redirect !== ''
        ? to.query.redirect
        : '/practice/home';
    }
    return true;
  }

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
  return true;
});

export default router;
