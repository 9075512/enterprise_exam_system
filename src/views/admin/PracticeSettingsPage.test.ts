import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import ElementPlus, { ElMessageBox } from 'element-plus';
import PracticeSettingsPage from './PracticeSettingsPage.vue';
import { PRACTICE_SETTINGS_DEFAULTS } from '@/constants/practiceSettings';
const api = vi.hoisted(() => ({ get: vi.fn(), save: vi.fn(), banks: vi.fn(), flags: vi.fn() }));
vi.mock('@/api/settings', () => ({ getPracticeSettings: api.get, updatePracticeSettings: api.save }));
vi.mock('@/api/banks', () => ({ list: api.banks, setPracticeFlag: api.flags }));
let wrapper: VueWrapper;
const bank = (id: string, count: number, open = false) => ({ id, name: id + '完整题库名称', isLeaf: true, questionCount: count, allowPractice: open });
const render = async () => { wrapper = mount(PracticeSettingsPage, { attachTo: document.body, global: { plugins: [ElementPlus] } }); await flushPromises(); };
const button = (text: string) => wrapper.findAll('button').find(b => b.text() === text)!;
const field = (label: string) => wrapper.findAllComponents({ name: 'ElInputNumber' }).find(c => c.props('ariaLabel') === label)!;
const tab = async (name: string) => { await wrapper.get('#tab-' + name).trigger('click'); await flushPromises(); };
beforeEach(() => { vi.resetAllMocks(); api.get.mockResolvedValue(structuredClone(PRACTICE_SETTINGS_DEFAULTS)); api.banks.mockResolvedValue([bank('one',10),bank('empty',0),bank('open',5,true)]); api.flags.mockResolvedValue([]); });
afterEach(() => { wrapper?.unmount(); document.body.innerHTML = ''; vi.restoreAllMocks(); });
describe('练题端设置保护与恢复', () => {
  it('加载中不展示0条，失败提供重试且配置控件保持禁用', async () => {
    let resolve!: (v: unknown[]) => void; api.banks.mockReturnValueOnce(new Promise(r => { resolve = r; })); api.get.mockRejectedValue(new Error('offline'));
    await render(); expect(wrapper.text()).toContain('题库加载中，数量暂未知'); expect(wrapper.text()).toContain('配置加载失败');
    await tab('daily'); expect(field('每日题量').props('disabled')).toBe(true); expect(button('保存配置').attributes()).toHaveProperty('disabled');
    resolve([]); await flushPromises(); expect(wrapper.text()).not.toContain('题库加载中，数量暂未知');
  });
  it('批量确认期间锁定筛选、页签与重复确认，取消后不写入', async () => {
    let cancel!: (reason: string) => void; const confirm = vi.spyOn(ElMessageBox, 'confirm').mockImplementation(() => new Promise((_, r) => { cancel = r; }));
    await render(); await button('全部开放').trigger('click'); await button('全部开放').trigger('click');
    expect(confirm).toHaveBeenCalledTimes(1); expect(wrapper.find('input[aria-label="搜索题库名称"]').attributes()).toHaveProperty('disabled');
    await tab('daily'); expect(wrapper.findComponent({ name: 'ElTabs' }).props('modelValue')).toBe('banks');
    cancel('cancel'); await flushPromises(); expect(api.flags).not.toHaveBeenCalled(); expect(button('全部开放').attributes('disabled')).toBeUndefined();
  });
  it('批量开放只包含有题目且未开放的题库，失败保留筛选与状态', async () => {
    vi.spyOn(ElMessageBox, 'confirm').mockResolvedValue('confirm' as Awaited<ReturnType<typeof ElMessageBox.confirm>>); api.flags.mockRejectedValueOnce(new Error('offline'));
    await render(); await wrapper.find('input[aria-label="搜索题库名称"]').setValue('one'); await button('全部开放').trigger('click'); await flushPromises();
    expect(api.flags).toHaveBeenCalledWith(['one'], true); expect(wrapper.text()).toContain('原题库状态与筛选已保留'); expect((wrapper.find('input[aria-label="搜索题库名称"]').element as HTMLInputElement).value).toBe('one');
    expect(wrapper.findAllComponents({ name: 'ElSwitch' }).filter(s => s.props('ariaLabel') === 'one完整题库名称开放练题').every(s => s.props('modelValue') === false)).toBe(true);
  });
  it('单题库失败保留原值，空题库不能开放', async () => {
    api.flags.mockRejectedValue(new Error('offline')); await render();
    const switches = wrapper.findAllComponents({ name: 'ElSwitch' }); const empty = switches.find(s => s.props('ariaLabel') === 'empty完整题库名称开放练题')!; expect(empty.props('disabled')).toBe(true);
    const one = switches.find(s => s.props('ariaLabel') === 'one完整题库名称开放练题')!; one.vm.$emit('update:modelValue', true); await flushPromises();
    expect(api.flags).toHaveBeenCalledWith(['one'], true); expect(one.props('modelValue')).toBe(false); expect(wrapper.text()).toContain('原状态已保留');
  });
  it('保存期间锁定关联控件和重复提交，失败保留各类草稿', async () => {
    let reject!: (e: Error) => void; api.save.mockReturnValueOnce(new Promise((_, r) => { reject = r; })); await render(); await tab('daily');
    field('每日题量').vm.$emit('update:modelValue', 20); await flushPromises(); await button('保存配置').trigger('click'); await button('保存配置').trigger('click');
    expect(api.save).toHaveBeenCalledTimes(1); expect(field('每日题量').props('disabled')).toBe(true); expect(wrapper.findAllComponents({ name: 'ElSelect' }).find(c => c.props('ariaLabel') === '题型范围')!.props('disabled')).toBe(true);
    reject(new Error('offline')); await flushPromises(); expect(field('每日题量').props('modelValue')).toBe(20); expect(wrapper.text()).toContain('全部配置修改已保留');
    api.save.mockImplementation(async v => v); await button('保存配置').trigger('click'); await flushPromises(); expect(button('保存配置').attributes()).toHaveProperty('disabled');
  });
  it('空数字与反向题量范围定位对应分类，不发送非法配置', async () => {
    await render(); field('每日题量').vm.$emit('update:modelValue', undefined); await flushPromises(); await button('保存配置').trigger('click'); await flushPromises();
    expect(wrapper.text()).toContain('每日题量需填写 1–50'); expect(api.save).not.toHaveBeenCalled(); expect(wrapper.findComponent({ name: 'ElTabs' }).props('modelValue')).toBe('daily');
    field('每日题量').vm.$emit('update:modelValue', 10); field('单次练习题量下限').vm.$emit('update:modelValue', 60); await flushPromises(); await button('保存配置').trigger('click'); await flushPromises();
    expect(wrapper.text()).toContain('单次题量上限不能小于下限'); expect(wrapper.findComponent({ name: 'ElTabs' }).props('modelValue')).toBe('rules'); expect(api.save).not.toHaveBeenCalled();
  });
});
