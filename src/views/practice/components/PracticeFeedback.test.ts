import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import PracticeFeedback from './PracticeFeedback.vue';

describe('练题反馈可见性', () => {
  it('关闭答案与解析时不把受限内容渲染进DOM，仍显示本人的作答与判分', () => {
    const wrapper = mount(PracticeFeedback, { props: { selected: [0], result: { type: 'multiple', correct: false, correctAnswer: [1, 3], analysis: '受限解析内容', answerVisible: false, analysisVisible: false } } });
    expect(wrapper.text()).toContain('回答错误');
    expect(wrapper.text()).toContain('你的作答A');
    expect(wrapper.text()).toContain('当前练习未开放答案');
    expect(wrapper.text()).toContain('当前练习未开放解析');
    expect(wrapper.text()).not.toContain('B、D');
    expect(wrapper.text()).not.toContain('受限解析内容');
    wrapper.unmount();
  });
  it('旧响应按原规则展示答案与解析，展示排序不修改原始答案数组', () => {
    const correctAnswer = [3, 1];
    const wrapper = mount(PracticeFeedback, { props: { selected: [1, 3], result: { type: 'multiple', correct: true, correctAnswer, analysis: '原有解析' } } });
    expect(wrapper.text()).toContain('正确答案B、D');
    expect(wrapper.text()).toContain('原有解析');
    expect(correctAnswer).toEqual([3, 1]);
    wrapper.unmount();
  });
});
