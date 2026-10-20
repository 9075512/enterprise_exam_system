import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import AnswerSheet from './AnswerSheet.vue';
import type { QuestionType } from '@/types';

const questions = (['single', 'multiple', 'judge', 'fill', 'short'] as QuestionType[]).map((type, i) => ({ id: `q${i}`, type, blanks: type === 'fill' ? 2 : undefined }));
describe('答题卡的完整作答状态与交互', () => {
  it('五类题型连续编号，填空未全部完成仍为未答，跳转沿用全局序号', async () => {
    const wrapper = mount(AnswerSheet, { props: { questions, answers: { q0: [0], q3: ['第一空', ''] }, currentIndex: 3 } });
    expect(wrapper.findAll('.answer-sheet__section')).toHaveLength(5);
    expect(wrapper.find('.answer-sheet__tag').text()).toBe('已答 1');
    const buttons = wrapper.findAll('button');
    expect(buttons.map(b => b.text())).toEqual(['1', '2', '3', '4', '5']);
    expect(buttons[3]!.attributes('aria-label')).toContain('未答');
    expect(buttons[3]!.attributes('aria-current')).toBe('true');
    await buttons[4]!.trigger('click');
    expect(wrapper.emitted('jump')).toEqual([[4]]);
    wrapper.unmount();
  });
  it('交卷等处理期间题号禁用，恢复后可继续跳转', async () => {
    const wrapper = mount(AnswerSheet, { props: { questions, answers: {}, currentIndex: 0, disabled: true } });
    expect(wrapper.findAll('button').every(b => b.attributes('disabled') !== undefined)).toBe(true);
    await wrapper.find('button').trigger('click'); expect(wrapper.emitted('jump')).toBeUndefined();
    await wrapper.setProps({ disabled: false });
    await wrapper.find('button').trigger('click'); expect(wrapper.emitted('jump')).toEqual([[0]]);
    wrapper.unmount();
  });
});
