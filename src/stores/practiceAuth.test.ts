/**
 * 练题登录 store（practiceAuth）回归测试。
 *
 * 覆盖：登录写练题 Token 与用户、登出先清本地再用快照 Token 通知后端、
 * 会话恢复（成功/失败）、以及微信隐私模式下 localStorage 异常的兜底（try/catch）。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';

const mocks = vi.hoisted(() => ({
  loginApi: vi.fn(),
  logoutApi: vi.fn(async (_token: string) => null),
  fetchMeApi: vi.fn(),
  resetGuard: vi.fn(),
}));

vi.mock('@/api/practice', () => ({
  login: mocks.loginApi,
  logout: mocks.logoutApi,
  fetchMe: mocks.fetchMeApi,
}));

vi.mock('@/api/http', () => ({
  PRACTICE_TOKEN_KEY: 'practice.token',
  resetPracticeUnauthorizedGuard: mocks.resetGuard,
}));

import { usePracticeAuthStore } from './practiceAuth';
import { PRACTICE_TOKEN_KEY } from '@/api/http';

const USER = { id: 'user-zhangsan', username: 'zhangsan', name: '张三', role: 'examinee' as const };

describe('practiceAuth store', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    setActivePinia(createPinia());
  });

  it('登录：写练题 Token + 用户，并重新武装练题 401 闸门', async () => {
    mocks.loginApi.mockResolvedValueOnce({ token: 'pt-new', user: USER });
    const store = usePracticeAuthStore();

    const user = await store.login('zhangsan', '123456');

    expect(user).toEqual(USER);
    expect(store.token).toBe('pt-new');
    expect(store.currentUser).toEqual(USER);
    expect(store.isLoggedIn).toBe(true);
    expect(localStorage.getItem(PRACTICE_TOKEN_KEY)).toBe('pt-new');
    expect(mocks.resetGuard).toHaveBeenCalledTimes(1);
  });

  it('登出：先清本地会话，再用快照的旧 Token 通知后端', () => {
    localStorage.setItem(PRACTICE_TOKEN_KEY, 'pt-old');
    const store = usePracticeAuthStore();
    expect(store.token).toBe('pt-old');

    store.logout();

    expect(localStorage.getItem(PRACTICE_TOKEN_KEY)).toBeNull();
    expect(store.token).toBeNull();
    expect(store.currentUser).toBeNull();
    expect(mocks.logoutApi).toHaveBeenCalledTimes(1);
    expect(mocks.logoutApi).toHaveBeenCalledWith('pt-old');
  });

  it('无 Token 时不发登出请求', () => {
    const store = usePracticeAuthStore();
    store.logout();
    expect(mocks.logoutApi).not.toHaveBeenCalled();
  });

  it('恢复会话：无 Token → 直接结束且不请求 me', async () => {
    const store = usePracticeAuthStore();
    await store.restore();
    expect(mocks.fetchMeApi).not.toHaveBeenCalled();
    expect(store.isLoggedIn).toBe(false);
    expect(store.initializing).toBe(false);
  });

  it('恢复会话：有 Token 且 me 成功 → 设置用户', async () => {
    localStorage.setItem(PRACTICE_TOKEN_KEY, 'pt');
    mocks.fetchMeApi.mockResolvedValueOnce(USER);
    const store = usePracticeAuthStore();

    await store.restore();

    expect(mocks.fetchMeApi).toHaveBeenCalledTimes(1);
    expect(store.currentUser).toEqual(USER);
    expect(store.isLoggedIn).toBe(true);
    expect(store.initializing).toBe(false);
  });

  it('恢复会话：me 失败（Token 失效）→ 清空会话', async () => {
    localStorage.setItem(PRACTICE_TOKEN_KEY, 'pt-bad');
    mocks.fetchMeApi.mockRejectedValueOnce(new Error('401'));
    const store = usePracticeAuthStore();

    await store.restore();

    expect(store.token).toBeNull();
    expect(store.currentUser).toBeNull();
    expect(localStorage.getItem(PRACTICE_TOKEN_KEY)).toBeNull();
  });

  it('localStorage 读取异常（隐私模式）不抛错，视为未登录', () => {
    const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    try {
      const store = usePracticeAuthStore();
      expect(store.token).toBeNull();
      expect(store.isLoggedIn).toBe(false);
    } finally {
      spy.mockRestore();
    }
  });

  it('localStorage 写入异常（隐私模式）不抛错，内存 Token 仍生效', async () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    try {
      mocks.loginApi.mockResolvedValueOnce({ token: 'pt-mem', user: USER });
      const store = usePracticeAuthStore();
      await store.login('zhangsan', '123456');
      expect(store.token).toBe('pt-mem');
      expect(store.isLoggedIn).toBe(true);
    } finally {
      spy.mockRestore();
    }
  });
});
