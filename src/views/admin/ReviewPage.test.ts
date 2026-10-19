import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import ElementPlus, { ElCheckbox, ElInputNumber } from 'element-plus';
import ReviewPage from './ReviewPage.vue';
import type { ExamRecord } from '@/types';

const api = vi.hoisted(() => ({ pending: vi.fn(), review: vi.fn(), anonymous: false }));
vi.mock('@/api/records', () => ({ listPending: api.pending, review: api.review }));
vi.mock('@/composables/useExamScope', async () => { const { ref } = await import('vue'); return { useExamScope: () => ({ examId: ref('e1') }) }; });
vi.mock('@/stores/settings', () => ({ useSettingsStore: () => ({ load: vi.fn(), settings: { defaultPageSize: 20, get reviewAnonymous() { return api.anonymous; } } }) }));
function record(id: string) {
  return { id, userName: id === 'r1' ? '考生甲' : '考生乙', username: id, departmentName: '研发部', status: 'pending_review', attemptNo: 1, score: 40, passScore: 60, submittedAt: '2026-10-19T00:00:00Z', answers: { q1: ['<p>考生原作答</p>'] }, cheatEvents: [], paperSnapshot: { totalScore: 100, questions: [{ questionId: 'q1', score: 20, question: { id: 'q1', type: 'short', stem: '简答题干', answer: ['参考答案'], rubric: [{ score: 20, label: '完整', description: '包括所有要点' }, { score: 10, label: '部分', description: '包括部分要点' }] } }] } } as unknown as ExamRecord;
}
let wrapper: VueWrapper;
async function render() { wrapper = mount(ReviewPage, { attachTo: document.body, global: { plugins: [ElementPlus], stubs: { ExamScopeSelect: { props: ['disabled'], template: '<button :disabled="disabled" class="exam-scope-test">考试范围</button>' } } } }); await flushPromises(); }
function button(text: string) { return wrapper.findAll('button').find(b => b.text().trim() === text)!; }
beforeEach(() => { vi.resetAllMocks(); api.anonymous = false; api.pending.mockResolvedValue({ list: [record('r1'), record('r2')], total: 2, page: 1, pageSize: 20 }); api.review.mockResolvedValue({}); });
afterEach(() => { wrapper?.unmount(); document.body.innerHTML = ''; });

describe('人工阅卷评分与提交', () => {
  it('首次加载不提前展示无答卷空状态，完成后再显示真实结果', async () => {
    let finish!: (value: unknown) => void; api.pending.mockReturnValue(new Promise(resolve => { finish = resolve; }));
    await render();
    expect(wrapper.text()).not.toContain('暂无待阅卷答卷');
    expect(wrapper.find('.review-page__grid').exists()).toBe(false);
    finish({ list: [], total: 0, page: 1, pageSize: 20 }); await flushPromises();
    expect(wrapper.text()).toContain('该考试暂无待阅卷答卷');
  });
  it('评分档位填入原分值，手动修改后需要重新确认本题', async () => {
    await render();
    await wrapper.findAll('.review-page__rubric-band')[1]!.trigger('click');
    expect(wrapper.getComponent(ElInputNumber).props('modelValue')).toBe(10);
    expect(wrapper.findAll('.review-page__rubric-band')[1]!.attributes('aria-pressed')).toBe('true');
    await button('本题评分').trigger('click'); expect(wrapper.text()).toContain('全部主观题已评分');
    wrapper.getComponent(ElInputNumber).vm.$emit('update:modelValue', 8.5);
    wrapper.getComponent(ElInputNumber).vm.$emit('change', 8.5, 10); await flushPromises();
    expect(wrapper.text()).toContain('还有 1 题未评分');
    await button('本题评分').trigger('click');
    expect(wrapper.text()).toContain('48.5 / 100');
  });

  it('非法分数不提交，失败后保留评语与内部存疑标记', async () => {
    await render(); const input = wrapper.getComponent(ElInputNumber);
    input.vm.$emit('update:modelValue', undefined); await flushPromises();
    await button('提交阅卷').trigger('click'); await flushPromises(); expect(api.review).not.toHaveBeenCalled();
    input.vm.$emit('update:modelValue', 12.5); await wrapper.get('textarea').setValue('  请补充关键步骤  ');
    await wrapper.getComponent(ElCheckbox).setValue(false); await button('标记存疑').trigger('click');
    api.review.mockRejectedValueOnce(new Error('offline'));
    await button('提交阅卷').trigger('click'); await flushPromises();
    expect(api.review).toHaveBeenCalledWith('r1', { q1: 12.5 }, { q1: { comment: '请补充关键步骤', commentVisible: false, doubtful: true } });
    expect((wrapper.get('textarea').element as HTMLTextAreaElement).value).toBe('  请补充关键步骤  ');
    expect(button('已标记存疑').attributes('aria-pressed')).toBe('true');
    expect(wrapper.getComponent(ElInputNumber).props('disabled')).toBe(false);
    await button('提交阅卷').trigger('click'); await flushPromises(); expect(api.review).toHaveBeenCalledTimes(2);
  });

  it('提交期间锁定队列、评分与范围，连续Enter不会重复请求', async () => {
    await render(); let finish!: (value: unknown) => void; api.review.mockReturnValue(new Promise(resolve => { finish = resolve; }));
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' })); await flushPromises();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    window.dispatchEvent(new KeyboardEvent('keydown', { key: '2' })); await flushPromises();
    expect(api.review).toHaveBeenCalledTimes(1);
    expect(wrapper.findAll('.review-page__queue-item').every(b => b.attributes('disabled') !== undefined)).toBe(true);
    expect(wrapper.get('.exam-scope-test').attributes('disabled')).toBeDefined();
    expect(wrapper.getComponent(ElInputNumber).props('disabled')).toBe(true);
    expect(wrapper.getComponent(ElInputNumber).props('modelValue')).toBe(20);
    api.pending.mockResolvedValue({ list: [record('r2')], total: 1, page: 1, pageSize: 20 }); finish({}); await flushPromises();
    expect(wrapper.get('.review-page__record-name').text()).toBe('考生乙');
    expect(wrapper.getComponent(ElInputNumber).props('disabled')).toBe(false);
  });

  it('输入评语时Enter保持原生输入，不触发阅卷提交', async () => {
    await render(); await wrapper.get('textarea').trigger('keydown', { key: 'Enter' }); await flushPromises();
    expect(api.review).not.toHaveBeenCalled();
    expect(wrapper.findAll('.review-page__queue-item')[0]!.attributes('aria-pressed')).toBe('true');
  });
});
