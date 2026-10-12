/**
 * 系统设置 store（全局单例配置）。
 *
 * 设计要点：
 * - 初始值 = `SETTINGS_DEFAULTS`，因此**后端不可用/未登录时系统表现与引入设置前一致**；
 * - `load()` 只在首次（或 force）真正请求，避免每个页面重复拉取；
 * - 读取失败一律静默保留默认值，不打扰用户（设置是增强项，不是必需项）。
 */
import { defineStore } from 'pinia';
import { ref } from 'vue';
import {
  getPublicSettings,
  getSettings,
  updateSettings,
} from '@/api/settings';
import {
  PUBLIC_SETTINGS_DEFAULTS,
  SETTINGS_DEFAULTS,
  pickPublicSettings,
} from '@/constants/settings';
import type { PublicSettings, SystemSettings } from '@/types';

export const useSettingsStore = defineStore('settings', () => {
  const settings = ref<SystemSettings>({ ...SETTINGS_DEFAULTS });
  const publicSettings = ref<PublicSettings>({ ...PUBLIC_SETTINGS_DEFAULTS });
  const ready = ref(false);
  const loading = ref(false);

  /** 合并后端返回值（缺字段回退默认值，兼容新增字段） */
  function apply(next: Partial<SystemSettings>): void {
    settings.value = { ...SETTINGS_DEFAULTS, ...next };
    publicSettings.value = pickPublicSettings(settings.value);
  }

  /** 加载完整设置（需登录）；已加载过则直接返回，force 时强制刷新 */
  async function load(force = false): Promise<void> {
    if (loading.value) return;
    if (ready.value && !force) return;
    loading.value = true;
    try {
      apply(await getSettings());
      ready.value = true;
    } catch {
      /* 静默：保留默认值 */
    } finally {
      loading.value = false;
    }
  }

  /** 加载公开品牌设置（无需登录，登录页调用） */
  async function loadPublic(): Promise<void> {
    try {
      const data = await getPublicSettings();
      publicSettings.value = { ...PUBLIC_SETTINGS_DEFAULTS, ...data };
    } catch {
      /* 静默：保留默认值 */
    }
  }

  /** 保存设置（仅 admin）；成功后同步本地 */
  async function save(payload: SystemSettings): Promise<void> {
    apply(await updateSettings(payload));
    ready.value = true;
  }

  /** 恢复为内置默认值（仅本地，用于表单「恢复默认」） */
  function resetToDefaults(): SystemSettings {
    return { ...SETTINGS_DEFAULTS };
  }

  return {
    settings,
    publicSettings,
    ready,
    loading,
    load,
    loadPublic,
    save,
    resetToDefaults,
  };
});
