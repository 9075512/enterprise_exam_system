/** 让复用的练题页面读取主系统账号，不再维护第二份登录态。 */
import { computed } from 'vue';
import { defineStore } from 'pinia';
import { useAuthStore } from '@/stores/auth';
import { usePracticeConfigStore } from '@/stores/practiceConfig';
import type { PracticeUser } from '@/types';

export const usePracticeAuthStore = defineStore('practiceAuth', () => {
  const auth = useAuthStore();
  const token = computed(() => auth.token);
  const initializing = computed(() => auth.initializing);
  const isLoggedIn = computed(() => auth.isLoggedIn);
  const currentUser = computed<PracticeUser | null>(() => {
    const user = auth.currentUser;
    if (!user) return null;
    return {
      id: user.id,
      username: user.username,
      name: user.name,
      role: user.role,
      departmentId: user.departmentId,
      departmentName: user.departmentName,
    };
  });

  function clearSession(): void {
    usePracticeConfigStore().reset();
    auth.clearSession();
  }

  function logout(): void {
    usePracticeConfigStore().reset();
    auth.logout();
  }

  async function restore(): Promise<void> { await auth.fetchMe(); }

  return { token, currentUser, initializing, isLoggedIn, clearSession, logout, restore };
});
