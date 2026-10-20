import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, shallowMount } from '@vue/test-utils';
import PracticeSessionPage from './PracticeSessionPage.vue';
import QuestionCard from '@/views/exam/components/QuestionCard.vue';
import PracticeLoading from '@/components/common/PracticeLoading.vue';
import QuestionFeedbackDialog from './components/QuestionFeedbackDialog.vue';

const mocks = vi.hoisted(() => ({
  route: { name: 'practice-session', meta: {} as Record<string, unknown>, params: { bankId: 'bank-1' }, query: {} as Record<string, string> },
  api: { createSession: vi.fn(), dailySession: vi.fn(), favoritesReans: vi.fn(), wrongReans: vi.fn(),
    questionsByIds: vi.fn(), favoriteIds: vi.fn(), daily: vi.fn(), check: vi.fn(), saveProgress: vi.fn() },
}));
vi.mock('@/api/practice', () => mocks.api);
vi.mock('vue-router', () => ({ useRoute: () => mocks.route, useRouter: () => ({ push: vi.fn() }), onBeforeRouteLeave: vi.fn() }));
vi.mock('@/stores/practiceConfig', () => ({ usePracticeConfigStore: () => ({
  load: vi.fn().mockResolvedValue(undefined), config: { favoriteEnabled: true, defaultPracticeMode: 'sequence' },
}) }));

let wrapper: ReturnType<typeof shallowMount>;
function mountPage() {
  wrapper = shallowMount(PracticeSessionPage, { global: { stubs: {
    PracticeLayout: { template: '<div><slot /></div>' },
    ElButton: { props: ['disabled', 'loading'], template: '<button :disabled="disabled"><slot /></button>' },
    ElAlert: { props: ['title'], template: '<p>{{ title }}</p>' },
    ElDrawer: { props: ['modelValue'], template: '<div v-if="modelValue"><slot /></div>' },
  } } });
  return wrapper;
}
async function answer() {
  wrapper.getComponent(QuestionCard).vm.$emit('update:modelValue', [0]);
  await flushPromises();
  await wrapper.get('.session__submit').trigger('click');
  await flushPromises();
}
beforeEach(() => {
  Object.values(mocks.api).forEach(fn => fn.mockReset());
  mocks.route.name = 'practice-session'; mocks.route.params = { bankId: 'bank-1' }; mocks.route.query = {}; mocks.route.meta = {};
  const session = { sessionToken: 'session', questionIds: ['q1'], total: 1 };
  for (const key of ['createSession', 'dailySession', 'favoritesReans', 'wrongReans'] as const) mocks.api[key].mockResolvedValue(session);
  mocks.api.questionsByIds.mockResolvedValue([{ id: 'q1', bankId: 'bank-1', type: 'judge', stem: '题目', options: ['正确', '错误'], subject: '' }]);
  mocks.api.favoriteIds.mockResolvedValue([]);
  mocks.api.daily.mockResolvedValue({ enabled: true, doneCount: 0, total: 1 });
  mocks.api.check.mockResolvedValue({ correct: true, correctAnswer: [0], analysis: '', type: 'judge' });
  mocks.api.saveProgress.mockResolvedValue({});
});
afterEach(() => {
  wrapper?.unmount();
  vi.restoreAllMocks();
});

