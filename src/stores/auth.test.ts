/**
 * 回归测试：登出顺序。
 *
 * 背景（真实缺陷）：原实现为
 *   function logout() { apiLogout().catch(() => {}); clearSession(); }
 * 请求拦截器在微任务中读取 localStorage，此时 Token 已被 clearSession 删除，
 * 于是登出请求不带 Authorization → 后端 401 → 触发全局登出回调 → 回调又调 logout() → 无限递归。
 *
 * 修复后要求：logout() **先清本地会话**，再用**快照下来的旧 Token** 通知后端。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';

const mocks = vi.hoisted(() => ({
  logoutApi: vi.fn(async (_token: string) => null),
  loginApi: vi.fn(),
  fetchMeApi: vi.fn(),
  changePwdApi: vi.fn(),
  resetGuard: vi.fn(),
}));

vi.mock('@/api/auth', () => ({
  login: mocks.loginApi,
  logout: mocks.logoutApi,
  fetchMe: mocks.fetchMeApi,
  changePassword: mocks.changePwdApi,
}));

vi.mock('@/api/http', () => ({
  TOKEN_KEY: 'exam_sys.token',
  resetUnauthorizedGuard: mocks.resetGuard,
}));

import { useAuthStore } from './auth';
import { TOKEN_KEY } from '@/api/http';

const USER = {
  id: 'user-admin',
  username: 'admin',
  name: '系统管理员',
  role: 'admin' as const,
  departmentId: null,
  status: 'active' as const,
  createdAt: '2026-10-12T00:00:00.000Z',
};

describe('auth store · 登出', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    setActivePinia(createPinia());
  });

  it('先清空本地会话，再用旧 Token 通知后端', () => {
    localStorage.setItem(TOKEN_KEY, 'tok-old');
    const store = useAuthStore();
    expect(store.token).toBe('tok-old');

    store.logout();

    // 关键点 1：本地同步清空（UI 立即响应，且后续请求不再带失效 Token）
    expect(localStorage.getItem(TOKEN_KEY)).toBeNull();
    expect(store.token).toBeNull();
    expect(store.currentUser).toBeNull();

    // 关键点 2：通知后端时携带的是「快照的旧 Token」，因此不会再自打成 401
    expect(mocks.logoutApi).toHaveBeenCalledTimes(1);
    expect(mocks.logoutApi).toHaveBeenCalledWith('tok-old');
  });

  it('无 Token 时不发登出请求（避免无谓的 401）', () => {
    const store = useAuthStore();
    store.logout();
    expect(mocks.logoutApi).not.toHaveBeenCalled();
  });

  it('后端通知失败不影响本地已清退', async () => {
    mocks.logoutApi.mockRejectedValueOnce(new Error('网络异常'));
    localStorage.setItem(TOKEN_KEY, 'tok-x');
    const store = useAuthStore();

    expect(() => store.logout()).not.toThrow();
    await Promise.resolve();

    expect(localStorage.getItem(TOKEN_KEY)).toBeNull();
    expect(store.currentUser).toBeNull();
  });

  it('登录成功后重新武装 401 闸门（否则下次会话失效不会提示）', async () => {
    mocks.loginApi.mockResolvedValueOnce({ token: 'tok-new', user: USER });
    const store = useAuthStore();

    await store.login('admin', 'admin123');

    expect(mocks.resetGuard).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem(TOKEN_KEY)).toBe('tok-new');
  });
});
