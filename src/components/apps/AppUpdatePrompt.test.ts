import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { reactive } from 'vue';
import AppUpdatePrompt from './AppUpdatePrompt.vue';
import { useAppUpdatesStore } from '@/stores/appUpdates';
const api = vi.hoisted(() => ({ latest: vi.fn(), copy: vi.fn() }));
const route = reactive({ path: '/exam/home' });
vi.mock('vue-router', () => ({ useRoute: () => route }));
vi.mock('@/api/apps', async original => ({ ...await original<typeof import('@/api/apps')>(), latestApp: api.latest }));
let wrapper: ReturnType<typeof mount> | undefined;
const release = { appName: '卓达智学', versionName: '1.0.7', versionCode: 10007, fileSize: 56000, minAndroid: '8.0', status: 'published', releaseNotes: '修复已知问题\n增加新功能', downloadUrl: '/api/apps/releases/9432b2ba-14fe-40e6-aa62-2502614a4b38/download' };
beforeEach(() => {
  vi.resetAllMocks(); localStorage.clear(); route.path = '/exam/home';
  vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue('Android 15 ZhuodaLearnerAndroid/1.0.6 ZhuodaLearnerBuild/10006');
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: api.copy } });
  api.latest.mockResolvedValue(release); api.copy.mockResolvedValue(undefined);
});
afterEach(() => { wrapper?.unmount(); wrapper = undefined; vi.restoreAllMocks(); });
async function render() {
  const pinia = createPinia(); setActivePinia(pinia);
  wrapper = mount(AppUpdatePrompt, { global: { plugins: [pinia], stubs: { ElDialog: { props: ['modelValue'], template: '<section v-if="modelValue"><slot /><slot name="footer" /></section>' }, ElButton: { template: '<button><slot /></button>' } } } });
  await flushPromises();
}
describe('App 更新提示展示', () => {
  it('首页展示当前、新版本、说明与真实下载地址，稍后可关闭', async () => {
    await render(); expect(wrapper!.text()).toContain('当前 1.0.6'); expect(wrapper!.text()).toContain('1.0.7'); expect(wrapper!.text()).toContain('增加新功能');
    expect(wrapper!.get('a').attributes('href')).toBe(release.downloadUrl);
    await wrapper!.findAll('button').find(button => button.text() === '稍后再说')!.trigger('click'); expect(wrapper!.find('section').exists()).toBe(false);
  });
  it('考试和开考准备页不检查、不弹窗；请求中进入考试也不弹窗', async () => {
    route.path = '/exam/taking/r1'; await render(); expect(api.latest).not.toHaveBeenCalled();
    route.path = '/exam/my'; await flushPromises(); expect(api.latest).not.toHaveBeenCalled();
    let done!: (value: typeof release) => void; api.latest.mockReturnValueOnce(new Promise(resolve => { done = resolve; }));
    route.path = '/exam/home'; await flushPromises(); route.path = '/exam/taking/r1'; done(release); await flushPromises();
    expect(useAppUpdatesStore().promptVisible).toBe(true); expect(wrapper!.find('section').exists()).toBe(false);
    route.path = '/profile'; await flushPromises(); expect(wrapper!.find('section').exists()).toBe(true);
  });
  it('旧版 App 提供可执行的复制链接更新方式', async () => {
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue('Android 15 ZhuodaLearnerAndroid/1.0.5'); await render();
    expect(wrapper!.find('a').exists()).toBe(false);
    await wrapper!.findAll('button').find(button => button.text() === '复制链接更新')!.trigger('click'); await flushPromises();
    expect(api.copy).toHaveBeenCalledWith(`${location.origin}/download`); expect(wrapper!.find('section').exists()).toBe(false);
  });
  it('网络失败自动检查保持安静；反复前台通知不重复请求', async () => {
    api.latest.mockRejectedValueOnce(new Error('offline')); await render();
    expect(wrapper!.find('section').exists()).toBe(false);
    window.dispatchEvent(new Event('zhuoda:app-foreground')); document.dispatchEvent(new Event('visibilitychange')); await flushPromises();
    expect(api.latest).toHaveBeenCalledOnce();
  });
});