describe('练题来源与异步反馈', () => {
  it('答题卡跳题保留未提交选择，完成时返回遗漏题，全部判分后才生成小结', async () => {
    vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
    mocks.api.createSession.mockResolvedValue({ sessionToken: 'session', questionIds: ['q1', 'q2'], total: 2 });
    mocks.api.questionsByIds.mockResolvedValue(['q1', 'q2'].map(id => ({ id, bankId: 'bank-1', type: 'judge', stem: '题目', options: ['正确', '错误'], subject: '' })));
    mountPage(); await flushPromises();
    wrapper.getComponent(QuestionCard).vm.$emit('update:modelValue', [1]); await flushPromises();
    await wrapper.findAll('button').find(b => b.text() === '答题卡')!.trigger('click');
    await wrapper.findAll('.session__sheet-cell')[1]!.trigger('click');
    await answer(); await wrapper.get('.session__next').trigger('click'); await flushPromises();
    expect(wrapper.find('.summary').exists()).toBe(false);
    expect(wrapper.getComponent(QuestionCard).props('question').id).toBe('q1');
    expect(wrapper.getComponent(QuestionCard).props('modelValue')).toEqual([1]);
    await wrapper.get('.session__submit').trigger('click'); await flushPromises();
    await wrapper.get('.session__next').trigger('click'); await flushPromises();
    expect(wrapper.getComponent(QuestionCard).props('modelValue')).toEqual([0]);
    await wrapper.get('.session__next').trigger('click'); await flushPromises();
    expect(wrapper.find('.summary').exists()).toBe(true);
    expect(mocks.api.check).toHaveBeenCalledTimes(2);
  });
  it('重做不改变首次统计，答错后重做正确，小结仍按首次答错计数', async () => {
    mocks.api.check.mockResolvedValueOnce({ correct: false, correctAnswer: [1], analysis: '', type: 'judge' }).mockResolvedValueOnce({ correct: true, correctAnswer: [0], analysis: '', type: 'judge' });
    mountPage(); await flushPromises(); await answer();
    await wrapper.get('.session__redo').trigger('click'); await answer();
    await wrapper.get('.session__next').trigger('click'); await flushPromises();
    expect(wrapper.get('.summary__stat--ok .summary__num').text()).toBe('0');
    expect(wrapper.get('.summary__stat--rate .summary__num').text()).toBe('0%');
  });
  it.each(['daily', 'favorite', 'wrong'])('%s 会话判分后不向占位题库保存进度', async source => {
    mocks.route.params.bankId = source;
    if (source === 'wrong') mocks.route.name = 'practice-reans';
    else mocks.route.query.source = source;
    mountPage(); await flushPromises(); await answer();
    expect(mocks.api.check).toHaveBeenCalledWith({ sessionToken: 'session', questionId: 'q1', answer: [0] });
    expect(mocks.api.saveProgress).not.toHaveBeenCalled();
    if (source === 'wrong') expect(mocks.api.wrongReans).toHaveBeenCalledWith(undefined);
    expect(wrapper.find('.session__next').exists()).toBe(true);
  });
  it('普通题库练习仍保存进度，后台失败不清除判分结果', async () => {
    mocks.api.saveProgress.mockRejectedValue(new Error('network'));
    mountPage(); await flushPromises(); await answer();
    expect(mocks.api.saveProgress).toHaveBeenCalledWith({ bankId: 'bank-1', lastQuestionId: 'q1' }, { suppressErrorToast: true });
    expect(wrapper.find('.session__next').exists()).toBe(true);
  });
  it('收藏态和今日统计的慢请求不阻塞题目展示', async () => {
    mocks.route.query.source = 'daily';
    mocks.api.favoriteIds.mockReturnValue(new Promise(() => {}));
    mocks.api.daily.mockReturnValue(new Promise(() => {}));
    mountPage(); await flushPromises();
    expect(wrapper.findComponent(QuestionCard).exists()).toBe(true);
    expect(wrapper.findComponent(PracticeLoading).exists()).toBe(false);
    expect(wrapper.get('.session__fav').attributes('disabled')).toBeDefined();
  });
  it('提交中锁定作答并防止重复判分', async () => {
    let resolve!: (value: unknown) => void;
    mocks.api.check.mockReturnValue(new Promise(r => { resolve = r; }));
    mountPage(); await flushPromises(); await answer();
    expect(wrapper.get('.session__submit').text()).toBe('正在判分…');
    await wrapper.get('.session__submit').trigger('click');
    wrapper.getComponent(QuestionCard).vm.$emit('update:modelValue', [1]);
    await flushPromises();
    expect(mocks.api.check).toHaveBeenCalledTimes(1);
    expect(wrapper.getComponent(QuestionCard).props('modelValue')).toEqual([0]);
    resolve({ correct: true, correctAnswer: [0] }); await flushPromises();
    expect(wrapper.find('.session__next').exists()).toBe(true);
  });
  it('判分失败在本题保留选择并提示，重试成功清除失败状态', async () => {
    mocks.api.check.mockRejectedValueOnce(new Error('offline'));
    mountPage(); await flushPromises(); await answer();
    expect(wrapper.text()).toContain('本题判分未成功，已保留你的选择');
    expect(wrapper.getComponent(QuestionCard).props('modelValue')).toEqual([0]);
    expect(wrapper.find('.summary').exists()).toBe(false);
    await wrapper.get('.session__submit').trigger('click'); await flushPromises();
    expect(mocks.api.check).toHaveBeenCalledTimes(2);
    expect(wrapper.text()).not.toContain('本题判分未成功');
    expect(wrapper.find('.session__next').exists()).toBe(true);
  });
  it('纠错打开时冻结原题上下文，关闭前不能重做或完成练习', async () => {
    mocks.api.createSession.mockResolvedValue({ id: 's1', sessionToken: 'session', questionIds: ['q1'], total: 1 });
    mountPage(); await flushPromises(); await answer();
    await wrapper.findAll('button').find(b => b.text() === '题目纠错')!.trigger('click');
    expect(wrapper.getComponent(QuestionFeedbackDialog).props()).toMatchObject({ visible: true, questionId: 'q1', sessionId: 's1', questionNumber: 1, stem: '题目' });
    expect(wrapper.get('.session__redo').attributes('disabled')).toBeDefined();
    expect(wrapper.get('.session__next').attributes('disabled')).toBeDefined();
    wrapper.getComponent(QuestionFeedbackDialog).vm.$emit('update:visible', false); await flushPromises();
    expect(wrapper.get('.session__next').attributes('disabled')).toBeUndefined();
  });
  it('取题失败后退出占位并允许重新加载', async () => {
    mocks.api.questionsByIds.mockRejectedValueOnce(new Error('取题失败'));
    mountPage(); await flushPromises();
    expect(wrapper.findComponent(PracticeLoading).exists()).toBe(false);
    expect(wrapper.text()).toContain('取题失败');
    await wrapper.get('.session__state button').trigger('click'); await flushPromises();
    expect(wrapper.findComponent(QuestionCard).exists()).toBe(true);
  });
  it.each(['next', 'finish'])('%s 后重置 PC 内容区和移动窗口的滚动位置', async action => {
    if (action === 'next') {
      mocks.api.createSession.mockResolvedValue({ sessionToken: 'session', questionIds: ['q1', 'q2'], total: 2 });
      mocks.api.questionsByIds.mockResolvedValue(['q1', 'q2'].map(id => ({
        id, bankId: 'bank-1', type: 'judge', stem: '题目', options: ['正确', '错误'], subject: '',
      })));
    }
    const content = document.createElement('main');
    content.className = 'layout__content';
    content.scrollTo = vi.fn();
    document.body.appendChild(content);
    const scrollWindow = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
    try {
      mountPage(); await flushPromises(); await answer();
      await wrapper.get('.session__next').trigger('click'); await flushPromises();
      expect(content.scrollTo).toHaveBeenCalledWith({ top: 0, behavior: 'smooth' });
      expect(scrollWindow).toHaveBeenCalledWith({ top: 0, behavior: 'smooth' });
      if (action === 'next') expect(wrapper.getComponent(QuestionCard).props('question').id).toBe('q2');
      else expect(wrapper.find('.summary').exists()).toBe(true);
    } finally {
      content.remove();
    }
  });
});
