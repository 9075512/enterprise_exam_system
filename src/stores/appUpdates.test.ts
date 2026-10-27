import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useAppUpdatesStore } from './appUpdates';
const api = vi.hoisted(() => ({ latest: vi.fn() }));
vi.mock('@/api/apps', () => ({ latestApp: api.latest }));
const release = { id: 'r', versionName: '1.0.7', versionCode: 10007, minAndroid: '8.0', status: 'published', downloadUrl: '/api/apps/releases/9432b2ba-14fe-40e6-aa62-2502614a4b38/download' };
beforeEach(() => {
  vi.resetAllMocks(); localStorage.clear(); setActivePinia(createPinia());
  vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue('Android 15 ZhuodaLearnerAndroid/1.0.6 ZhuodaLearnerBuild/10006');
  api.latest.mockResolvedValue(release);
});
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });
describe('App 更新检查', () => {
  it('仅新版弹出；相同和更低版本不提示', async () => {
    const store = useAppUpdatesStore(); expect(await store.check()).toBe('available'); expect(store.promptVisible).toBe(true);
    api.latest.mockResolvedValue({ ...release, versionCode: 10006 });
    expect(await store.check(true)).toBe('current'); expect(store.promptVisible).toBe(false);
    api.latest.mockResolvedValue({ ...release, versionCode: 10005 }); expect(await store.check(true)).toBe('current');
  });
  it('稍后更新24小时内不重复弹，手动检查和不同新版本可以再次提示', async () => {
    await useAppUpdatesStore().check(); useAppUpdatesStore().dismiss();
    setActivePinia(createPinia()); const next = useAppUpdatesStore(); await next.check(); expect(next.promptVisible).toBe(false);
    await next.check(true); expect(next.promptVisible).toBe(true); next.dismiss();
    api.latest.mockResolvedValue({ ...release, versionCode: 10008, versionName: '1.0.8' });
    setActivePinia(createPinia()); await useAppUpdatesStore().check(); expect(useAppUpdatesStore().promptVisible).toBe(true);
  });
  it('推迟期限结束后可再次提醒', async () => {
    vi.useFakeTimers(); await useAppUpdatesStore().check(); useAppUpdatesStore().dismiss();
    vi.advanceTimersByTime(24 * 3600000 + 1); setActivePinia(createPinia()); await useAppUpdatesStore().check();
    expect(useAppUpdatesStore().promptVisible).toBe(true);
  });
  it('并发合并且自动检查有节流；手动检查可覆盖推迟状态', async () => {
    let done!: (value: typeof release) => void; api.latest.mockReturnValueOnce(new Promise(resolve => { done = resolve; }));
    const store = useAppUpdatesStore(); const first = store.check(); const second = store.check(true);
    expect(api.latest).toHaveBeenCalledOnce(); done(release); await Promise.all([first, second]);
    expect(store.promptVisible).toBe(true); await store.check(); expect(api.latest).toHaveBeenCalledOnce();
  });
  it('失败、空版本、不兼容和不合法链接不弹出，允许手动重试', async () => {
    const store = useAppUpdatesStore(); api.latest.mockRejectedValueOnce(new Error('offline'));
    expect(await store.check()).toBe('failed'); expect(store.promptVisible).toBe(false);
    api.latest.mockResolvedValueOnce(null); expect(await store.check(true)).toBe('empty');
    api.latest.mockResolvedValueOnce({ ...release, minAndroid: '16.0' }); expect(await store.check(true)).toBe('unsupported');
    api.latest.mockResolvedValueOnce({ ...release, downloadUrl: 'https://evil.test/app.apk' }); expect(await store.check(true)).toBe('failed'); expect(store.promptVisible).toBe(false);
    expect(await store.check(true)).toBe('available');
  });
  it('普通网页不请求 App 版本接口', async () => {
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue('Chrome/130.0');
    expect(await useAppUpdatesStore().check()).toBe('not-app'); expect(api.latest).not.toHaveBeenCalled();
  });
});
