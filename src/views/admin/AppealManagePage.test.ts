import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { createMemoryHistory, createRouter } from 'vue-router';
import ElementPlus, { ElInputNumber, ElRadioGroup, ElTabs } from 'element-plus';
import AppealManagePage from './AppealManagePage.vue';
import type { ExamRecord, ScoreAppeal } from '@/types';

const api = vi.hoisted(() => ({ list: vi.fn(), detail: vi.fn(), approve: vi.fn(), reject: vi.fn(), confirm: vi.fn() }));
vi.mock('@/api/appeals', () => ({ list: api.list, approve: api.approve, reject: api.reject }));
vi.mock('@/api/records', () => ({ detail: api.detail }));
vi.mock('@/composables/useConfirm', () => ({ useConfirm: () => ({ confirm: api.confirm }) }));
const appeal = { id: 'a1', recordId: 'r1', examId: 'e1', examName: '专业测评', userId: 'u1', userName: '张三', username: 'zhangsan', departmentName: '研发部', status: 'pending', reason: '请核对评分要点', originalScore: 58, newScore: null, reviewComment: '', appliedAt: '2026-10-18T01:00:00Z', reviewedAt: null, reviewedBy: null } satisfies ScoreAppeal;
const record = { id: 'r1', score: 58, submittedAt: '2026-10-17T01:00:00Z', paperSnapshot: { paperId: 'p1', paperName: '测评', totalScore: 120, questions: [] } } as unknown as ExamRecord;
let wrapper: VueWrapper;
beforeEach(() => {
  vi.resetAllMocks();
  api.list.mockResolvedValue({ list: [appeal], total: 43 });
  api.detail.mockResolvedValue(record);
  api.confirm.mockResolvedValue(true);
  api.approve.mockResolvedValue({ ...appeal, status: 'approved' });
  api.reject.mockResolvedValue({ ...appeal, status: 'rejected' });
});
afterEach(() => { wrapper?.unmount(); document.body.innerHTML = ''; });
async function setup() {
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/admin/appeals', component: AppealManagePage }, { path: '/score-detail/:id', component: { template: '<div />' } }] });
  await router.push('/admin/appeals?examId=e1');
  await router.isReady();
  wrapper = mount(AppealManagePage, { global: { plugins: [router, ElementPlus], stubs: {
    ExamScopeSelect: true,
    ElDrawer: { props: ['modelValue'], template: '<section v-if="modelValue" class="detail-drawer"><slot /><slot name="footer" /></section>' },
  } } });
  await flushPromises();
  return router;
}
async function openDetail() {
  await wrapper.findAll('button').find(b => b.text() === '查看并处理')!.trigger('click');
  await flushPromises();
}
async function submit() {
  await wrapper.findAll('button').find(b => b.text() === '核对并提交')!.trigger('click');
  await flushPromises();
}
describe('成绩复核真实范围与处理流程', () => {
  it('考试范围传给服务端，数量使用分页总数，切换状态保留考试范围', async () => {
    await setup();
    expect(api.list).toHaveBeenCalledWith(expect.objectContaining({ examId: 'e1', page: 1 }));
    expect(wrapper.text()).toContain('共 43 条申请');
    wrapper.getComponent(ElTabs).vm.$emit('update:modelValue', 'pending');
    await flushPromises();
    expect(api.list).toHaveBeenLastCalledWith({ status: 'pending', examId: 'e1', page: 1, pageSize: 20 });
  });
  it('请求失败单独展示错误，不能当作空列表或零条申请', async () => {
    api.list.mockRejectedValue(new Error('offline'));
    await setup();
    expect(wrapper.text()).toContain('复核申请加载失败');
    expect(wrapper.text()).toContain('共 — 条申请');
    expect(wrapper.text()).not.toContain('暂无复核申请');
  });
  it('原答卷与满分来自所选记录，超出满分时不提交', async () => {
    await setup(); await openDetail();
    expect(api.detail).toHaveBeenCalledWith('r1');
    expect(wrapper.get('.detail-drawer').text()).toContain('卷面满分 120');
    expect(wrapper.get('.detail-drawer a').attributes('href')).toBe('/score-detail/r1');
    wrapper.getComponent(ElInputNumber).vm.$emit('update:modelValue', 121);
    await submit();
    expect(api.confirm).not.toHaveBeenCalled();
    expect(api.approve).not.toHaveBeenCalled();
  });
  it('取消影响确认不改分，确认后仍使用原有审批接口', async () => {
    await setup(); await openDetail();
    wrapper.getComponent(ElInputNumber).vm.$emit('update:modelValue', 65);
    api.confirm.mockResolvedValueOnce(false);
    await submit();
    expect(api.approve).not.toHaveBeenCalled();
    expect(wrapper.find('.detail-drawer').exists()).toBe(true);
    await submit();
    expect(api.confirm.mock.calls.at(-1)?.[0]).toContain('58 分调整为 65 分');
    expect(api.approve).toHaveBeenCalledWith('a1', 65, '');
    expect(wrapper.find('.detail-drawer').exists()).toBe(false);
    expect(api.list).toHaveBeenLastCalledWith(expect.objectContaining({ examId: 'e1' }));
  });
  it('驳回必须填写原因，提交失败保留填写内容以便重试', async () => {
    await setup(); await openDetail();
    wrapper.getComponent(ElRadioGroup).vm.$emit('update:modelValue', 'rejected');
    await flushPromises(); await submit();
    expect(api.reject).not.toHaveBeenCalled();
    await wrapper.get('textarea').setValue('已按原评分细则核对');
    api.reject.mockRejectedValueOnce(new Error('offline'));
    await submit();
    expect(api.reject).toHaveBeenCalledWith('a1', '已按原评分细则核对');
    expect(wrapper.find('.detail-drawer').exists()).toBe(true);
    expect((wrapper.get('textarea').element as HTMLTextAreaElement).value).toBe('已按原评分细则核对');
  });
});
