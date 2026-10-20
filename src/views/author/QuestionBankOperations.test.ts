import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DOMWrapper, flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { createPinia } from 'pinia';
import ElementPlus, { ElDialog, ElMessage, ElSelect, ElTable } from 'element-plus';
import Page from './QuestionBankDetailPage.vue';

const api = vi.hoisted(() => ({ detail: vi.fn(), stats: vi.fn(), questions: vi.fn(), list: vi.fn(), batch: vi.fn(), remove: vi.fn(), confirm: vi.fn() }));
vi.mock('@/api/banks', () => ({ detail: api.detail, questionStats: api.stats, questions: api.questions, list: api.list }));
vi.mock('@/api/questions', () => ({ remove: api.remove }));
vi.mock('@/api/coreFeatures', () => ({ qualityApi: { batch: api.batch } }));
vi.mock('@/composables/useConfirm', () => ({ useConfirm: () => ({ confirm: api.confirm }) }));
vi.mock('@/stores/settings', () => ({ useSettingsStore: () => ({ load: vi.fn(), settings: { defaultPageSize: 20, importMaxRows: 100, importMaxFileMb: 10 } }) }));
vi.mock('vue-router', () => ({ useRoute: () => ({ params: { bankId: 'b1' } }), useRouter: () => ({ push: vi.fn() }) }));
const stem = '完整原始题干ABCDEFGHIJKLMNOPQRSTUVWXYZ\n第二段保留';
const rows = ['q1', 'q2'].map(id => ({ id, bankId: 'b1', stem: id + stem, type: 'single', status: 'active', options: ['甲', '乙'], answer: [0], createdAt: '2026-10-20T00:00:00Z' }));
let wrapper: VueWrapper;
function render() { wrapper = mount(Page, { props: { selectedBankId: 'b1' }, attachTo: document.body, global: { plugins: [createPinia(), ElementPlus], stubs: { QuestionFormDialog: true, QuestionImportDialog: true, QuestionBatchEditDialog: true } } }); }
function button(text: string) { return new DOMWrapper([...document.querySelectorAll<HTMLButtonElement>('button')].find(b => b.textContent?.trim() === text)!); }
function body(title: string) { return new DOMWrapper([...document.querySelectorAll<HTMLElement>('[role=dialog]')].find(el => el.querySelector('.el-dialog__title')?.textContent === title)!); }
function dialog(title: string) { return wrapper.findAllComponents(ElDialog).find(d => d.props('title') === title)!; }
async function select() { wrapper.findComponent(ElTable).vm.$emit('selection-change', rows); await flushPromises(); }
async function chooseTarget() { dialog('迁移试题').findComponent(ElSelect).vm.$emit('update:modelValue', 'target'); await flushPromises(); }
beforeEach(() => {
  vi.resetAllMocks();
  api.detail.mockImplementation((id: string) => Promise.resolve({ id, name: '完整题库' + id, canEdit: true, effectiveStatus: 'active', authorNames: [], allowPractice: true }));
  api.stats.mockResolvedValue({ total: 21, byType: { single: 10, multiple: 4, judge: 3, fill: 2, short: 2 } });
  api.questions.mockImplementation((_: string, query: { page: number; pageSize: number }) => Promise.resolve({ list: rows, total: 21, page: query.page, pageSize: query.pageSize }));
  api.list.mockResolvedValue([{ id: 'b1', name: '源题库', canEdit: true }, { id: 'target', name: '完整目标ABCDEFGHIJKLMNOPQRSTUVWXYZ', canEdit: true }, { id: 'readonly', name: '只读目标', canEdit: false }]);
  api.batch.mockResolvedValue({ affected: 2, issues: [] }); api.confirm.mockResolvedValue(true);
});
afterEach(() => { wrapper?.unmount(); vi.restoreAllMocks(); ElMessage.closeAll(); document.body.innerHTML = ''; });

