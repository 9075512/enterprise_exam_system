import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import ElementPlus, { ElMessage } from 'element-plus';
import AuditLogPage from './AuditLogPage.vue';
import { AUDIT_EXPORT_COLUMNS } from '@/constants';
const api = vi.hoisted(() => ({ list: vi.fn(), retention: vi.fn(), cleanup: vi.fn(), export: vi.fn(), confirm: vi.fn() }));
vi.mock('@/api/audit', () => ({ listAuditLogs: api.list, getRetention: api.retention, cleanupAuditLogs: api.cleanup, exportAuditLogs: api.export }));
vi.mock('@/stores/settings', () => ({ useSettingsStore: () => ({ settings: { defaultPageSize: 20 }, load: vi.fn() }) }));
vi.mock('@/composables/useConfirm', () => ({ useConfirm: () => ({ confirm: api.confirm }) }));
let wrapper: VueWrapper;
const button = (label: string) => [...document.querySelectorAll<HTMLButtonElement>('button')].find(b => b.textContent?.trim() === label)!;
beforeEach(() => {
  vi.resetAllMocks();
  api.list.mockResolvedValue({ list: [], total: 0, page: 1, pageSize: 20 });
  api.retention.mockResolvedValue({ retentionDays: 30 });
});
afterEach(() => { wrapper?.unmount(); ElMessage.closeAll(); document.body.innerHTML = ''; });
async function render() { wrapper = mount(AuditLogPage, { attachTo: document.body, global: { plugins: [ElementPlus], stubs: { TableDensityToggle: true } } }); await flushPromises(); }
describe('审计查询与导出操作', () => {
  it('策略读取失败保持未知并禁用清理，重试成功才展示实际策略', async () => {
    api.retention.mockRejectedValueOnce(new Error('offline'));
    await render();
    expect(button('清理过期日志').disabled).toBe(true);
    expect(wrapper.text()).not.toContain('永久保留');
    button('重新加载保留策略').click(); await flushPromises();
    expect(wrapper.text()).toContain('保留 30 天');
    expect(button('清理过期日志').disabled).toBe(false);
    expect(api.cleanup).not.toHaveBeenCalled();
  });
  it('确认与清理期间只发起一次操作，取消后恢复操作', async () => {
    await render();
    let finish!: (value: boolean) => void;
    api.confirm.mockReturnValue(new Promise(resolve => { finish = resolve; }));
    const clear = button('清理过期日志'); clear.click(); clear.click(); await flushPromises();
    expect(api.confirm).toHaveBeenCalledTimes(1); expect(api.cleanup).not.toHaveBeenCalled();
    finish(false); await flushPromises();
    expect(clear.classList.contains('is-loading')).toBe(false);
    expect(api.cleanup).not.toHaveBeenCalled();
  });
  it('字段全选和部分选中正确回显，不能确认空字段集且可恢复默认', async () => {
    await render(); button('导出字段').click(); await flushPromises();
    const all = wrapper.findAllComponents({ name: 'ElCheckbox' }).find(c => c.text() === '全选字段')!;
    all.vm.$emit('change', true); await flushPromises();
    expect(document.querySelector('.audit-page__columns-head')?.textContent).toContain(`已选 ${AUDIT_EXPORT_COLUMNS.length}`);
    const group = wrapper.findComponent({ name: 'ElCheckboxGroup' });
    group.vm.$emit('update:modelValue', [AUDIT_EXPORT_COLUMNS[0]!.key]); await flushPromises();
    expect(all.props('indeterminate')).toBe(true);
    all.vm.$emit('change', false); await flushPromises(); expect(button('确定').disabled).toBe(true);
    button('恢复默认').click(); await flushPromises(); expect(button('确定').disabled).toBe(false);
    expect(wrapper.findComponent({ name: 'ElDatePicker' }).props('popperClass')).toBe('log-date-range-picker');
  });
});
