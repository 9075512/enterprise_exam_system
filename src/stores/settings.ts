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

const PUBLIC_SETTINGS_CACHE_KEY = 'exam-public-settings-v1';

/**
 * 同步恢复上次成功加载的公开品牌，避免页面刷新后在接口返回前短暂展示兜底名称。
 * 仅缓存公开字段；缓存损坏或浏览器禁用存储时直接回退内置值。
 */
function readCachedPublicSettings(): PublicSettings {
  try {
    const raw = localStorage.getItem(PUBLIC_SETTINGS_CACHE_KEY);
    if (!raw) return { ...PUBLIC_SETTINGS_DEFAULTS };
    const cached = JSON.parse(raw) as Record<string, unknown>;
    // 升级旧版公开品牌缓存，避免首次刷新时闪现旧默认名称。
    if (cached.systemName === '卓达煤矿考试学习系统') cached.systemName = PUBLIC_SETTINGS_DEFAULTS.systemName;
    if (cached.systemShortName === '卓达煤矿考试学习系统') cached.systemShortName = PUBLIC_SETTINGS_DEFAULTS.systemShortName;
    if (cached.copyright === '© 2026 卓达煤矿考试学习系统') cached.copyright = PUBLIC_SETTINGS_DEFAULTS.copyright;
    return {
      systemName: typeof cached.systemName === 'string' && cached.systemName.trim()
        ? cached.systemName
        : PUBLIC_SETTINGS_DEFAULTS.systemName,
      systemShortName: typeof cached.systemShortName === 'string' && cached.systemShortName.trim()
        ? cached.systemShortName
        : PUBLIC_SETTINGS_DEFAULTS.systemShortName,
      loginSlogan: typeof cached.loginSlogan === 'string'
        ? cached.loginSlogan
        : PUBLIC_SETTINGS_DEFAULTS.loginSlogan,
      copyright: typeof cached.copyright === 'string'
        ? cached.copyright
        : PUBLIC_SETTINGS_DEFAULTS.copyright,
    };
  } catch {
    return { ...PUBLIC_SETTINGS_DEFAULTS };
  }
}

function cachePublicSettings(value: PublicSettings): void {
  try {
    localStorage.setItem(PUBLIC_SETTINGS_CACHE_KEY, JSON.stringify(value));
  } catch {
    /* 浏览器禁用存储时不影响设置加载 */
  }
}

export const useSettingsStore = defineStore('settings', () => {
  const settings = ref<SystemSettings>({ ...SETTINGS_DEFAULTS });
  const publicSettings = ref<PublicSettings>(readCachedPublicSettings());
  const ready = ref(false);
  const loading = ref(false);
  const lastLoadFailed = ref(false);
  let inflight: Promise<void> | null = null;
  let publicInflight: Promise<void> | null = null;
  let revision = 0;

  /** 合并后端返回值（缺字段回退默认值，兼容新增字段） */
  function apply(next: Partial<SystemSettings>): void {
    // 服务端暂时仍可能返回旧版 bankCategories；新前端不再把题库分类带回设置表单。
    const { bankCategories: _legacyBankCategories, ...supported } = next as Partial<SystemSettings> & { bankCategories?: unknown };
    settings.value = { ...SETTINGS_DEFAULTS, ...supported };
    publicSettings.value = pickPublicSettings(settings.value);
    cachePublicSettings(publicSettings.value);
  }

  /** 加载完整设置（需登录）；已加载过则直接返回，force 时强制刷新 */
  async function load(force = false): Promise<void> {
    if (inflight) return inflight;
    if (ready.value && !force) return;
    loading.value = true;
    lastLoadFailed.value = false;
    const currentRevision = revision;
    inflight = (async () => {
      try {
        const next = await getSettings();
        if (currentRevision === revision) {
          apply(next);
          ready.value = true;
        }
      } catch {
        lastLoadFailed.value = true;
        /* 静默：保留默认值，下次调用可重试 */
      } finally {
        loading.value = false;
        inflight = null;
      }
    })();
    return inflight;
  }

  /** 加载公开品牌设置（无需登录，登录页调用） */
  async function loadPublic(): Promise<void> {
    if (publicInflight) return publicInflight;
    const currentRevision = revision;
    publicInflight = (async () => {
      try {
        const data = await getPublicSettings();
        if (currentRevision === revision) {
          publicSettings.value = { ...PUBLIC_SETTINGS_DEFAULTS, ...data };
          cachePublicSettings(publicSettings.value);
        }
      } catch {
        /* 静默：保留默认值 */
      } finally {
        publicInflight = null;
      }
    })();
    return publicInflight;
  }

  /** 保存设置（仅 admin）；成功后同步本地 */
  async function save(payload: SystemSettings): Promise<void> {
    const next = await updateSettings(payload);
    revision += 1;
    apply(next);
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
    lastLoadFailed,
    load,
    loadPublic,
    save,
    resetToDefaults,
  };
});
