/**
 * 练题登录会话 store（Pinia setup 语法）。
 *
 * 与内网 `stores/auth` **完全独立**：Token 存 `localStorage['practice.token']`（不复用内网 Token）；
 * 练题登录态仅解锁练题能力。微信内核隐私模式下 `localStorage` 可能异常 → 读写一律 try/catch 兜底。
 */
import { computed, ref } from 'vue';
import { defineStore } from 'pinia';
import type { PracticeUser } from '@/types';
import * as practiceApi from '@/api/practice';
import { PRACTICE_TOKEN_KEY, resetPracticeUnauthorizedGuard } from '@/api/http';

/** 安全读取 localStorage（隐私模式/异常时返回 null，视为未登录）。 */
function safeGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

/** 安全写入 localStorage（异常时静默忽略）。 */
function safeSet(key: string, value: string | null): void {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    /* 忽略：微信隐私模式等场景下不可写 */
  }
}

export const usePracticeAuthStore = defineStore('practiceAuth', () => {
  const token = ref<string | null>(safeGet(PRACTICE_TOKEN_KEY));
  const currentUser = ref<PracticeUser | null>(null);
  const initializing = ref(true);

  /** 是否已登录（以 currentUser 为准） */
  const isLoggedIn = computed<boolean>(() => currentUser.value !== null);

  /** 清空本地练题会话（Token + 用户） */
  function clearSession(): void {
    token.value = null;
    currentUser.value = null;
    safeSet(PRACTICE_TOKEN_KEY, null);
  }

  /** 登录：写练题 Token 并设置当前用户 */
  async function login(
    username: string,
    password: string,
    captchaId?: string,
    captcha?: string,
  ): Promise<PracticeUser> {
    const { token: newToken, user } = await practiceApi.login(username, password, captchaId, captcha);
    token.value = newToken;
    safeSet(PRACTICE_TOKEN_KEY, newToken);
    currentUser.value = user;
    resetPracticeUnauthorizedGuard();
    return user;
  }

  /**
   * 登出：先清本地会话，再用快照 Token 通知后端（尽力而为，失败不打扰用户）。
   */
  function logout(): void {
    const snapshot = token.value ?? safeGet(PRACTICE_TOKEN_KEY);
    clearSession();
    if (snapshot) {
      void practiceApi.logout(snapshot).catch(() => {
        /* 无状态登出：后端通知失败无需打扰用户 */
      });
    }
  }

  /** 恢复练题会话：无 Token 直接结束；有 Token 拉取当前用户，失败清会话 */
  async function restore(): Promise<void> {
    if (!token.value) {
      initializing.value = false;
      return;
    }
    try {
      currentUser.value = await practiceApi.fetchMe();
    } catch {
      clearSession();
    } finally {
      initializing.value = false;
    }
  }

  return { token, currentUser, initializing, isLoggedIn, clearSession, login, logout, restore };
});
