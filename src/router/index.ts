/**
 * 路由表 + 全局守卫（架构 §5.7）。
 * 权限三重同步之一（路由 meta.roles）；另见 layouts/menuConfig.ts（菜单）与后端 requireRole（接口）。
 */
import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
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

// 全局守卫（内网异步恢复会话 + 权限校验）
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
  return true;
});

export default router;
