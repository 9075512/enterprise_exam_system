import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount, shallowMount, type VueWrapper } from '@vue/test-utils';
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
        ElForm: {
          name: 'ElForm', props: ['disabled', 'model'], template: '<form :data-locked="disabled" />',
          methods: { validate(callback: (valid: boolean) => void) { callback(true); } },
        },
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
    expect(page.get('footer button:last-child').attributes('disabled')).toBeDefined();
    await page.get('footer button:last-child').trigger('click');
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

  it('修改后提示未保存，保存成功后同步服务端结果并清除修改状态', async () => {
    vi.mocked(getSettings).mockResolvedValue({ ...SETTINGS_DEFAULTS });
    const page = mountPage();
    await flushPromises();
    const saveButton = page.get('footer button:last-child');
    const draft = page.findComponent({ name: 'ElForm' }).props('model');
    expect(saveButton.attributes('disabled')).toBeDefined();
    expect(page.get('[role="status"]').text()).toBe('设置已同步');

    draft.examDefaultDuration = 90;
    await flushPromises();
    expect(saveButton.attributes('disabled')).toBeUndefined();
    expect(page.get('[role="status"]').text()).toBe('有未保存的修改');

    vi.mocked(updateSettings).mockResolvedValue({ ...SETTINGS_DEFAULTS, examDefaultDuration: 90 });
    await saveButton.trigger('click');
    await flushPromises();
    expect(updateSettings).toHaveBeenCalledWith(expect.objectContaining({ examDefaultDuration: 90 }));
    expect(page.get('[role="status"]').text()).toBe('设置已同步');
    expect(saveButton.attributes('disabled')).toBeDefined();
  });

  it('保存失败保留草稿和未保存提示，允许再次保存', async () => {
    vi.mocked(getSettings).mockResolvedValue({ ...SETTINGS_DEFAULTS });
    vi.mocked(updateSettings).mockRejectedValue(new Error('offline'));
    const page = mountPage();
    await flushPromises();
    const draft = page.findComponent({ name: 'ElForm' }).props('model');
    draft.examDefaultMaxAttempts = 2;
    await flushPromises();
    await page.get('footer button:last-child').trigger('click');
    await flushPromises();
    expect(draft.examDefaultMaxAttempts).toBe(2);
    expect(page.get('[role="status"]').text()).toBe('有未保存的修改');
    expect(page.get('footer button:last-child').attributes('disabled')).toBeUndefined();
  });
});

describe('设置分类滚动', () => {
  it('切换分类重置右侧滚动位置，同时保留未保存的表单内容', async () => {
    vi.mocked(getSettings).mockResolvedValue({ ...SETTINGS_DEFAULTS });
    wrapper = mount(SettingsPage, {
      global: { plugins: [createPinia(), ElementPlus] },
    });
    await flushPromises();
    const content = wrapper.get('.el-tabs__content').element as HTMLElement;

    content.scrollTop = 420;
    await wrapper.get('#tab-brand').trigger('click');
    await flushPromises();
    expect(content.scrollTop).toBe(0);

    await wrapper.get('#pane-brand input').setValue('未保存的系统名称');
    content.scrollTop = 260;
    await wrapper.get('#tab-exam').trigger('click');
    await flushPromises();
    expect(content.scrollTop).toBe(0);

    content.scrollTop = 40;
    await wrapper.get('#tab-brand').trigger('click');
    await flushPromises();
    expect(content.scrollTop).toBe(0);
    expect((wrapper.get('#pane-brand input').element as HTMLInputElement).value).toBe('未保存的系统名称');
    expect(updateSettings).not.toHaveBeenCalled();
  });
});
