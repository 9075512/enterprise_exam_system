import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, shallowMount } from '@vue/test-utils';
import PracticeHomePage from './PracticeHomePage.vue';
import PracticeOptionModal from './components/PracticeOptionModal.vue';
const mocks = vi.hoisted(() => ({
  config: { wrongBookEnabled: true, favoriteEnabled: true, reportEnabled: true, achievementEnabled: true, dailyEnabled: true, defaultPracticeMode: 'sequence', sessionMinCount: 1, sessionMaxCount: 100 },
  push: vi.fn(), api: { listBanks: vi.fn(), bankTree: vi.fn(), wrongBook: vi.fn(), favorites: vi.fn(), daily: vi.fn(), achievements: vi.fn(), reportBanks: vi.fn() },
}));
vi.mock('vue-router', () => ({ useRouter: () => ({ push: mocks.push }) }));
vi.mock('@/stores/practiceAuth', () => ({ usePracticeAuthStore: () => ({ currentUser: { name: '考生甲' } }) }));
vi.mock('@/stores/practiceConfig', () => ({ usePracticeConfigStore: () => ({ config: mocks.config, load: vi.fn().mockResolvedValue(undefined) }) }));
vi.mock('@/api/practice', () => mocks.api);
let wrapper: ReturnType<typeof shallowMount>;
function render() { wrapper = shallowMount(PracticeHomePage, { global: { stubs: { PracticeLayout: { template: '<div><slot /></div>' }, ElDialog: { props: ['modelValue'], template: '<div v-if="modelValue"><slot /><slot name="footer" /></div>' }, ElButton: { template: '<button><slot /></button>' }, ElIcon: { template: '<i><slot /></i>' } } } }); }
beforeEach(() => {
  vi.resetAllMocks(); Object.assign(mocks.config, { wrongBookEnabled: true, favoriteEnabled: true, reportEnabled: true, achievementEnabled: true });
  mocks.api.listBanks.mockResolvedValue([{ id: 'b1', name: '获准题库', questionCount: 4 }, { id: 'b2', name: '树中不可见题库', questionCount: 10 }]);
  mocks.api.bankTree.mockResolvedValue([{ id: 's1', name: '安全知识', isLeaf: false, children: [{ id: 'b1', name: '获准题库', isLeaf: true, questionCount: 4, children: [] }] }]);
  mocks.api.wrongBook.mockResolvedValue({ total: 5 }); mocks.api.favorites.mockResolvedValue({ total: 0 });
  mocks.api.daily.mockResolvedValue({ enabled: true, total: 10, doneCount: 2, completed: false, streakDays: 1 });
  mocks.api.reportBanks.mockResolvedValue([{ bankId: 'b1', totalCount: 4, doneCount: 1 }]);
  mocks.api.achievements.mockResolvedValue({ enabled: true, streakDays: 1, bestStreak: 2, answeredTotal: 4, accuracy: 50, unlockedCount: 1, badges: [] });
});
afterEach(() => wrapper?.unmount());
describe('按设计稿重排后的练题首页', () => {
  it('科目卡片保留服务端目录范围、真实进度与原有选题参数', async () => {
    render(); await flushPromises();
    expect(wrapper.text()).toContain('安全知识'); expect(wrapper.findAll('.home__subject')).toHaveLength(1);
    expect(wrapper.text()).not.toContain('树中不可见题库'); expect(wrapper.text()).toContain('已练 1 题');
    expect(wrapper.get('[role="progressbar"]').attributes('aria-valuenow')).toBe('25');
    await wrapper.get('.home__subject').trigger('click');
    const modal = wrapper.getComponent(PracticeOptionModal);
    expect(modal.props('visible')).toBe(true); expect(modal.props('bank').id).toBe('b1');
    modal.vm.$emit('start', { bankId: 'b1', mode: 'random', count: 20, types: ['single', 'multiple'] });
    expect(mocks.push).toHaveBeenCalledWith({ name: 'practice-session', params: { bankId: 'b1' }, query: { mode: 'random', count: '20', types: 'single,multiple' } });
  });
  it('功能关闭时移除对应快捷入口，也不请求被关闭模块的数据', async () => {
    Object.assign(mocks.config, { wrongBookEnabled: false, favoriteEnabled: false, reportEnabled: false, achievementEnabled: false });
    render(); await flushPromises(); expect(wrapper.find('.home__shortcuts').exists()).toBe(false);
    for (const name of ['wrongBook', 'favorites', 'reportBanks', 'achievements'] as const) expect(mocks.api[name]).not.toHaveBeenCalled();
    expect(wrapper.find('[role="progressbar"]').exists()).toBe(false);
  });
  it('辅助数据失败不编造进度与计数，成就可在弹窗中重试', async () => {
    mocks.api.reportBanks.mockRejectedValue(new Error('offline')); mocks.api.wrongBook.mockRejectedValue(new Error('offline'));
    mocks.api.achievements.mockRejectedValueOnce(new Error('offline'));
    render(); await flushPromises(); expect(wrapper.text()).toContain('错题数量暂不可用');
    expect(wrapper.find('[role="progressbar"]').exists()).toBe(false); expect(wrapper.text()).not.toContain('已练 0 题');
    await wrapper.findAll('.home__shortcuts button').find(b => b.text().includes('成就徽章'))!.trigger('click');
    const error = wrapper.findComponent({ name: 'RequestError' }); expect(error.exists()).toBe(true);
    error.vm.$emit('retry'); await flushPromises(); expect(wrapper.text()).toContain('天连续打卡');
  });
  it('完成每日一练后禁止重复开始，四个学习入口仍可用', async () => {
    mocks.api.daily.mockResolvedValue({ enabled: true, total: 10, doneCount: 10, completed: true });
    render(); await flushPromises(); expect(wrapper.get('.home__daily-start').attributes('disabled')).toBeDefined();
    expect(wrapper.findAll('.home__shortcuts button')).toHaveLength(4);
  });
});
