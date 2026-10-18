/**
 * 菜单权限 store（v1.5）。
 * 加载当前用户可见菜单 key（`GET /api/permissions/my`）；加载失败时不授予菜单，避免扩大自定义角色权限。
 */
import { defineStore } from 'pinia';
import { ref } from 'vue';
import { getMyMenus } from '@/api/permissions';
import type { Role } from '@/types';

export const usePermissionsStore = defineStore('permissions', () => {
  /** 当前用户可见菜单 key；null = 未加载 */
  const myMenus = ref<string[] | null>(null);
  const loaded = ref(false);
  let pending: Promise<void> | null = null;
  let generation = 0;

  /** 加载当前角色可见菜单（幂等；失败时不授予菜单）。 */
  async function load(): Promise<void> {
    if (loaded.value) return;
    if (pending) return pending;
    const current = generation;
    pending = (async () => {
      try {
        const result = await getMyMenus();
        if (current === generation) myMenus.value = result.menus;
      } catch {
        if (current === generation) myMenus.value = [];
      } finally {
        if (current === generation) {
          loaded.value = true;
          pending = null;
        }
      }
    })();
    return pending;
  }

  /** Account switches must not reuse the previous user's menu permissions. */
  function reset(): void {
    generation += 1;
    pending = null;
    myMenus.value = null;
    loaded.value = false;
  }

  /** 当前角色是否可见某菜单。未加载时不授予菜单。 */
  function hasMenu(key: string, role: Role): boolean {
    if (myMenus.value) return myMenus.value.includes(key);
    return false;
  }

  /** 当前用户可见菜单 key（供菜单渲染）。 */
  function menusFor(role: Role): string[] | null {
    return myMenus.value ?? [];
  }

  return { myMenus, loaded, load, reset, hasMenu, menusFor };
});
