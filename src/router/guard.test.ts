import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { createMemoryHistory, createRouter } from 'vue-router';
import { createAuthGuard } from './guard';
import { useAuthStore } from '@/stores/auth';
import { usePermissionsStore } from '@/stores/permissions';
import type { Role, User } from '@/types';

const api = vi.hoisted(() => ({ menus: vi.fn(), login: vi.fn() }));
vi.mock('@/api/permissions', () => ({ getMyMenus: api.menus }));
vi.mock('@/api/auth', () => ({ login: api.login, logout: vi.fn(), fetchMe: vi.fn() }));

function setup(role: Role | null, menus: string[]) {
  const auth = useAuthStore();
  auth.initializing = false;
  auth.currentUser = role ? { id: role, role } as User : null;
  api.menus.mockResolvedValue({ menus });
  const component = { template: '<div />' };
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/login', component, meta: { public: true } },
      { path: '/no-access', component },
      { path: '/admin/dashboard', component, meta: { roles: ['admin'], menuKey: 'dashboard' } },
      { path: '/admin/users', component, meta: { roles: ['admin'], menuKey: 'users' } },
      { path: '/admin/subjects', component, meta: { roles: ['admin'], menuKey: 'subjects' } },
      { path: '/author/banks', component, meta: { roles: ['admin', 'author'], menuKey: 'banks' } },
      { path: '/exam/home', component, meta: { roles: ['examinee'], menuKey: 'home' } },
      { path: '/exam/my', component, meta: { roles: ['examinee'], menuKey: 'my-exams' } },
      { path: '/exam/practice', component, meta: { roles: ['admin', 'author', 'examinee'], menuKey: 'practice' } },
    ],
  });
  router.beforeEach(createAuthGuard(router));
  return router;
}

beforeEach(() => {
  localStorage.clear();
  setActivePinia(createPinia());
  vi.clearAllMocks();
});

describe('login navigation regression', () => {
  it('菜单加载失败时不回退到基础身份的完整权限', async () => {
    const router = setup('admin', []);
    api.menus.mockRejectedValue(new Error('network unavailable'));
    await router.push('/admin/users');
    expect(router.currentRoute.value.path).toBe('/no-access');
    expect(usePermissionsStore().menusFor('admin')).toEqual([]);
  });
  it('default home disabled: lands on an allowed page without redirecting to itself', async () => {
    const router = setup('admin', ['users']);
    await router.push('/admin/dashboard');
    expect(router.currentRoute.value.path).toBe('/admin/users');
  });

  it.each(['admin', 'author', 'examinee'] as Role[])('no menus for %s: reaches a stable no-access page', async (role) => {
    const router = setup(role, []);
    await router.push('/login');
    expect(router.currentRoute.value.path).toBe('/no-access');
    await router.push('/admin/dashboard');
    expect(router.currentRoute.value.path).toBe('/no-access');
  });

  it('does not use a granted menu with an incompatible route role as the fallback', async () => {
    const router = setup('examinee', ['dashboard', 'my-exams']);
    await router.push('/login');
    expect(router.currentRoute.value.path).toBe('/exam/my');
  });

  it('normal home remains preferred', async () => {
    const router = setup('admin', ['users', 'dashboard']);
    await router.push('/login');
    expect(router.currentRoute.value.path).toBe('/admin/dashboard');
  });

  it('subject management is admin-only even when an author receives the menu key', async () => {
    const router = setup('author', ['subjects', 'banks']);
    await router.push('/admin/subjects');
    expect(router.currentRoute.value.path).toBe('/author/banks');
  });

  it.each(['admin', 'author', 'examinee'] as Role[])('online practice accepts the %s role with practice permission', async (role) => {
    const router = setup(role, ['practice']);
    await router.push('/exam/practice');
    expect(router.currentRoute.value.path).toBe('/exam/practice');
  });

  it('unauthenticated navigation preserves the requested destination', async () => {
    const router = setup(null, []);
    await router.push('/admin/users');
    expect(router.currentRoute.value.path).toBe('/login');
    expect(router.currentRoute.value.query.redirect).toBe('/admin/users');
  });

  it('switching accounts reloads permissions before navigation', async () => {
    const router = setup('examinee', ['home']);
    await router.push('/login');
    api.login.mockResolvedValue({ token: 'new-session', user: { id: 'admin', role: 'admin' } });
    api.menus.mockResolvedValue({ menus: ['dashboard'] });
    await useAuthStore().login('admin', 'password');
    await router.push('/admin/dashboard');
    expect(router.currentRoute.value.path).toBe('/admin/dashboard');
    expect(api.menus).toHaveBeenCalledTimes(2);
  });

  it('concurrent permission loads await the same response; stale responses cannot restore old permissions', async () => {
    let resolveOld!: (value: { menus: string[] }) => void;
    api.menus.mockReturnValueOnce(new Promise((resolve) => { resolveOld = resolve; }));
    const permissions = usePermissionsStore();
    const old = permissions.load();
    const concurrent = permissions.load();
    expect(api.menus).toHaveBeenCalledTimes(1);
    permissions.reset();
    api.menus.mockResolvedValueOnce({ menus: ['users'] });
    await permissions.load();
    resolveOld({ menus: ['home'] });
    await Promise.all([old, concurrent]);
    expect(permissions.myMenus).toEqual(['users']);
  });
});
