import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, shallowMount, type VueWrapper } from '@vue/test-utils';
import { createPinia } from 'pinia';
import ElementPlus from 'element-plus';
import SettingsPage from './SettingsPage.vue';
import { getSettings, updateSettings } from '@/api/settings';
import { SETTINGS_DEFAULTS } from '@/constants/settings';

vi.mock('@/api/settings', () => ({
  getSettings: vi.fn(),
  getPublicSettings: vi.fn(),
  updateSettings: vi.fn(),
}));

let wrapper: VueWrapper | undefined;
beforeEach(() => vi.clearAllMocks());
afterEach(() => wrapper?.unmount());

function mountPage() {
  wrapper = shallowMount(SettingsPage, {
    global: {
      plugins: [createPinia(), ElementPlus],
      stubs: {
        PageHeader: { template: '<header><slot name="actions" /></header>' },
        ElForm: { name: 'ElForm', props: ['disabled', 'model'], template: '<form :data-locked="disabled" />' },
        ElButton: { props: ['disabled'], template: '<button :disabled="disabled"><slot /></button>' },
        ElAlert: { template: '<div role="alert"><slot name="title" /><slot /></div>' },
      },
    },
  });
  return wrapper;
}

describe('设置页加载保护', () => {
  it('响应未返回时禁止编辑和保存，回填真实配置后才解锁', async () => {
    let resolve!: (value: Awaited<ReturnType<typeof getSettings>>) => void;
    vi.mocked(getSettings).mockReturnValue(new Promise((r) => { resolve = r; }));
    const page = mountPage();
    expect(page.get('form').attributes('data-locked')).toBe('true');
    expect(page.get('header button:last-child').attributes('disabled')).toBeDefined();
    await page.get('header button:last-child').trigger('click');
    expect(updateSettings).not.toHaveBeenCalled();
    resolve({ ...SETTINGS_DEFAULTS, systemName: '服务端配置' });
    await flushPromises();
    expect(page.get('form').attributes('data-locked')).toBe('false');
    expect(page.findComponent({ name: 'ElForm' }).props('model').systemName).toBe('服务端配置');
  });

  it('首次加载失败保留锁定，重试成功后恢复编辑', async () => {
    vi.mocked(getSettings).mockRejectedValueOnce(new Error('offline'));
    const page = mountPage();
    await flushPromises();
    expect(page.get('[role="alert"]').text()).toContain('设置加载失败');
    expect(page.get('form').attributes('data-locked')).toBe('true');
    vi.mocked(getSettings).mockResolvedValueOnce({ systemName: '重试成功' } as Awaited<ReturnType<typeof getSettings>>);
    await page.get('[role="alert"] button').trigger('click');
    await flushPromises();
    expect(page.find('[role="alert"]').exists()).toBe(false);
    expect(page.get('form').attributes('data-locked')).toBe('false');
  });
});
