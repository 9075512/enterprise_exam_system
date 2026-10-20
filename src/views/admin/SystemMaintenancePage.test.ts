import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import ElementPlus, { ElMessage, ElMessageBox } from 'element-plus';
import SystemMaintenancePage from './SystemMaintenancePage.vue';
import type { MaintenanceStats } from '@/types';

const api = vi.hoisted(() => ({ stats: vi.fn(), archive: vi.fn(), autoRun: vi.fn(), load: vi.fn(), save: vi.fn(), ready: true, settings: { archiveRetentionDays: 90, retainedSetting: 'keep-existing-value' } }));
vi.mock('@/api/maintenance', () => ({ stats: api.stats, archive: api.archive, autoRun: api.autoRun }));
vi.mock('@/stores/settings', () => ({ useSettingsStore: () => ({ settings: api.settings, get ready() { return api.ready; }, load: api.load, save: api.save }) }));
const snapshot = (): MaintenanceStats => ({ tables: [{ name: 'exam_records', label: '考试记录', rows: 12 }], archiveTotal: 3, retentionDays: 90, autoEnabled: false, autoHour: 3, lastAutoArchive: null, generatedAt: '2026-10-19T00:00:00Z' });
let wrapper: VueWrapper;
const button = (label: string) => wrapper.findAll('button').find(b => b.text() === label)!;
async function render() { wrapper = mount(SystemMaintenancePage, { attachTo: document.body, global: { plugins: [ElementPlus] } }); await flushPromises(); }
beforeEach(() => { vi.resetAllMocks(); api.ready = true; api.settings.archiveRetentionDays = 90; api.stats.mockResolvedValue(snapshot()); api.load.mockResolvedValue(undefined); });
afterEach(() => { wrapper?.unmount(); ElMessage.closeAll(); document.body.innerHTML = ''; vi.restoreAllMocks(); });

describe('维护统计与归档任务状态', () => {
  it('首次加载只显示骨架，缺少统计对象显示未知，参数按服务端保留天数初始化', async () => {
    let finish!: (value: MaintenanceStats) => void;
    api.stats.mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
    await render();
    expect(wrapper.find('.loading-skeleton').exists()).toBe(true);
    expect(wrapper.find('.maintenance__cards').exists()).toBe(false);
    finish({ ...snapshot(), tables: [] }); await flushPromises();
    expect(wrapper.find('.maintenance__card-value').text()).toBe('—');
    expect(wrapper.findAllComponents({ name: 'ElInputNumber' })[0]!.props('modelValue')).toBe(90);
  });

  it('生效策略不显示草稿，刷新保留自动与手动输入，可恢复已保存设置', async () => {
    await render();
    const days = wrapper.findAllComponents({ name: 'ElInputNumber' })[0]!;
    days.vm.$emit('update:modelValue', 30);
    wrapper.findComponent({ name: 'ElSwitch' }).vm.$emit('update:modelValue', true);
    const hour = wrapper.findComponent({ name: 'ElSelect' }); hour.vm.$emit('update:modelValue', 7); await flushPromises();
    expect(wrapper.find('.maintenance__policy').text()).toContain('90 天');
    expect(wrapper.find('.maintenance__policy').text()).toContain('03:00');
    expect(wrapper.find('.maintenance__draft-note').exists()).toBe(true);
    api.stats.mockResolvedValueOnce({ ...snapshot(), retentionDays: 180, autoHour: 5, autoEnabled: true });
    await button('刷新统计').trigger('click'); await flushPromises();
    expect(days.props('modelValue')).toBe(30); expect(hour.props('modelValue')).toBe(7);
    expect(wrapper.find('.maintenance__policy').text()).toContain('180 天');
    await button('恢复已保存设置').trigger('click'); await flushPromises();
    expect(hour.props('modelValue')).toBe(5); expect(wrapper.find('.maintenance__draft-note').exists()).toBe(false);
    expect(days.props('modelValue')).toBe(30);
  });

  it('设置未就绪阻止覆盖，重试成功后保存保留其他配置，失败保留草稿', async () => {
    api.ready = false; await render();
    expect(button('保存设置').attributes()).toHaveProperty('disabled');
    expect(wrapper.text()).toContain('归档设置加载失败');
    api.ready = true; await button('重新加载').trigger('click'); await flushPromises();
    wrapper.findComponent({ name: 'ElSelect' }).vm.$emit('update:modelValue', 8); await flushPromises();
    api.save.mockRejectedValueOnce(new Error('offline'));
    await button('保存设置').trigger('click'); await flushPromises();
    expect(api.save).toHaveBeenCalledWith(expect.objectContaining({ archiveAutoHour: 8, archiveAutoEnabled: false, archiveRetentionDays: 90, retainedSetting: 'keep-existing-value' }));
    expect(wrapper.text()).toContain('保存失败，已保留本次修改');
    expect(wrapper.findComponent({ name: 'ElSelect' }).props('modelValue')).toBe(8);
    expect(api.archive).not.toHaveBeenCalled(); expect(api.autoRun).not.toHaveBeenCalled();
  });

  it('归档确认和请求期间只提交一次，其他任务锁定，失败保留参数和上次快照', async () => {
    await render();
    let confirm!: (value: Awaited<ReturnType<typeof ElMessageBox.confirm>>) => void;
    const prompt = vi.spyOn(ElMessageBox, 'confirm').mockReturnValueOnce(new Promise(resolve => { confirm = resolve; }));
    let reject!: (error: Error) => void;
    api.archive.mockReturnValueOnce(new Promise((_resolve, fail) => { reject = fail; }));
    const archive = button('执行归档'); await archive.trigger('click'); await archive.trigger('click'); await flushPromises();
    expect(prompt).toHaveBeenCalledTimes(1); expect(api.archive).not.toHaveBeenCalled();
    expect(button('立即执行一次').attributes()).toHaveProperty('disabled');
    expect(button('保存设置').attributes()).toHaveProperty('disabled');
    confirm('confirm' as Awaited<ReturnType<typeof ElMessageBox.confirm>>); await flushPromises();
    expect(api.archive).toHaveBeenCalledOnce(); expect(api.archive).toHaveBeenCalledWith({ days: 90, limit: 2000 });
    reject(new Error('offline')); await flushPromises();
    expect(wrapper.text()).toContain('本次归档失败');
    expect(wrapper.findAllComponents({ name: 'ElInputNumber' })[0]!.props('modelValue')).toBe(90);
    api.stats.mockRejectedValueOnce(new Error('offline')); await button('刷新统计').trigger('click'); await flushPromises();
    expect(wrapper.text()).toContain('当前展示上次成功快照');
    expect(wrapper.find('.maintenance__cards').text()).toContain('12');
    expect(wrapper.findAllComponents({ name: 'ElInputNumber' })[0]!.props('modelValue')).toBe(90);
    expect(button('执行归档').attributes()).toHaveProperty('disabled');
  });

  it('策略执行的真实结果立即展示，后续快照刷新失败仍保留执行结果', async () => {
    await render();
    api.autoRun.mockResolvedValue({ at: '2026-10-19T01:00:00Z', triggered: true, reason: 'manual', days: 90, archived: 7, skipped: 2, archiveTotal: 10, ok: true });
    api.stats.mockRejectedValueOnce(new Error('offline'));
    await button('立即执行一次').trigger('click'); await flushPromises();
    expect(api.autoRun).toHaveBeenCalledOnce();
    expect(wrapper.find('.maintenance__timeline').text()).toContain('手动触发 · 归档 7 条');
    expect(wrapper.text()).toContain('统计刷新失败');
  });
});
