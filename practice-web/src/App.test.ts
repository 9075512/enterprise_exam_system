import { afterEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, shallowMount, type VueWrapper } from '@vue/test-utils';
import { nextTick } from 'vue';
import App from './App.vue';
import BootSplash from '@/components/common/BootSplash.vue';

const isReady = vi.hoisted(() => vi.fn());
vi.mock('vue-router', () => ({ useRouter: () => ({ isReady }) }));

let wrapper: VueWrapper | undefined;
afterEach(() => { wrapper?.unmount(); vi.useRealTimers(); });

function mountApp() {
  wrapper = shallowMount(App, {
    global: {
      stubs: {
        ElConfigProvider: { template: '<div><slot /></div>' },
        ElButton: { template: '<button><slot /></button>' },
        RouterView: true,
      },
    },
  });
  return wrapper;
}

describe('应用启动反馈', () => {
  it('路由立即就绪时不显示全屏等待，也不增加固定延时', async () => {
    vi.useFakeTimers();
    isReady.mockResolvedValue(undefined);
    const app = mountApp();
    await flushPromises();
    vi.advanceTimersByTime(1000);
    await nextTick();
    expect(app.findComponent(BootSplash).props('show')).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('慢启动失败后退出 loading，并提供重新加载入口', async () => {
    vi.useFakeTimers();
    let reject!: (error: Error) => void;
    isReady.mockReturnValue(new Promise((_resolve, fail) => { reject = fail; }));
    const app = mountApp();
    vi.advanceTimersByTime(800);
    await nextTick();
    expect(app.findComponent(BootSplash).props('show')).toBe(true);
    reject(new Error('chunk unavailable'));
    await flushPromises();
    expect(app.findComponent(BootSplash).props('show')).toBe(false);
    expect(app.get('[role="alert"]').text()).toContain('重新加载');
  });
});
