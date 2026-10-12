/**
 * 鉴权 store（Pinia setup 语法，架构 §5.6）。
 * 仅存 Token 于 localStorage；用户信息经 /api/auth/me 恢复。
 * 注意：401 全局回调在 main.ts 注册（此处不 import router，避免循环依赖）。
 */
import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import type { Role, User } from '@/types';
import {
  changePassword as apiChangePassword,
  fetchMe as apiFetchMe,
  login as apiLogin,
  logout as apiLogout,
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

  /** 登录：写 Token 到 localStorage 并设置当前用户 */
  async function login(username: string, password: string): Promise<User> {
    const { token: newToken, user } = await apiLogin(username, password);
    token.value = newToken;
    localStorage.setItem(TOKEN_KEY, newToken);
    currentUser.value = user;
    resetUnauthorizedGuard(); // 重新武装 401 处理，保证下次会话失效仍会提示
    return user;
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
    logout,
    fetchMe,
    changePassword,
    clearSession,
  };
});