describe('题库批量操作与完整内容', () => {
  it('请求中锁定选择、筛选及分页，失败保留选择并可重试', async () => {
    let fail!: (e: Error) => void; api.batch.mockImplementationOnce(() => new Promise((_, reject) => { fail = reject; }));
    render(); await flushPromises(); await select(); await button('启用').trigger('click');
    expect(button('取消选择').attributes('disabled')).toBeDefined(); expect(wrapper.find('input[aria-label="按题干搜索"]').attributes('disabled')).toBeDefined();
    expect(wrapper.find('.data-table-pagination__mobile button:last-child').attributes('disabled')).toBeDefined();
    wrapper.findComponent(ElTable).vm.$emit('selection-change', []); await button('启用').trigger('click');
    expect(api.batch).toHaveBeenCalledTimes(1); fail(new Error('offline')); await flushPromises();
    expect(wrapper.text()).toContain('操作未完成'); expect(wrapper.find('.batch-bar__num').text()).toBe('2');
    await button('停用').trigger('click'); await flushPromises(); expect(api.batch).toHaveBeenLastCalledWith(['q1', 'q2'], 'disable');
  });

  it('批量删除确认防重入，取消不删除，保留原引用及历史限制说明', async () => {
    let finish!: (ok: boolean) => void; api.confirm.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    render(); await flushPromises(); await select();
    await wrapper.find('.batch-bar').findAll('button').find(b => b.text() === '删除')!.trigger('click');
    await wrapper.find('.batch-bar').findAll('button').find(b => b.text() === '删除')!.trigger('click');
    expect(api.confirm).toHaveBeenCalledTimes(1); expect(api.confirm.mock.calls[0]![0]).toContain('2道试题'); expect(api.confirm.mock.calls[0]![0]).toContain('练题历史');
    finish(false); await flushPromises(); expect(api.batch).not.toHaveBeenCalled(); expect(wrapper.find('.batch-bar__num').text()).toBe('2');
  });

  it('校验保留完整问题、题干和真实处理数量，可进入原题编辑', async () => {
    api.batch.mockResolvedValueOnce({ affected: 2, issues: [{ questionId: 'q1', issues: ['缺少解析', '缺少知识点'] }] });
    render(); await flushPromises(); await select(); await button('完整性校验').trigger('click'); await flushPromises();
    const result = dialog('完整性校验结果'); expect(result.props('modelValue')).toBe(true);
    expect(body('完整性校验结果').text()).toContain('本次已校验 2 道 · 1 道存在问题'); expect(body('完整性校验结果').text()).toContain(rows[0]!.stem); expect(body('完整性校验结果').text()).toContain('缺少知识点');
    expect(api.stats).toHaveBeenCalledTimes(2);
    await button('编辑这道题').trigger('click'); await flushPromises();
    expect(wrapper.findComponent({ name: 'QuestionFormDialog' }).props('question').id).toBe('q1');
    expect(result.props('modelValue')).toBe(false);
  });

  it('目标题库读取失败不冒充空，重试仅列出其他可编辑目标', async () => {
    api.list.mockRejectedValueOnce(new Error('offline'));
    render(); await flushPromises(); await select(); await button('迁移').trigger('click'); await flushPromises();
    expect(body('迁移试题').text()).toContain('目标题库加载失败'); expect(button('确认迁移').attributes('disabled')).toBeDefined();
    dialog('迁移试题').findComponent({ name: 'RequestError' }).vm.$emit('retry'); await flushPromises();
    const targetSelect = dialog('迁移试题').findComponent(ElSelect);
    expect(targetSelect.findAllComponents({ name: 'ElOption' }).map(o => o.props('value'))).toEqual(['target']);
    expect(body('迁移试题').text()).toContain(rows[0]!.stem);
  });

  it('未选择目标就地校验，迁移失败保留目标和冻结选择，重试成功才清空', async () => {
    let fail!: (e: Error) => void; api.batch.mockImplementationOnce(() => new Promise((_, reject) => { fail = reject; }));
    render(); await flushPromises(); await select(); await button('迁移').trigger('click'); await flushPromises();
    await button('确认迁移').trigger('click'); await flushPromises(); await vi.waitFor(() => expect(body('迁移试题').text()).toContain('请选择当前可编辑的目标题库'));  expect(api.batch).not.toHaveBeenCalled();
    await chooseTarget(); await button('确认迁移').trigger('click');
    expect(dialog('迁移试题').props('showClose')).toBe(false); expect(dialog('迁移试题').findComponent(ElSelect).find('input').attributes('disabled')).toBeDefined();
    wrapper.findComponent(ElTable).vm.$emit('selection-change', []); await button('确认迁移').trigger('click'); expect(api.batch).toHaveBeenCalledTimes(1);
    fail(new Error('offline')); await flushPromises(); expect(body('迁移试题').text()).toContain('迁移未完成'); expect(dialog('迁移试题').findComponent(ElSelect).props('modelValue')).toBe('target');
    await button('确认迁移').trigger('click'); await flushPromises();
    expect(api.batch).toHaveBeenLastCalledWith(['q1', 'q2'], 'migrate', 'target'); expect(dialog('迁移试题').props('modelValue')).toBe(false); expect(wrapper.find('.batch-bar').exists()).toBe(false);
  });

  it('切换题库后旧迁移响应不刷新或清空新题库', async () => {
    let finish!: (result: { affected: number }) => void; api.batch.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    render(); await flushPromises(); await select(); await button('迁移').trigger('click'); await flushPromises(); await chooseTarget(); await button('确认迁移').trigger('click');
    await wrapper.setProps({ selectedBankId: 'b2' }); await flushPromises();
    const count = api.detail.mock.calls.length; finish({ affected: 2 }); await flushPromises();
    expect(api.detail).toHaveBeenCalledTimes(count); expect(wrapper.find('.bank-overview').text()).toContain('完整题库b2'); expect(dialog('迁移试题').props('modelValue')).toBe(false);
  });

  it('超过服务端单批500道上限时不发送截断请求', async () => {
    render(); await flushPromises(); wrapper.findComponent(ElTable).vm.$emit('selection-change', Array.from({ length: 501 }, (_, i) => ({ ...rows[0], id: String(i) }))); await flushPromises();
    await button('完整性校验').trigger('click'); expect(wrapper.text()).toContain('单次最多处理500道'); expect(api.batch).not.toHaveBeenCalled();
  });

  it('单题删除确认和请求防重复，失败保留原题目', async () => {
    let fail!: (e: Error) => void; api.remove.mockImplementationOnce(() => new Promise((_, reject) => { fail = reject; }));
    render(); await flushPromises(); const remove = wrapper.findAll('button').find(b => b.text() === '删除')!;
    await remove.trigger('click'); await flushPromises(); await remove.trigger('click'); expect(api.remove).toHaveBeenCalledTimes(1);
    expect(api.confirm.mock.calls[0]![0]).toContain(rows[0]!.stem); fail(new Error('offline')); await flushPromises(); expect(wrapper.text()).toContain('删除未完成'); expect(wrapper.findAll('.cell-stem')).toHaveLength(2);
  });

  it('只读权限仍可完整阅读题干，不提供维护入口或额外答案', async () => {
    api.detail.mockResolvedValueOnce({ id: 'b1', name: '只读题库', canEdit: false, effectiveStatus: 'active' });
    render(); await flushPromises(); expect(wrapper.text()).not.toContain('手动新增');
    await wrapper.find('.cell-stem').trigger('click'); await flushPromises(); expect(body('完整题干').text()).toContain(rows[0]!.stem); expect(body('完整题干').text()).not.toContain('参考答案');
    expect(api.batch).not.toHaveBeenCalled(); expect(api.stats).toHaveBeenCalledTimes(1);
  });
});
