import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { createMemoryHistory, createRouter, RouterLink } from 'vue-router';
import ElementPlus from 'element-plus';
import DuplicateQuestionsPage from './DuplicateQuestionsPage.vue';
const api = vi.hoisted(() => ({ duplicates: vi.fn() }));
vi.mock('@/api/coreFeatures', () => ({ qualityApi: api }));
const group = { fingerprint: 'fingerprint-ABCDEFGHIJKLMNOPQRSTUVWXYZ', count: 2, questions: [
  { id: 'q1', bankId: 'bank-1', bankName: '题库A,"完整名称', type: 'single', stem: '第一行完整题干\n第二行含"引号"', subject: '专业科目', status: 'active', createdAt: '2026-10-19T00:00:00Z' },
  { id: 'q2', bankId: 'bank-2', bankName: '题库B完整名称', type: 'single', stem: '第一行完整题干\n第二行含"引号"', subject: '专业科目', status: 'disabled', createdAt: '2026-10-19T00:00:00Z' },
] };
let wrapper: VueWrapper;
beforeEach(() => { vi.resetAllMocks(); api.duplicates.mockResolvedValue([group]); });
afterEach(() => { wrapper?.unmount(); document.body.innerHTML = ''; vi.restoreAllMocks(); vi.unstubAllGlobals(); });
async function render() { const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/', component: { template: '<div />' } }, { path: '/author/banks', component: { template: '<div />' } }] }); await router.push('/'); wrapper = mount(DuplicateQuestionsPage, { attachTo: document.body, global: { plugins: [ElementPlus, router], stubs: { TableDensityToggle: true } } }); await flushPromises(); }
describe('重复题对照与导出', () => {
  it('展开完整题干和元数据，题库定位保留原目标，并可收起', async () => {
    await render();
    await wrapper.findAll('button').find(b => b.text() === '展开对照')!.trigger('click'); await flushPromises();
    expect(wrapper.findAll('.duplicate-question')).toHaveLength(2);
    expect(wrapper.find('.duplicate-question__stem').element.textContent).toBe(group.questions[0]!.stem);
    expect(wrapper.find('.duplicate-detail__fingerprint').text()).toContain(group.fingerprint);
    expect(wrapper.find('.duplicate-detail').text()).toContain('专业科目'); expect(wrapper.find('.duplicate-detail').text()).toContain('停用');
    expect(wrapper.findAllComponents(RouterLink).map(link => link.props('to'))).toContainEqual({ path: '/author/banks', query: { bankId: 'bank-2' } });
    await wrapper.findAll('button').find(b => b.text() === '收起对照')!.trigger('click'); await flushPromises();
    expect(wrapper.findAll('button').some(b => b.text() === '展开对照')).toBe(true);
  });
  it('CSV包含所有返回题目，正确保留换行与引号，范围明确为已返回记录', async () => {
    await render(); let parts: BlobPart[] = [];
    vi.stubGlobal('Blob', class { constructor(value: BlobPart[]) { parts = value; } });
    const revoke = vi.fn(); vi.stubGlobal('URL', { createObjectURL: vi.fn(() => 'blob:mock'), revokeObjectURL: revoke });
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    await wrapper.findAll('button').find(b => b.text() === '导出 CSV')!.trigger('click');
    const csv = parts.join('');
    expect(csv).toContain('"题库A,""完整名称"'); expect(csv).toContain('"第一行完整题干\n第二行含""引号"""');
    expect(csv).toContain('"q1"'); expect(csv).toContain('"q2"'); expect(click).toHaveBeenCalledOnce(); expect(revoke).toHaveBeenCalledWith('blob:mock');
    expect(wrapper.find('.admin-scope').text()).toContain('已返回 1 组重复、2 道题');
  });
  it('加载或失败时禁止导出，包含停用题筛选沿用原参数', async () => {
    api.duplicates.mockRejectedValueOnce(new Error('offline')); await render();
    expect(wrapper.findAll('button').find(b => b.text() === '导出 CSV')!.attributes()).toHaveProperty('disabled');
    expect(wrapper.find('.admin-scope').text()).toContain('数量未知');
    await wrapper.findComponent({ name: 'ElCheckbox' }).setValue(true); await flushPromises();
    expect(api.duplicates).toHaveBeenLastCalledWith({ includeDisabled: 1 });
    expect(wrapper.find('.admin-scope').text()).toContain('2 道题');
  });
});
