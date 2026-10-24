import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import ElementPlus from 'element-plus';
import AppManagePage from './AppManagePage.vue';
const api = vi.hoisted(() => ({ list: vi.fn(), create: vi.fn() }));
vi.mock('@/api/apps', async importOriginal => ({ ...await importOriginal<typeof import('@/api/apps')>(), listApps: api.list, createAppRelease: api.create }));
vi.mock('qrcode', () => ({ default: { toDataURL: vi.fn().mockResolvedValue('data:image/png;base64,test') } }));
let wrapper: ReturnType<typeof mount>;
beforeEach(() => { vi.clearAllMocks(); api.list.mockResolvedValue([]); });
afterEach(() => { wrapper?.unmount(); document.body.innerHTML = ''; });
function render() { wrapper = mount(AppManagePage, { attachTo: document.body, global: { plugins: [ElementPlus], stubs: { teleport: true, ElTable: true, ElTableColumn: true, ElSelect: true, ElOption: true } } }); }
function button(text: string) { return wrapper.findAll('button').find(item => item.text() === text)!; }
describe('App management upload', () => {
  it('requires an APK and valid release information before creating a draft', async () => {
    render(); await flushPromises(); await button('上传新版本').trigger('click'); await flushPromises();
    await button('保存为草稿').trigger('click'); await flushPromises();
    expect(api.create).not.toHaveBeenCalled();
  });
  it('sends one multipart draft with the selected APK and does not duplicate in-flight submissions', async () => {
    let complete!: (value: unknown) => void;
    api.create.mockReturnValue(new Promise(resolve => { complete = resolve; }));
    render(); await flushPromises(); await button('上传新版本').trigger('click'); await flushPromises();
    const input = wrapper.get('input[type="file"]');
    Object.defineProperty(input.element, 'files', { value: [new File(['apk'], 'zhuoda-learner-1.0.3-release.apk', { type: 'application/vnd.android.package-archive' })] });
    await input.trigger('change');
    const code = wrapper.get('input[role="spinbutton"]'); await code.setValue('10003'); await code.trigger('blur');
    await wrapper.get('textarea').setValue('优化学习体验');
    await button('保存为草稿').trigger('click'); await button('保存为草稿').trigger('click'); await flushPromises();
    expect(api.create).toHaveBeenCalledTimes(1);
    const form = api.create.mock.calls[0]![0] as FormData;
    expect(form.get('versionName')).toBe('1.0.3'); expect(form.get('versionCode')).toBe('10003');
    expect((form.get('file') as File).name).toContain('.apk');
    complete({}); await flushPromises();
    expect(api.list).toHaveBeenCalledTimes(2);
  });
});
