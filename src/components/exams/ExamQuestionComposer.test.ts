import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import ElementPlus, { ElMessage } from 'element-plus';
import ExamQuestionComposer from './ExamQuestionComposer.vue';
import type { DrawResult, PaperDetail, Question } from '@/types';

const api = vi.hoisted(() => ({ banks: vi.fn(), pool: vi.fn(), subjects: vi.fn(), tags: vi.fn(), draw: vi.fn(), papers: vi.fn() }));
vi.mock('@/api/banks', () => ({ list: api.banks }));
vi.mock('@/api/questions', () => ({ pool: api.pool, subjects: api.subjects, tags: api.tags }));
vi.mock('@/api/exams', () => ({ drawQuestions: api.draw }));
vi.mock('@/api/coreFeatures', () => ({ templatesApi: { papers: api.papers } }));
vi.mock('@/stores/settings', () => ({ useSettingsStore: () => ({ load: vi.fn(), settings: { defaultPageSize: 20, paperTargetDifficulty: 0.7 } }) }));

const question: Question = {
  id: 'old', bankId: 'bank-1', type: 'single', stem: '原有题目', options: ['甲', '乙'], answer: [0],
  defaultScore: 9, analysis: '', subject: '', subjectId: null, status: 'active', difficulty: 'low',
  tags: [], rubric: [], createdBy: 'admin', createdAt: '',
};
const initial: PaperDetail = {
  id: 'paper-1', name: '考试', description: '', bankIds: ['bank-1'], bankNames: ['安全题库'],
  createdBy: 'admin', createdAt: '', totalScore: 9,
  questions: [{ questionId: 'old', score: 9, question, bankId: 'bank-1', bankName: '安全题库' }],
};
const drawn: DrawResult = {
  questions: [
    { questionId: 'new', stem: '新抽多选题', type: 'multiple', score: 4, difficulty: 'medium' },
    { questionId: 'old', stem: '原有题目', type: 'single', score: 2, difficulty: 'low' },
  ], shortages: [], tagShortages: [],
};
const wrappers: ReturnType<typeof mount>[] = [];
async function render() {
  const wrapper = mount(ExamQuestionComposer, { props: { examName: '考试', initial }, global: { plugins: [ElementPlus] } });
  wrappers.push(wrapper);
  await flushPromises();
  return wrapper;
}
async function click(wrapper: Awaited<ReturnType<typeof render>>, text: string) {
  const button = wrapper.findAll('button').find(item => item.text() === text);
  expect(button, text).toBeDefined();
  await button!.trigger('click');
  await flushPromises();
}
async function configureDraw(wrapper: Awaited<ReturnType<typeof render>>) {
  await wrapper.get('input[type="radio"][value="draw"]').setValue();
  await flushPromises();
  const rows = wrapper.findAll('.composer__rule-table .el-table__body-wrapper tbody tr');
  await rows[0]!.findAll('input')[0]!.setValue(1);
  await rows[1]!.findAll('input')[0]!.setValue(1);
}

beforeEach(() => {
  vi.clearAllMocks();
  api.banks.mockResolvedValue([{ id: 'bank-1', name: '安全题库', questionCount: 10 }]);
  api.pool.mockResolvedValue({ list: [question], total: 1, page: 1, pageSize: 20 });
  api.subjects.mockResolvedValue([]); api.papers.mockResolvedValue([]); api.draw.mockResolvedValue(drawn);
});
afterEach(() => { wrappers.splice(0).forEach(wrapper => wrapper.unmount()); ElMessage.closeAll(); });

describe('考试选题工作台', () => {
  it('每次生成整体替换已选题目和分值，重复生成不累加，并保持题型顺序', async () => {
    const wrapper = await render();
    await configureDraw(wrapper);
    await click(wrapper, '生成试卷草稿');
    expect(api.draw).toHaveBeenCalledWith({ bankIds: ['bank-1'], rules: { single: { count: 1, score: 2 }, multiple: { count: 1, score: 4 } } });
    expect(wrapper.vm.getPayload()?.questions).toEqual([{ questionId: 'old', score: 2 }, { questionId: 'new', score: 4 }]);
    expect(wrapper.vm.summary).toEqual({ questionCount: 2, totalScore: 6 });
    await click(wrapper, '生成试卷草稿');
    expect(wrapper.vm.summary).toEqual({ questionCount: 2, totalScore: 6 });
    api.draw.mockResolvedValue({ ...drawn, questions: [drawn.questions[0]] });
    await click(wrapper, '生成试卷草稿');
    expect(wrapper.vm.getPayload()?.questions).toEqual([{ questionId: 'new', score: 4 }]);
  });

  it('清空全部同步更新题量、总分和手动勾选状态，仍可重新选题', async () => {
    const wrapper = await render();
    const checkbox = () => wrapper.get('.composer__main .el-table__body-wrapper input[type="checkbox"]');
    expect((checkbox().element as HTMLInputElement).checked).toBe(true);
    await click(wrapper, '清空全部');
    expect(wrapper.vm.summary).toEqual({ questionCount: 0, totalScore: 0 });
    expect(wrapper.get('.composer__selected-empty').text()).toContain('还没有选择题目');
    expect((checkbox().element as HTMLInputElement).checked).toBe(false);
    expect(wrapper.findAll('button').find(item => item.text() === '清空全部')!.attributes('disabled')).toBeDefined();
    await checkbox().setValue(true);
    expect(wrapper.vm.getPayload()?.questions).toEqual([{ questionId: 'old', score: 9 }]);
  });

  it('题量不足或请求失败保留已有题目与分值', async () => {
    const wrapper = await render();
    await configureDraw(wrapper);
    api.draw.mockResolvedValueOnce({ questions: [], shortages: [{ type: 'single', required: 1, available: 0 }], tagShortages: [] });
    await click(wrapper, '生成试卷草稿');
    expect(wrapper.get('.composer__shortage').text()).toContain('题量不足');
    expect(wrapper.vm.getPayload()?.questions).toEqual([{ questionId: 'old', score: 9 }]);
    api.draw.mockRejectedValueOnce(new Error('offline'));
    await click(wrapper, '生成试卷草稿');
    expect(wrapper.vm.summary).toEqual({ questionCount: 1, totalScore: 9 });
  });

  it('手动选题、抽题及分析均移除知识点入口，也不请求知识点候选', async () => {
    const wrapper = await render();
    expect(wrapper.html()).not.toContain('知识点');
    await configureDraw(wrapper);
    expect(wrapper.html()).not.toContain('知识点');
    expect(api.tags).not.toHaveBeenCalled();
  });
});
