import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { getConfig } from '@/api/practice';
import { PRACTICE_CONFIG_DEFAULTS } from '@/constants/practiceSettings';
import type { PracticeConfig } from '@/types';
import { usePracticeConfigStore } from './practiceConfig';

vi.mock('@/api/practice', () => ({ getConfig: vi.fn() }));

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((yes) => { resolve = yes; });
  return { promise, resolve };
}

beforeEach(() => {
  vi.resetAllMocks();
  setActivePinia(createPinia());
});

describe('练题配置缓存与恢复', () => {
  it('临时网络失败后保留默认值，后续访问可重试', async () => {
    vi.mocked(getConfig).mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({ ...PRACTICE_CONFIG_DEFAULTS, sessionMaxCount: 30 });
    const store = usePracticeConfigStore();
    await store.load();
    expect(store.loaded).toBe(false);
    expect(store.config).toEqual(PRACTICE_CONFIG_DEFAULTS);
    await store.load();
    expect(store.loaded).toBe(true);
    expect(store.config.sessionMaxCount).toBe(30);
  });

  it('并发调用合并请求，成功后复用缓存', async () => {
    const pending = deferred<PracticeConfig>();
    vi.mocked(getConfig).mockReturnValue(pending.promise);
    const store = usePracticeConfigStore();
    const requests = [store.load(), store.load()];
    expect(getConfig).toHaveBeenCalledTimes(1);
    pending.resolve(PRACTICE_CONFIG_DEFAULTS);
    await Promise.all(requests);
    await store.load();
    expect(getConfig).toHaveBeenCalledTimes(1);
  });

  it('重置后旧响应不能污染新配置，也不能结束新请求', async () => {
    const old = deferred<PracticeConfig>();
    const latest = deferred<PracticeConfig>();
    vi.mocked(getConfig).mockReturnValueOnce(old.promise).mockReturnValueOnce(latest.promise);
    const store = usePracticeConfigStore();
    const first = store.load();
    store.reset();
    const second = store.load();
    old.resolve({ ...PRACTICE_CONFIG_DEFAULTS, sessionMaxCount: 5 });
    await first;
    expect(store.loaded).toBe(false);
    expect(store.config).toEqual(PRACTICE_CONFIG_DEFAULTS);
    const third = store.load();
    expect(getConfig).toHaveBeenCalledTimes(2);
    latest.resolve({ ...PRACTICE_CONFIG_DEFAULTS, sessionMaxCount: 25 });
    await Promise.all([second, third]);
    expect(store.config.sessionMaxCount).toBe(25);
  });
});
