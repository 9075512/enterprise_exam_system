/**
 * 应用级 UI 状态 store（Pinia）。
 * 仅存放需要跨页面共享的界面状态；纯布局内部状态可用局部 ref 替代。
 */
import { defineStore } from 'pinia';
import { ref } from 'vue';

export const useAppStore = defineStore('app', () => {
  /** 侧栏是否折叠 */
  const sidebarCollapsed = ref(false);

  /** 切换侧栏折叠状态 */
  function toggleSidebar(): void {
    sidebarCollapsed.value = !sidebarCollapsed.value;
  }

  /** 显式设置侧栏折叠状态 */
  function setSidebarCollapsed(value: boolean): void {
    sidebarCollapsed.value = value;
  }

  return { sidebarCollapsed, toggleSidebar, setSidebarCollapsed };
});
