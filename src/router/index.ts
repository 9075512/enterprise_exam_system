/**
 * 路由表 + 全局守卫（架构 §5.7）。
 * 权限三重同步：路由 meta.roles（角色）+ meta.menuKey（菜单权限）+ 后端 requireRole（接口）。
 * 菜单权限：v1.5 起，带 `meta.menuKey` 的路由在进入时校验当前角色是否被授权该菜单（见守卫）。
 */
import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router';
import { installPageProgress } from '@/composables/usePageProgress';
import { createAuthGuard } from './guard';

const routes: RouteRecordRaw[] = [
  {
    path: '/no-access',
    component: () => import('@/views/common/NoAccessPage.vue'),
    meta: { title: '暂无页面权限' },
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
        path: 'admin/subjects',
        component: () => import('@/views/admin/SubjectManagePage.vue'),
        meta: { roles: ['admin'], menuKey: 'subjects', title: '科目管理' },
      },
      { path: 'admin/org-extensions', component: () => import('@/views/admin/OrgExtensionsPage.vue'), meta: { roles: ['admin'], menuKey: 'org-extensions', title: '用户组与岗位' } },
      { path: 'admin/templates', component: () => import('@/views/admin/TemplateManagePage.vue'), meta: { roles: ['admin', 'author'], menuKey: 'templates', title: '模板管理' } },
      { path: 'admin/question-feedback', component: () => import('@/views/admin/QuestionFeedbackPage.vue'), meta: { roles: ['admin', 'author'], menuKey: 'question-feedback', title: '题目反馈' } },
      { path: 'admin/duplicate-questions', component: () => import('@/views/admin/DuplicateQuestionsPage.vue'), meta: { roles: ['admin'], menuKey: 'duplicate-questions', title: '重复题审计' } },
      { path: 'admin/practice-monitor', component: () => import('@/views/admin/PracticeMonitorPage.vue'), meta: { roles: ['admin'], menuKey: 'practice-monitor', title: '练题监控' } },
      {
        path: 'admin/exams',
        component: () => import('@/views/admin/ExamManagePage.vue'),
        meta: { roles: ['admin', 'author'], menuKey: 'exams', title: '考试管理' },
      },
      { path: 'admin/exams/new', component: () => import('@/views/admin/ExamEditorPage.vue'), meta: { roles: ['admin'], menuKey: 'exams', title: '新建考试' } },
      { path: 'admin/exams/:id/edit', component: () => import('@/views/admin/ExamEditorPage.vue'), meta: { roles: ['admin', 'author'], menuKey: 'exams', title: '编辑考试' } },
      { path: 'admin/exams/:id/preview', component: () => import('@/views/author/PaperPreviewPage.vue'), meta: { roles: ['admin', 'author'], menuKey: 'exams', title: '题目预览' } },
      {
        path: 'admin/exams/:id/monitor',
        component: () => import('@/views/admin/ExamMonitorPage.vue'),
        meta: { roles: ['admin'], menuKey: 'exams', title: '监考监控' },
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
        path: 'admin/appeals',
        component: () => import('@/views/admin/AppealManagePage.vue'),
        meta: { roles: ['admin'], menuKey: 'appeals', title: '成绩复核' },
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
        path: 'admin/content',
        component: () => import('@/views/admin/ContentViewPage.vue'),
        meta: { roles: ['admin'], menuKey: 'content', title: '公告与轮播' },
      },
      {
        path: 'admin/home-config',
        component: () => import('@/views/admin/HomeConfigPage.vue'),
        meta: { roles: ['admin'], menuKey: 'home-config', title: '首页配置' },
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
      {
        path: 'admin/audit',
        component: () => import('@/views/admin/AuditLogPage.vue'),
        meta: { roles: ['admin'], menuKey: 'audit', title: '审计日志' },
      },
      {
        path: 'admin/login-logs',
        component: () => import('@/views/admin/LoginLogPage.vue'),
        meta: { roles: ['admin'], menuKey: 'login-logs', title: '登录日志' },
      },
      {
        path: 'admin/maintenance',
        component: () => import('@/views/admin/SystemMaintenancePage.vue'),
        meta: { roles: ['admin'], menuKey: 'maintenance', title: '系统维护' },
      },
      // 出题人 + 管理员（题库/试卷域同权）
      {
        path: 'author/banks',
        component: () => import('@/views/author/QuestionBankListPage.vue'),
        meta: { roles: ['admin', 'author'], menuKey: 'banks', title: '题库管理' },
      },
      {
        path: 'author/banks/:bankId',
        redirect: (to) => ({ path: '/author/banks', query: { bankId: String(to.params.bankId) } }),
        meta: { roles: ['admin', 'author'], title: '科目题库' },
      },
      { path: 'author/papers/:legacyPath(.*)*', redirect: '/admin/exams' },
      // 考生
      {
        path: 'exam/home',
        component: () => import('@/views/exam/ExamHomePage.vue'),
        meta: { roles: ['examinee'], menuKey: 'home', title: '首页' },
      },
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
        meta: { roles: ['examinee'], menuKey: 'my-retakes', title: '我的补考' },
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
        meta: { roles: ['admin', 'author', 'examinee'], menuKey: 'exam-messages', title: '消息中心' },
      },
      {
        path: 'profile',
        name: 'profile',
        component: () => import('@/views/common/ProfilePage.vue'),
        meta: { roles: ['admin', 'author', 'examinee'], title: '个人中心' },
      },
      // 考试与练题共用主登录态；PC 保留考试系统框架，移动端由练题布局接管导航。
      {
        path: 'exam/practice',
        name: 'practice-home',
        component: () => import('@/views/practice/PracticeHomePage.vue'),
        meta: { roles: ['admin', 'author', 'examinee'], menuKey: 'practice', title: '练题' },
      },
      {
        path: 'exam/practice/banks/:bankId',
        name: 'practice-session',
        component: () => import('@/views/practice/PracticeSessionPage.vue'),
        meta: { roles: ['admin', 'author', 'examinee'], menuKey: 'practice', title: '开始练题' },
      },
      {
        path: 'exam/practice/reans',
        name: 'practice-reans',
        component: () => import('@/views/practice/PracticeSessionPage.vue'),
        meta: { roles: ['admin', 'author', 'examinee'], menuKey: 'practice', title: '再次练习' },
      },
      {
        path: 'exam/practice/wrong-book',
        name: 'practice-wrong-book',
        component: () => import('@/views/practice/PracticeWrongBookPage.vue'),
        meta: { roles: ['admin', 'author', 'examinee'], menuKey: 'practice', title: '错题本' },
      },
      {
        path: 'exam/practice/report',
        name: 'practice-report',
        component: () => import('@/views/practice/PracticeReportPage.vue'),
        meta: { roles: ['admin', 'author', 'examinee'], menuKey: 'practice', title: '学习报告' },
      },
      {
        path: 'exam/practice/favorites',
        name: 'practice-favorites',
        component: () => import('@/views/practice/PracticeFavoritesPage.vue'),
        meta: { roles: ['admin', 'author', 'examinee'], menuKey: 'practice', title: '收藏夹' },
      },
      {
        path: 'exam/practice/profile',
        name: 'practice-profile',
        component: () => import('@/views/practice/PracticeProfilePage.vue'),
        meta: { roles: ['admin', 'author', 'examinee'], menuKey: 'practice', title: '我的练题' },
      },
    ],
  },
  { path: '/:pathMatch(.*)*', redirect: '/' },
];

const router = createRouter({
  history: createWebHistory(),
  routes,
  // 页面主体在桌面端和移动端使用不同的滚动容器。路由前进时统一回到
  // 页面顶部，避免从成绩列表等长页面进入详情后仍停留在旧滚动位置。
  scrollBehavior(_to, _from, savedPosition) {
    return savedPosition ?? { left: 0, top: 0 };
  },
});

// 全局守卫（内网异步恢复会话 + 角色/菜单权限校验）
installPageProgress(router);
router.beforeEach(createAuthGuard(router));

export default router;
