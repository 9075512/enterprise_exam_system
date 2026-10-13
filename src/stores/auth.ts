/**
 * 鉴权 store（Pinia setup 语法，架构 §5.6）。
 * 仅存 Token 于 localStorage；用户信息经 /api/auth/me 恢复。
 * 注意：401 全局回调在 main.ts 注册（此处不 import router，避免循环依赖）。
 */
import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import type { LoginOutcome, LoginResult, Role, User } from '@/types';
import {
  changePassword as apiChangePassword,
  fetchMe as apiFetchMe,
  login as apiLogin,
  logout as apiLogout,
  verifyTwoFactor as apiVerifyTwoFactor,
} from '@/api/auth';
import { TOKEN_KEY, resetUnauthorizedGuard } from '@/api/http';

export const useAuthStore = defineStore('auth', () => {
  const token = ref<string | null>(localStorage.getItem(TOKEN_KEY));
  const currentUser = ref<User | null>(null);
  const initializing = ref(true);

  /** 是否已登录（以 currentUser 为准） */
  const isLoggedIn = computed(() => currentUser.value !== null);

  /** 当前用户是否属于给定角色之一 */
  function hasRole(...roles: Role[]): boolean {
    return !!currentUser.value && roles.includes(currentUser.value.role);
  }

  /** 清空本地会话（Token + 用户） */
  function clearSession(): void {
    token.value = null;
    currentUser.value = null;
    localStorage.removeItem(TOKEN_KEY);
  }

  /**
   * 登录（v1.7③）。
   * 返回 `TwoFactorChallenge` 时表示账号已开启两步验证，此时**不写本地会话**，
   * 由调用方续走 `completeTwoFactor()`。
   */
  async function login(
    username: string,
    password: string,
    captcha?: { captchaId: string; captcha: string },
  ): Promise<LoginOutcome> {
    const result = await apiLogin(username, password, captcha);
    if ('token' in result) applySession(result);
    return result;
  }

  /** 两步验证第二步：验证通过后写入本地会话。 */
  async function completeTwoFactor(challengeToken: string, code: string): Promise<LoginResult> {
    const result = await apiVerifyTwoFactor(challengeToken, code);
    applySession(result);
    return result;
  }

  /** 写入本地会话（Token + 当前用户）。 */
  function applySession(result: LoginResult): void {
    token.value = result.token;
    localStorage.setItem(TOKEN_KEY, result.token);
    currentUser.value = result.user;
    resetUnauthorizedGuard(); // 重新武装 401 处理，保证下次会话失效仍会提示
  }

  /**
   * 登出。
   *
   * 顺序很关键：**先清本地会话，再用「快照下来的旧 Token」通知后端**。
   * 若反过来（先发请求再清本地），请求拦截器读到的 Token 已被删除，
   * 后端会返回 401，从而触发全局登出回调 —— 而该回调又会调用本函数，形成无限递归弹窗。
   * 本函数是同步的：UI 无需等待网络，后端通知失败也不影响本地已清退。
   */
  function logout(): void {
    const snapshot = token.value ?? localStorage.getItem(TOKEN_KEY);
    clearSession();
    if (snapshot) {
      void apiLogout(snapshot).catch(() => {
        /* 无状态登出：后端通知失败无需打扰用户 */
      });
    }
  }

  /** 恢复会话：无 Token 直接结束；有 Token 则拉取当前用户，失败清会话 */
  async function fetchMe(): Promise<void> {
    if (!token.value) {
      initializing.value = false;
      return;
    }
    try {
      currentUser.value = await apiFetchMe();
    } catch {
      clearSession();
    } finally {
      initializing.value = false;
    }
  }

  /** 修改本人密码 */
  async function changePassword(oldPassword: string, newPassword: string): Promise<void> {
    await apiChangePassword(oldPassword, newPassword);
  }

  return {
    token,
    currentUser,
    initializing,
    isLoggedIn,
    hasRole,
    login,
    completeTwoFactor,
    logout,
    fetchMe,
    changePassword,
    clearSession,
  };
});
