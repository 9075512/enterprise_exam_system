import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import ElementPlus, { ElButton } from 'element-plus';
import QuestionFeedbackPage from './QuestionFeedbackPage.vue';
const api = vi.hoisted(() => ({ list: vi.fn(), update: vi.fn() }));
vi.mock('@/api/coreFeatures', () => ({ feedbackApi: api }));
const feedback = { id: 'f1', userName: '完整反馈人姓名', questionId: 'question-id-long', sourceRefId: 'session-id', category: '答案核对', content: '第一段反馈\n第二段完整说明ABCDEFGHIJKLMNOPQRSTUVWXYZ', status: 'pending', reply: '', source: 'practice', handledAt: null, handledBy: null, createdAt: '2026-10-19T00:00:00Z' };
let wrapper: VueWrapper;
beforeEach(() => { vi.resetAllMocks(); api.list.mockResolvedValue([feedback]); });
afterEach(() => { wrapper?.unmount(); document.body.innerHTML = ''; });
async function render() { wrapper = mount(QuestionFeedbackPage, { attachTo: document.body, global: { plugins: [ElementPlus], stubs: { TableDensityToggle: true } } }); await flushPromises(); }
const button = (label: string) => wrapper.findAllComponents(ElButton).find(b => b.text() === label)!;
describe('反馈详情与保存恢复', () => {
  it('加载期间不显示零条，详情完整保留来源、题目标识与换行', async () => {
    let finish!: (rows: unknown[]) => void;
    api.list.mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
    await render(); expect(wrapper.find('.admin-scope').text()).toContain('正在加载');
    finish([feedback]); await flushPromises();
    await button('查看并处理').trigger('click'); await flushPromises();
    const details = document.querySelector('.feedback-detail')!;
    expect(details.textContent).toContain('question-id-long'); expect(details.textContent).toContain('session-id');
    expect(details.textContent).toContain('练题'); expect(details.textContent).toContain('尚未处理');
    expect(details.querySelector('.feedback-detail__content p')?.textContent).toBe(feedback.content);
  });
  it('重复保存只提交一次，失败保留回复和状态，操作恢复后可重试', async () => {
    await render(); await button('查看并处理').trigger('click'); await flushPromises();
    const textarea = document.querySelector<HTMLTextAreaElement>('.feedback-detail textarea')!;
    textarea.value = '核对中，请保留原题'; textarea.dispatchEvent(new Event('input', { bubbles: true }));
    const select = wrapper.findAllComponents({ name: 'ElSelect' }).at(-1)!;
    select.vm.$emit('update:modelValue', 'processing'); await flushPromises();
    let reject!: (error: Error) => void;
    api.update.mockReturnValueOnce(new Promise((_resolve, fail) => { reject = fail; }));
    const save = button('保存处理结果'); save.vm.$emit('click', new MouseEvent('click')); save.vm.$emit('click', new MouseEvent('click')); await flushPromises();
    expect(api.update).toHaveBeenCalledTimes(1);
    expect(api.update).toHaveBeenCalledWith('f1', { status: 'processing', reply: '核对中，请保留原题' });
    expect(wrapper.findComponent({ name: 'ElDrawer' }).props('closeOnPressEscape')).toBe(false);
    reject(new Error('offline')); await flushPromises();
    expect(textarea.value).toBe('核对中，请保留原题'); expect(select.props('modelValue')).toBe('processing');
    expect(document.body.textContent).toContain('保存失败，处理状态和回复已保留');
    api.update.mockResolvedValueOnce({ ...feedback, status: 'processing' }); save.vm.$emit('click', new MouseEvent('click')); await flushPromises();
    expect(api.update).toHaveBeenCalledTimes(2); expect(wrapper.findComponent({ name: 'ElDrawer' }).props('modelValue')).toBe(false);
  });
});
