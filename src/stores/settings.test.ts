import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { getPublicSettings, getSettings, updateSettings } from '@/api/settings';
import { PUBLIC_SETTINGS_DEFAULTS, SETTINGS_DEFAULTS } from '@/constants/settings';
import type { PublicSettings, SystemSettings } from '@/types';
import { useSettingsStore } from './settings';

vi.mock('@/api/settings', () => ({ getSettings: vi.fn(), getPublicSettings: vi.fn(), updateSettings: vi.fn() }));

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((yes) => { resolve = yes; });
  return { promise, resolve };
}

beforeEach(() => {
  vi.resetAllMocks();
  localStorage.clear();
  setActivePinia(createPinia());
});

describe('系统设置请求合并', () => {
  it('强制刷新失败保留缓存并明确记录失败，成功重试后清除', async () => {
    const store = useSettingsStore();
    vi.mocked(getSettings).mockResolvedValueOnce({ ...SETTINGS_DEFAULTS, systemName: '已有配置' }).mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({ ...SETTINGS_DEFAULTS, systemName: '最新配置' });
    await store.load(); await store.load(true);
    expect(store.ready).toBe(true); expect(store.settings.systemName).toBe('已有配置'); expect(store.lastLoadFailed).toBe(true);
    await store.load(true); expect(store.lastLoadFailed).toBe(false); expect(store.settings.systemName).toBe('最新配置');
  });
  it('公开配置返回前直接使用正式品牌，刷新时不闪现占位名称', () => {
    const store = useSettingsStore();
    expect(store.publicSettings.systemName).toBe('卓达煤矿考试学习系统');
    expect(store.publicSettings.systemShortName).toBe('卓达煤矿考试学习系统');
    expect(store.publicSettings.copyright).toBe('© 2026 卓达煤矿考试学习系统');
  });

  it('刷新时同步恢复上次加载的公开品牌', () => {
    localStorage.setItem('exam-public-settings-v1', JSON.stringify({
      ...PUBLIC_SETTINGS_DEFAULTS,
      systemName: '上次加载的品牌',
      systemShortName: '上次品牌',
    }));
    const store = useSettingsStore();
    expect(store.publicSettings.systemName).toBe('上次加载的品牌');
    expect(store.publicSettings.systemShortName).toBe('上次品牌');
  });

  it('并发调用只请求一次，所有调用者都等待真实设置就绪', async () => {
    const pending = deferred<SystemSettings>();
    vi.mocked(getSettings).mockReturnValue(pending.promise);
    const store = useSettingsStore();
    const first = store.load();
    let secondDone = false;
    const second = store.load().then(() => { secondDone = true; });
    await Promise.resolve();
    expect(secondDone).toBe(false);
    expect(getSettings).toHaveBeenCalledTimes(1);
    pending.resolve({ ...SETTINGS_DEFAULTS, cheatCountThreshold: 9 });
    await Promise.all([first, second]);
    expect(store.settings.cheatCountThreshold).toBe(9);
    expect(store.ready).toBe(true);
    expect(store.loading).toBe(false);
    await store.load();
    expect(getSettings).toHaveBeenCalledTimes(1);
  });

  it('加载失败后可重试，成功后可强制刷新', async () => {
    vi.mocked(getSettings).mockRejectedValueOnce(new Error('offline')).mockResolvedValue(SETTINGS_DEFAULTS);
    const store = useSettingsStore();
    await store.load();
    expect(store.ready).toBe(false);
    await store.load();
    await store.load(true);
    expect(store.ready).toBe(true);
    expect(getSettings).toHaveBeenCalledTimes(3);
  });

  it('品牌公开配置的并发加载也只请求一次', async () => {
    const pending = deferred<PublicSettings>();
    vi.mocked(getPublicSettings).mockReturnValue(pending.promise);
    const store = useSettingsStore();
    const requests = [store.loadPublic(), store.loadPublic()];
    expect(getPublicSettings).toHaveBeenCalledTimes(1);
    pending.resolve({ ...PUBLIC_SETTINGS_DEFAULTS, systemName: '最新品牌' });
    await Promise.all(requests);
    expect(store.publicSettings.systemName).toBe('最新品牌');
  });

  it('保存成功后，迟到的旧设置和旧品牌响应不能覆盖保存结果', async () => {
    const oldSettings = deferred<SystemSettings>();
    const oldPublic = deferred<PublicSettings>();
    vi.mocked(getSettings).mockReturnValue(oldSettings.promise);
    vi.mocked(getPublicSettings).mockReturnValue(oldPublic.promise);
    const store = useSettingsStore();
    const requests = [store.load(), store.loadPublic()];
    const saved = { ...SETTINGS_DEFAULTS, systemName: '已保存品牌' };
    vi.mocked(updateSettings).mockResolvedValue(saved);
    await store.save(saved);
    oldSettings.resolve(SETTINGS_DEFAULTS);
    oldPublic.resolve(PUBLIC_SETTINGS_DEFAULTS);
    await Promise.all(requests);
    expect(store.settings.systemName).toBe('已保存品牌');
    expect(store.publicSettings.systemName).toBe('已保存品牌');
  });
});
