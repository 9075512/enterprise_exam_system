import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import ExamCaptureDrawer from './ExamCaptureDrawer.vue';
const api = vi.hoisted(() => ({ list: vi.fn(), image: vi.fn(), remove: vi.fn(), removeBatch: vi.fn(), confirm: vi.fn(), success: vi.fn(), error: vi.fn() }));
vi.mock('@/api/captures', () => ({ list: api.list, image: api.image, remove: api.remove, removeBatch: api.removeBatch }));
vi.mock('element-plus', () => ({ ElMessageBox: { confirm: api.confirm }, ElMessage: { success: api.success, error: api.error } }));
let wrapper: ReturnType<typeof mount> | undefined;
const result = { config: { enabled: true, intervalMinutes: 5 }, total: 3, eventTotal: 0, events: [], items: [
  { id: 'available', kind: 'entry', receivedAt: '2026-10-27T00:00:00Z', expiresAt: '2026-11-26T00:00:00Z', expired: false, status: 'available' },
  { id: 'expired', kind: 'periodic', receivedAt: '2026-09-01T00:00:00Z', expiresAt: '2026-10-01T00:00:00Z', expired: true },
  { id: 'deleted', kind: 'periodic', receivedAt: '2026-10-27T00:00:00Z', expiresAt: '2026-11-26T00:00:00Z', expired: false, status: 'deleted', deletedAt: '2026-10-28T00:00:00Z', deletedBy: { id: 'admin', name: '管理员甲' } },
] };
beforeEach(() => { vi.resetAllMocks(); Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: vi.fn(() => 'blob:test-photo') }); Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() }); api.list.mockResolvedValue(result); api.image.mockResolvedValue(new Blob(['jpg'])); api.confirm.mockResolvedValue('confirm'); api.remove.mockResolvedValue({ deletedCount: 1 }); api.removeBatch.mockResolvedValue({ deletedCount: 2 }); });
afterEach(() => { wrapper?.unmount(); wrapper = undefined; });
const global = { stubs: { ElDrawer: { props: ['modelValue'], template: '<div v-if="modelValue"><slot /></div>' }, ElButton: { props: ['disabled', 'loading'], template: '<button :disabled="disabled || loading"><slot /></button>' }, ElCheckbox: { props: ['modelValue', 'disabled'], emits: ['update:modelValue'], template: '<label><input type="checkbox" :checked="modelValue" :disabled="disabled" @change="$emit(\'update:modelValue\', $event.target.checked)" /><slot /></label>' }, ElImage: { props: ['src'], template: '<img :src="src" />' }, ElPagination: { props: ['currentPage', 'disabled'], emits: ['update:currentPage'], template: '<button :disabled="disabled" @click="$emit(\'update:currentPage\', currentPage + 1)">下一页</button>' } } };
async function render() { wrapper = mount(ExamCaptureDrawer, { props: { modelValue: true, recordId: 'r1' }, global }); await flushPromises(); }
async function click(text: string) { await wrapper!.findAll('button').find(button => button.text().includes(text))!.trigger('click'); await flushPromises(); }
describe('抓拍照片查看', () => {
  it('关闭时不读取，打开后只加载有效照片，关闭时释放Blob', async () => {
    wrapper = mount(ExamCaptureDrawer, { props: { modelValue: false, recordId: 'r1' }, global }); await flushPromises(); expect(api.list).not.toHaveBeenCalled();
    await wrapper.setProps({ modelValue: true }); await flushPromises();
    expect(api.image).toHaveBeenCalledTimes(1); expect(api.image).toHaveBeenCalledWith('r1', 'available'); expect(wrapper.text()).toContain('照片已过期');
    await wrapper.setProps({ modelValue: false }); expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:test-photo');
  });
  it('照片读取失败有明确提示且可刷新', async () => {
    api.image.mockRejectedValue(new Error('expired'));
    wrapper = mount(ExamCaptureDrawer, { props: { modelValue: true, recordId: 'r1' }, global }); await flushPromises(); expect(wrapper.text()).toContain('照片读取失败');
    api.image.mockResolvedValue(new Blob(['ok'])); await wrapper.get('button').trigger('click'); await flushPromises(); expect(wrapper.get('img').attributes('src')).toBe('blob:test-photo');
  });
  it('只选择本页可用照片，已删除项展示操作者与时间', async () => {
    await render();
    expect(wrapper!.text()).toContain('管理员已删除'); expect(wrapper!.text()).toContain('管理员甲');
    const checks = wrapper!.findAll('input');
    expect(checks[2]!.attributes('disabled')).toBeDefined(); expect(checks[3]!.attributes('disabled')).toBeDefined();
    await checks[0]!.setValue(true); expect(wrapper!.text()).toContain('删除选中（1）');
    await wrapper!.setProps({ modelValue: false }); await wrapper!.setProps({ modelValue: true }); await flushPromises();
    expect(wrapper!.text()).toContain('删除选中（0）');
  });
  it('取消删除不调用接口，失败保留选择并可重试', async () => {
    await render(); await wrapper!.get('input').setValue(true);
    api.confirm.mockRejectedValueOnce('cancel'); await click('删除选中'); expect(api.remove).not.toHaveBeenCalled();
    api.remove.mockRejectedValueOnce(new Error('暂时无法删除')); await click('删除选中');
    expect(api.error).toHaveBeenCalledWith('暂时无法删除'); expect(wrapper!.text()).toContain('删除选中（1）');
    await click('删除选中'); expect(api.remove).toHaveBeenCalledWith('r1', 'available');
    expect(wrapper!.text()).toContain('删除选中（0）'); expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:test-photo');
  });
  it('单张删除确认数量，成功后移除图片及预览', async () => {
    await render();
    api.list.mockResolvedValue({ ...result, items: result.items.map(item => item.id === 'available' ? { ...item, status: 'deleted', deletedAt: '2026-10-28T01:00:00Z', deletedBy: { id: 'admin', name: '管理员甲' } } : item) });
    await click('删除照片');
    expect(api.confirm).toHaveBeenCalledWith(expect.stringContaining('1 张'), '删除考试抓拍', expect.anything());
    expect(api.remove).toHaveBeenCalledWith('r1', 'available'); expect(wrapper!.find('img').exists()).toBe(false);
    expect(wrapper!.text()).toContain('管理员已删除');
  });
  it('批量删除只提交选中照片，翻页清空选择', async () => {
    const many = { ...result, total: 14, items: [...result.items, { ...result.items[0], id: 'available-2' }] };
    api.list.mockResolvedValue(many); await render();
    await wrapper!.get('input').setValue(true); await click('删除选中');
    expect(api.removeBatch).toHaveBeenCalledWith('r1', ['available', 'available-2']);
    await wrapper!.get('input').setValue(true); await click('下一页');
    expect(wrapper!.text()).toContain('删除选中（0）');
  });
  it('确认期间禁止重复提交；切换答卷后不删除原选择', async () => {
    let confirm!: () => void; api.confirm.mockImplementationOnce(() => new Promise<void>(resolve => { confirm = resolve; }));
    await render(); await wrapper!.get('input').setValue(true); await click('删除选中');
    expect(api.confirm).toHaveBeenCalledTimes(1); await click('删除选中'); expect(api.confirm).toHaveBeenCalledTimes(1);
    await wrapper!.setProps({ recordId: 'r2' }); await flushPromises(); confirm(); await flushPromises();
    expect(api.remove).not.toHaveBeenCalled(); expect(wrapper!.text()).toContain('删除选中（0）');
  });
});
