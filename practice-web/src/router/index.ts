/**
 * 公网练题路由表 + 练题登录守卫（仅练题端，无内网 auth 逻辑）。
 */
import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router';
import { usePracticeAuthStore } from '@/stores/practiceAuth';
import { usePageProgress } from '@/composables/usePageProgress';

const routes: RouteRecordRaw[] = [
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
  { path: '/:pathMatch(.*)*', redirect: '/practice' },
];

const router = createRouter({ history: createWebHistory(), routes });

// 练题登录守卫（独立于内网登录态）
// Loading 体系 ⑤：导航期间顶栏进度细条
const pageProgress = usePageProgress();
router.beforeEach(async (to) => {
  pageProgress.start();
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
  }
  return true;
});

router.afterEach(() => pageProgress.done());
router.onError(() => pageProgress.done());

export default router;
