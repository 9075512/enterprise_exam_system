/**
 * 练题登录会话 store 测试（Pinia setup 语法）。
 * 覆盖：login 写会话 / logout 清会话并尽力通知后端 / restore 三分支（无 Token / 成功 / 失败清会话）。
 */
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PRACTICE_TOKEN_KEY } from '@/api/http';
import * as practiceApi from '@/api/practice';
import type { PracticeUser } from '@/types';
import { usePracticeAuthStore } from './practiceAuth';

vi.mock('@/api/practice', () => ({
  login: vi.fn(),
  logout: vi.fn(),
  fetchMe: vi.fn(),
}));

const mockUser: PracticeUser = { id: 'u1', username: 'zhangsan', name: '张三', role: 'examinee' };

function freshStore() {
  setActivePinia(createPinia());
  return usePracticeAuthStore();
}

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
});

describe('practiceAuth store', () => {
  it('login：写 Token 到 localStorage 并设置当前用户', async () => {
    vi.mocked(practiceApi.login).mockResolvedValue({ token: 'tk-1', user: mockUser });
    const store = freshStore();

    const user = await store.login('zhangsan', 'pw');

    expect(user).toEqual(mockUser);
    expect(store.token).toBe('tk-1');
    expect(store.currentUser).toEqual(mockUser);
    expect(store.isLoggedIn).toBe(true);
    expect(localStorage.getItem(PRACTICE_TOKEN_KEY)).toBe('tk-1');
  });

  it('logout：清空本地会话并用快照 Token 通知后端', () => {
    vi.mocked(practiceApi.logout).mockResolvedValue(null);
    localStorage.setItem(PRACTICE_TOKEN_KEY, 'tk-old');
    const store = freshStore();
    store.$patch({ token: 'tk-old' });

    store.logout();

    expect(store.token).toBeNull();
    expect(store.currentUser).toBeNull();
    expect(store.isLoggedIn).toBe(false);
    expect(localStorage.getItem(PRACTICE_TOKEN_KEY)).toBeNull();
    expect(practiceApi.logout).toHaveBeenCalledWith('tk-old');
  });

  it('restore：无 Token 直接结束且不请求后端', async () => {
    const store = freshStore();

    await store.restore();

    expect(practiceApi.fetchMe).not.toHaveBeenCalled();
    expect(store.initializing).toBe(false);
    expect(store.isLoggedIn).toBe(false);
  });

  it('restore：有 Token 且 fetchMe 成功 → 恢复登录态', async () => {
    vi.mocked(practiceApi.fetchMe).mockResolvedValue(mockUser);
    localStorage.setItem(PRACTICE_TOKEN_KEY, 'tk-2');
    const store = freshStore();
    expect(store.initializing).toBe(true);

    await store.restore();

    expect(store.currentUser).toEqual(mockUser);
    expect(store.isLoggedIn).toBe(true);
    expect(store.initializing).toBe(false);
  });

  it('restore：fetchMe 失败 → 清空会话', async () => {
    vi.mocked(practiceApi.fetchMe).mockRejectedValue(new Error('401'));
    localStorage.setItem(PRACTICE_TOKEN_KEY, 'tk-bad');
    const store = freshStore();

    await store.restore();

    expect(store.token).toBeNull();
    expect(store.currentUser).toBeNull();
    expect(localStorage.getItem(PRACTICE_TOKEN_KEY)).toBeNull();
    expect(store.initializing).toBe(false);
  });
});
