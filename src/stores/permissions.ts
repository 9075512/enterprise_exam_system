/**
 * 菜单权限 store（v1.5）。
 * 加载当前用户可见菜单 key（`GET /api/permissions/my`）；失败回退到菜单内置默认角色，
 * 保证后端不可用时系统行为与「未开启菜单权限」一致（不把用户锁在门外）。
 */
import { defineStore } from 'pinia';
import { ref } from 'vue';
import { getMyMenus } from '@/api/permissions';
import { getDefaultKeys } from '@/layouts/menuConfig';
import type { Role } from '@/types';

export const usePermissionsStore = defineStore('permissions', () => {
  /** 当前用户可见菜单 key；null = 未加载（回退默认） */
  const myMenus = ref<string[] | null>(null);
  const loaded = ref(false);
  let pending: Promise<void> | null = null;
  let generation = 0;

  /** 加载当前角色可见菜单（幂等；失败静默回退默认）。 */
  async function load(): Promise<void> {
    if (loaded.value) return;
    if (pending) return pending;
    const current = generation;
    pending = (async () => {
      try {
        const result = await getMyMenus();
        if (current === generation) myMenus.value = result.menus;
      } catch {
        if (current === generation) myMenus.value = null;
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

  /** 当前角色是否可见某菜单。未加载时回退内置默认。 */
  function hasMenu(key: string, role: Role): boolean {
    if (myMenus.value) return myMenus.value.includes(key);
    return getDefaultKeys(role).includes(key);
  }

  /** 当前用户可见菜单 key（供菜单渲染）。 */
  function menusFor(role: Role): string[] | null {
    return myMenus.value ?? getDefaultKeys(role);
  }

  return { myMenus, loaded, load, reset, hasMenu, menusFor };
});
