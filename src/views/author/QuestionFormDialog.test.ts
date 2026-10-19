import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import ElementPlus, { ElButton, ElDrawer } from 'element-plus';
import type { Question, QuestionType } from '@/types';
import QuestionFormDialog from './QuestionFormDialog.vue';

const api = vi.hoisted(() => ({ create: vi.fn(), update: vi.fn() }));
vi.mock('@/api/questions', () => api);
let wrapper: VueWrapper;
beforeEach(() => vi.resetAllMocks());
afterEach(() => { wrapper?.unmount(); document.body.innerHTML = ''; });

describe('五种题型编辑抽屉', () => {
  it('删除多选项后同步答案序号，并完整保存长选项', async () => {
    const longOption = '应完整保留的长选项与换行\n' + 'ABCDEFGHIJ'.repeat(20);
    const question = { subject: '', subjectId: null, status: 'active', difficulty: null, createdBy: 'author1', createdAt: '2026-10-19T00:00:00Z', id: 'q1', bankId: 'bank1', type: 'multiple', stem: '题干', analysis: '', options: ['删除这一项', longOption, '第三项'], answer: [1, 2], defaultScore: 10, tags: [], rubric: [] } as Question;
    api.update.mockResolvedValue({});
    wrapper = mount(QuestionFormDialog, { props: { visible: false, bankId: 'bank1', question }, attachTo: document.body, global: { plugins: [ElementPlus] } });
    await wrapper.setProps({ visible: true }); await flushPromises();
    wrapper.findAllComponents(ElButton).find(b => b.attributes('aria-label') === '删除选项 A')!.vm.$emit('click', new MouseEvent('click'));
    await flushPromises();
    wrapper.findAllComponents(ElButton).find(b => b.text() === '保存')!.vm.$emit('click', new MouseEvent('click')); await flushPromises();
    expect(api.update).toHaveBeenCalledWith('q1', expect.objectContaining({ options: [longOption, '第三项'], answer: [0, 1] }));
    expect(question.options).toEqual(['删除这一项', longOption, '第三项']);
    expect(question.answer).toEqual([1, 2]);
  });

  it('评分档位按得分排序、清理空白，保留完整说明且不改动原题', async () => {
    const description = '评分要点\n' + '长说明'.repeat(40);
    const question = { subject: '', subjectId: null, status: 'active', difficulty: null, createdBy: 'author1', createdAt: '2026-10-19T00:00:00Z', id: 'q1', bankId: 'bank1', type: 'short', stem: '题干', analysis: '', options: [], answer: ['参考答案'], defaultScore: 10, tags: ['历史标签'], rubric: [{ score: 5, label: ' 部分正确 ', description: ` ${description} ` }, { score: 10, label: '完整', description: '全部要点' }] } as Question;
    api.update.mockResolvedValue({});
    wrapper = mount(QuestionFormDialog, { props: { visible: false, bankId: 'bank1', question }, attachTo: document.body, global: { plugins: [ElementPlus] } });
    await wrapper.setProps({ visible: true }); await flushPromises();
    wrapper.findAllComponents(ElButton).find(b => b.text() === '保存')!.vm.$emit('click', new MouseEvent('click')); await flushPromises();
    expect(api.update).toHaveBeenCalledWith('q1', expect.objectContaining({ tags: ['历史标签'], rubric: [{ score: 10, label: '完整', description: '全部要点' }, { score: 5, label: '部分正确', description }] }));
    expect(question.rubric![0].label).toBe(' 部分正确 ');
  });

  it.each<QuestionType>(['single', 'multiple', 'judge', 'fill', 'short'])('%s 保留答案、标签与评分规则，提交期间阻止重复和关闭', async (type) => {
    const answer = type === 'fill' ? ['第一空', '第二空'] : type === 'short' ? ['参考答案'] : type === 'multiple' ? [0, 1] : [0];
    const options = type === 'fill' || type === 'short' ? [] : type === 'judge' ? ['正确', '错误'] : ['选项一', '选项二'];
    const rubric = type === 'short' ? [{ score: 10, label: '完整', description: '要点齐全' }, { score: 5, label: '部分', description: '部分要点' }] : [];
    const question = { id: 'q1', bankId: 'bank1', type, stem: '原有题干 ___', options, answer, defaultScore: 10, analysis: '原有解析', difficulty: 'medium', tags: ['历史知识点'], rubric } as Question;
    let fail!: (reason: Error) => void;
    api.update.mockReturnValueOnce(new Promise((_, reject) => { fail = reject; })).mockResolvedValueOnce({});
    wrapper = mount(QuestionFormDialog, { props: { visible: false, bankId: 'bank1', question }, attachTo: document.body, global: { plugins: [ElementPlus] } });
    await wrapper.setProps({ visible: true }); await flushPromises();
    const save = () => wrapper.findAllComponents(ElButton).find(b => b.text() === '保存')!;
    save().vm.$emit('click', new MouseEvent('click')); save().vm.$emit('click', new MouseEvent('click')); await flushPromises();
    expect(api.update).toHaveBeenCalledTimes(1);
    expect(api.update).toHaveBeenCalledWith('q1', { bankId: 'bank1', type, stem: question.stem, options, answer, defaultScore: 10, analysis: '原有解析', difficulty: 'medium', tags: ['历史知识点'], rubric });
    expect(wrapper.getComponent(ElDrawer).props()).toMatchObject({ showClose: false, closeOnPressEscape: false, closeOnClickModal: false });
    fail(new Error('offline')); await flushPromises();
    expect(wrapper.getComponent(ElDrawer).props('modelValue')).toBe(true);
    save().vm.$emit('click', new MouseEvent('click')); await flushPromises();
    expect(api.update).toHaveBeenCalledTimes(2);
    expect(wrapper.emitted('update:visible')?.at(-1)).toEqual([false]);
  });
});
