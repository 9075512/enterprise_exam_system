import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import ElementPlus, { ElDialog, ElMessage } from 'element-plus';
import QuestionFeedbackDialog from './QuestionFeedbackDialog.vue';

const api = vi.hoisted(() => ({ submit: vi.fn() }));
vi.mock('@/api/practice', () => ({ submitQuestionFeedback: api.submit }));
let wrapper: VueWrapper;
function button(text: string) { return [...document.querySelectorAll<HTMLButtonElement>('.el-dialog button')].find(b => b.textContent?.trim() === text)!; }
async function render() {
  wrapper = mount(QuestionFeedbackDialog, { attachTo: document.body, props: { visible: true, questionId: 'q1', sessionId: 's1', questionNumber: 3, stem: '原始题干\n第二段ABCDEFGHIJKLMNOPQRSTUVWXYZ' }, global: { plugins: [ElementPlus] } });
  await flushPromises();
}
beforeEach(() => { vi.resetAllMocks(); api.submit.mockResolvedValue({}); });
afterEach(() => { wrapper?.unmount(); ElMessage.closeAll(); document.body.innerHTML = ''; });

describe('练题纠错反馈', () => {
  it('显示原题上下文，空白说明就地校验并聚焦', async () => {
    await render();
    expect(document.body.textContent).toContain('第 3 题');
    expect(document.body.textContent).toContain('原始题干\n第二段');
    await wrapper.getComponent({ name: 'ElInput' }).get('textarea').setValue('   ');
    button('提交反馈').click(); await flushPromises();
    await vi.waitFor(() => expect(document.body.textContent).toContain('请输入问题描述'));
    expect(document.activeElement?.tagName).toBe('TEXTAREA');
    expect(api.submit).not.toHaveBeenCalled();
  });

  it('失败保留描述，提交中锁定关闭与重复请求，重试沿用来源ID', async () => {
    await render();
    await wrapper.getComponent({ name: 'ElInput' }).get('textarea').setValue('  答案与解析矛盾\n请核对第二段  ');
    let reject!: (e: Error) => void;
    api.submit.mockImplementationOnce(() => new Promise((_, fail) => { reject = fail; }));
    button('提交反馈').click(); await flushPromises();
    expect(wrapper.getComponent({ name: 'ElInput' }).get('textarea').attributes('disabled')).toBeDefined();
    expect(button('取消').disabled).toBe(true);
    expect(wrapper.getComponent(ElDialog).props('closeOnPressEscape')).toBe(false);
    wrapper.getComponent(ElDialog).vm.$emit('update:modelValue', false); await flushPromises();
    expect(wrapper.emitted('update:visible')).toBeUndefined();
    button('提交反馈').click(); await flushPromises();
    expect(api.submit).toHaveBeenCalledTimes(1);
    reject(new Error('offline')); await flushPromises();
    expect(document.body.textContent).toContain('反馈提交失败，已保留问题描述');
    expect((wrapper.getComponent({ name: 'ElInput' }).get('textarea').element as HTMLTextAreaElement).value).toContain('答案与解析矛盾\n请核对第二段');
    button('提交反馈').click(); await flushPromises();
    expect(api.submit).toHaveBeenLastCalledWith({ questionId: 'q1', sessionId: 's1', category: '题目纠错', content: '答案与解析矛盾\n请核对第二段' });
    expect(wrapper.emitted('update:visible')?.at(-1)).toEqual([false]);
    expect(wrapper.emitted('busy')).toEqual([[true], [false], [true], [false]]);
  });
});
