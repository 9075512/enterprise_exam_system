import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import ElementPlus from 'element-plus';
import LoginLogPage from './LoginLogPage.vue';
const api = vi.hoisted(() => ({ list: vi.fn() }));
vi.mock('@/api/loginLogs', () => ({ listLoginLogs: api.list }));
vi.mock('@/stores/settings', () => ({ useSettingsStore: () => ({ settings: { defaultPageSize: 20 }, load: vi.fn() }) }));
let wrapper: VueWrapper;
const result = { list: [{ id: 'one', username: 'sample', success: false, reason: 'locked', source: 'practice', createdAt: '2026-10-19T00:00:00Z' }], total: 42, page: 1, pageSize: 20 };
beforeEach(() => { vi.resetAllMocks(); api.list.mockResolvedValue(structuredClone(result)); });
afterEach(() => { wrapper?.unmount(); document.body.innerHTML = ''; });
async function render() { wrapper = mount(LoginLogPage, { attachTo: document.body, global: { plugins: [ElementPlus], stubs: { TableDensityToggle: true } } }); await flushPromises(); }
describe('登录日志的真实统计与时间筛选', () => {
  it('标明当前页范围；重新查询时隐藏旧分析，失败不显示零或旧数据', async () => {
    await render();
    expect(wrapper.find('.login-log__analysis-scope').text()).toContain('当前页');
    expect(wrapper.find('.login-log__anomaly').text()).toContain('100.0%');
    let reject!: (error: Error) => void;
    api.list.mockReturnValueOnce(new Promise((_resolve, fail) => { reject = fail; }));
    await wrapper.findAll('button').find(b => b.text() === '查询')!.trigger('click'); await flushPromises();
    expect(wrapper.find('.admin-scope').text()).toContain('正在加载');
    expect(wrapper.find('.login-log__anomaly').text()).not.toContain('100.0%');
    expect(wrapper.find('.login-log__anomaly').text()).not.toContain('暂无登录记录');
    reject(new Error('offline')); await flushPromises();
    expect(wrapper.find('.login-log__anomaly').text()).toContain('暂无法分析异常');
    expect(wrapper.find('.admin-scope').text()).toContain('数量未知');
  });
  it('成功页不标记需关注，手机双日历仍保留精确到秒的时间查询参数', async () => {
    api.list.mockResolvedValue({ ...result, list: [{ ...result.list[0], success: true, reason: '' }] });
    await render();
    expect(wrapper.find('.login-log__anomaly').text()).not.toContain('需关注');
    const picker = wrapper.findComponent({ name: 'ElDatePicker' });
    expect(picker.props('popperClass')).toBe('log-date-range-picker');
    const range = [new Date('2026-10-01T01:02:03Z'), new Date('2026-10-19T04:05:06Z')];
    picker.vm.$emit('update:modelValue', range); await flushPromises();
    await wrapper.findAll('button').find(b => b.text() === '查询')!.trigger('click'); await flushPromises();
    expect(api.list).toHaveBeenLastCalledWith(expect.objectContaining({ from: range[0]!.toISOString(), to: range[1]!.toISOString(), page: 1 }));
  });
});
