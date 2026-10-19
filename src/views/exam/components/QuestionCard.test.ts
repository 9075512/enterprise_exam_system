import { afterEach, describe, expect, it } from 'vitest';
import { mount, type VueWrapper } from '@vue/test-utils';
import { createPinia } from 'pinia';
import ElementPlus from 'element-plus';
import QuestionCard from './QuestionCard.vue';
import AnswerSheet from './AnswerSheet.vue';
import type { Question } from '@/types';
let wrapper: VueWrapper;
afterEach(() => wrapper?.unmount());
describe('填空回传与答题卡进度', () => {
  it('每一空修改都回传完整数组，保证整卷暂存能收到答案', async () => {
    wrapper = mount(QuestionCard, { props: { index: 0, question: { type: 'fill', stem: '___ 与 ___', answer: ['参考甲', '参考乙'] } as Question, score: 10, modelValue: [] }, global: { plugins: [createPinia(), ElementPlus] } });
    await wrapper.findAll('input')[0]!.setValue('作答甲');
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([['作答甲', '']]);
    await wrapper.setProps({ modelValue: ['作答甲', ''] });
    await wrapper.findAll('input')[1]!.setValue('作答乙');
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([['作答甲', '作答乙']]);
    expect(wrapper.text()).not.toContain('参考甲');
  });
  it('提交期间填空控件禁用，空白填空和富文本不虚报已答', async () => {
    wrapper = mount(QuestionCard, { props: { index: 0, question: { type: 'fill', stem: '___', answer: [] } as unknown as Question, score: 10, modelValue: [''], disabled: true }, global: { plugins: [createPinia(), ElementPlus] } });
    expect(wrapper.get('input').attributes('disabled')).toBeDefined(); wrapper.unmount();
    wrapper = mount(AnswerSheet, { props: { questions: [{ id: 'fill', type: 'fill', blanks: 2 }, { id: 'short', type: 'short' }], answers: { fill: ['甲', ''], short: ['<p><br></p>'] }, currentIndex: 0 } });
    expect(wrapper.find('.answer-sheet__tag').text()).toBe('已答 0');
    await wrapper.setProps({ answers: { fill: ['甲', '乙'], short: ['<img src="example">'] } });
    expect(wrapper.find('.answer-sheet__tag').text()).toBe('已答 2');
  });
});
