import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import ElementPlus, { ElDrawer, ElMessageBox } from 'element-plus';
import PositionManagePage from './PositionManagePage.vue';
const api = vi.hoisted(() => ({ list: vi.fn(), create: vi.fn(), update: vi.fn(), remove: vi.fn() }));
vi.mock('@/api/coreFeatures', () => ({ positionsApi: api }));
let wrapper: VueWrapper;
const item = { id: 'p', name: '原岗位', description: '原说明' };
function button(text: string, scope: ParentNode = document): HTMLButtonElement { return [...scope.querySelectorAll<HTMLButtonElement>('button')].find(b => b.textContent?.trim() === text)!; }
function setInput(value: string) { const el = document.querySelector<HTMLInputElement>('.el-drawer input')!; el.value = value; el.dispatchEvent(new Event('input', { bubbles: true })); }
async function render() { wrapper = mount(PositionManagePage, { attachTo: document.body, global: { plugins: [ElementPlus] } }); await flushPromises(); }
beforeEach(() => { vi.resetAllMocks(); api.list.mockResolvedValue([item]); });
afterEach(() => { wrapper?.unmount(); document.body.innerHTML = ''; vi.restoreAllMocks(); });
describe('岗位管理完整交互', () => {
  it('名称为空显示字段错误，保存失败保留原岗位和内容，处理中禁止重复提交与关闭', async () => {
    let fail!: (error: Error) => void;
    api.update.mockReturnValueOnce(new Promise((_, reject) => { fail = reject; })).mockResolvedValueOnce(item);
    await render(); button('编辑').click(); await flushPromises();
    setInput('  '); await flushPromises(); expect(wrapper.findComponent({ name: 'ElDrawer' }).findComponent({ name: 'ElInput' }).props('modelValue')).toBe('  '); button('保存').click(); await flushPromises();
    await vi.waitFor(() => expect(document.body.textContent).toContain('请输入岗位名称')); expect(api.update).not.toHaveBeenCalled();
    setInput('修改岗位'); await flushPromises(); button('保存').click(); button('保存').click(); await flushPromises();
    expect(api.update).toHaveBeenCalledTimes(1); expect(button('新增岗位').disabled).toBe(true);
    wrapper.findComponent(ElDrawer).vm.$emit('update:modelValue', false); await flushPromises(); expect(wrapper.findComponent(ElDrawer).props('modelValue')).toBe(true);
    fail(new Error('offline')); await flushPromises();
    expect(document.body.textContent).toContain('填写内容已保留'); expect(document.querySelector<HTMLInputElement>('.el-drawer input')?.value).toBe('修改岗位');
    button('保存').click(); await flushPromises(); expect(api.update).toHaveBeenLastCalledWith('p', { name: '修改岗位', description: '原说明' }); expect(wrapper.findComponent(ElDrawer).props('modelValue')).toBe(false);
  });
  it('删除确认只出现一次，失败保留列表并显示具体岗位错误', async () => {
    let confirm!: () => void;
    vi.spyOn(ElMessageBox, 'confirm').mockImplementation(() => new Promise(resolve => { confirm = () => resolve('confirm' as never); }));
    api.remove.mockRejectedValue(new Error('in-use'));
    await render(); button('删除').click(); button('删除').click(); await flushPromises();
    expect(ElMessageBox.confirm).toHaveBeenCalledTimes(1); expect(api.remove).not.toHaveBeenCalled();
    confirm(); await flushPromises(); expect(api.remove).toHaveBeenCalledWith('p');
    expect(wrapper.text()).toContain('原岗位'); expect(wrapper.text()).toContain('删除失败'); expect(button('新增岗位').disabled).toBe(false);
  });
  it('加载失败提供重试，筛选空态可清除且保留真实匹配范围', async () => {
    api.list.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce([item]);
    await render(); expect(wrapper.text()).toContain('数量未知'); button('重新加载').click(); await flushPromises();
    expect(wrapper.text()).toContain('1 条匹配');
    await wrapper.find('input[placeholder="搜索岗位名称、说明"]').setValue('找不到'); expect(wrapper.text()).toContain('0 条匹配');
    button('清空筛选').click(); await flushPromises(); expect(wrapper.text()).toContain('1 条匹配');
  });
});


describe('岗位列表旧响应隔离', () => {
  it('保存后刷新可替代仍在进行的首屏读取，较晚返回的旧列表不能覆盖新岗位', async () => {
    let original!: (value: typeof item[]) => void;
    const created = { id: 'new', name: '新岗位', description: '' };
    api.list.mockReturnValueOnce(new Promise(resolve => { original = resolve; })).mockResolvedValueOnce([created]);
    api.create.mockResolvedValue(created);
    await render(); button('新增岗位').click(); await flushPromises(); setInput('新岗位'); await flushPromises();
    button('保存').click(); await flushPromises(); expect(api.list).toHaveBeenCalledTimes(2); expect(wrapper.text()).toContain('新岗位');
    original([item]); await flushPromises(); expect(wrapper.text()).toContain('新岗位'); expect(wrapper.text()).not.toContain('原岗位');
  });
});
