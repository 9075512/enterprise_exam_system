import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import ElementPlus, { ElSwitch } from 'element-plus';
import PaperPreviewPage from './PaperPreviewPage.vue';
import type { PaperDetail, QuestionType } from '@/types';

const api = vi.hoisted(() => ({ questions: vi.fn(), push: vi.fn() }));
vi.mock('@/api/exams', () => ({ questions: api.questions }));
vi.mock('vue-router', () => ({ useRoute: () => ({ params: { id: 'exam-1' } }), useRouter: () => ({ push: api.push }) }));
const types: QuestionType[] = ['single', 'multiple', 'judge', 'fill', 'short'];
const paper = {
  id: 'paper-1', name: '完整考试名称', description: '', bankIds: ['bank-1'], bankNames: ['完整来源题库'], createdBy: 'admin', createdAt: '', totalScore: 100,
  questions: types.map((type, i) => ({ questionId: `q${i}`, score: 20, bankId: 'bank-1', bankName: '完整来源题库', question: {
    id: `q${i}`, bankId: 'bank-1', type, stem: '长题干\n' + 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.repeat(5),
    options: type === 'short' || type === 'fill' ? [] : ['选项甲', '选项乙'], answer: type === 'fill' ? ['第一空', '第二空'] : type === 'short' ? ['简答参考文本'] : [0],
    defaultScore: 20, analysis: `解析${i}`, subject: '', subjectId: null, status: 'active', difficulty: null, tags: [], rubric: [], createdBy: 'admin', createdAt: '',
  } })),
} as PaperDetail;
let wrapper: VueWrapper;
beforeEach(() => { vi.resetAllMocks(); api.questions.mockResolvedValue(paper); });
afterEach(() => wrapper?.unmount());
describe('五种题型预览', () => {
  it('前置开关仅改变本页答案、解析与分值展示，保留完整五种题型', async () => {
    wrapper = mount(PaperPreviewPage, { global: { plugins: [ElementPlus] } }); await flushPromises();
    expect(wrapper.findAll('.preview__question')).toHaveLength(5);
    expect(wrapper.get('.preview__main').element.firstElementChild?.classList.contains('preview__controls')).toBe(true);
    expect(wrapper.text()).toContain('第 1 空：第一空；第 2 空：第二空');
    expect(wrapper.text()).toContain('简答参考文本');
    expect(wrapper.text()).toContain('结构小计与试卷总分一致');
    for (const toggle of wrapper.findAllComponents(ElSwitch)) toggle.vm.$emit('update:modelValue', false);
    await flushPromises();
    expect(wrapper.findAll('.preview__reference')).toHaveLength(0);
    expect(wrapper.findAll('.preview__analysis')).toHaveLength(0);
    expect(wrapper.findAll('.preview__question-head .el-tag--success')).toHaveLength(0);
    expect(wrapper.text()).not.toContain('正确答案');
    expect(api.questions).toHaveBeenCalledTimes(1);
    expect(paper.questions[3].question.answer).toEqual(['第一空', '第二空']);
  });
  it('预览加载失败可重试，失败时不误报无题', async () => {
    api.questions.mockRejectedValueOnce(new Error('offline'));
    wrapper = mount(PaperPreviewPage, { global: { plugins: [ElementPlus] } }); await flushPromises();
    expect(wrapper.text()).toContain('试卷预览加载失败');
    expect(wrapper.text()).not.toContain('该试卷暂无题目');
    await wrapper.get('.request-error button').trigger('click'); await flushPromises();
    expect(wrapper.findAll('.preview__question')).toHaveLength(5);
  });
});
