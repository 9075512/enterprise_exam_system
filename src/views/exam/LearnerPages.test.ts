import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import ElementPlus from 'element-plus';
import ExamHome from './ExamHomePage.vue';
import MyExam from './MyExamPage.vue';
import MyScore from './MyScorePage.vue';
import MyRetake from './MyRetakePage.vue';
import PracticeHome from '../practice/PracticeHomePage.vue';
import WrongBook from '../practice/PracticeWrongBookPage.vue';
import Favorites from '../practice/PracticeFavoritesPage.vue';
import Report from '../practice/PracticeReportPage.vue';
import Profile from '../practice/PracticeProfilePage.vue';

const api = vi.hoisted(() => ({ home: vi.fn(), exams: vi.fn(), records: vi.fn(), appeals: vi.fn(), applyAppeal: vi.fn(), retakes: vi.fn(), applyRetake: vi.fn(), notifications: vi.fn(), banks: vi.fn(), tree: vi.fn(), wrong: vi.fn(), favorites: vi.fn(), remove: vi.fn(), daily: vi.fn(), summary: vi.fn(), trend: vi.fn(), subjects: vi.fn(), bankStats: vi.fn(), tickets: vi.fn(), ticketsPdf: vi.fn() }));
vi.mock('vue-router', () => ({ useRouter: () => ({ push: vi.fn() }), useRoute: () => ({ path: '/exam/practice', query: {} }) }));
vi.mock('@/api/home', () => ({ getSummary: api.home }));
vi.mock('@/api/exams', () => ({ my: api.exams }));
vi.mock('@/api/records', () => ({ my: api.records }));
vi.mock('@/api/appeals', () => ({ my: api.appeals, apply: api.applyAppeal }));
vi.mock('@/api/retakes', () => ({ listMyRetakes: api.retakes, applyRetake: api.applyRetake }));
vi.mock('@/api/coreFeatures', () => ({ participantsApi: { tickets: api.tickets, ticketsPdf: api.ticketsPdf } }));
vi.mock('@/api/notifications', () => ({ listNotifications: api.notifications }));
vi.mock('@/api/practice', () => ({ listBanks: api.banks, bankTree: api.tree, wrongBook: api.wrong, favorites: api.favorites, removeFavorite: api.remove, daily: api.daily, reportSummary: api.summary, reportTrend: api.trend, reportSubjects: api.subjects, reportBanks: api.bankStats }));
vi.mock('@/stores/auth', () => ({ useAuthStore: () => ({ currentUser: { name: '考生甲', role: 'examinee' } }) }));
vi.mock('@/stores/permissions', () => ({ usePermissionsStore: () => ({ myMenus: ['home', 'my-exams', 'my-scores', 'my-retakes', 'exam-messages', 'practice'] }) }));
vi.mock('@/stores/practiceAuth', () => ({ usePracticeAuthStore: () => ({ currentUser: { name: '考生甲', role: 'examinee' } }) }));
vi.mock('@/stores/settings', () => ({ useSettingsStore: () => ({ ready: true, load: vi.fn(), settings: { defaultPageSize: 20, appealEnabled: true, appealWindowDays: 7, cheatCountThreshold: 5, cheatSecondsThreshold: 60, retakeScorePolicy: 'highest' } }) }));
vi.mock('@/stores/practiceConfig', () => ({ usePracticeConfigStore: () => ({ load: vi.fn(), config: { wrongBookEnabled: true, favoriteEnabled: true, reportEnabled: true, achievementEnabled: false, defaultPracticeMode: 'sequence', sessionMaxCount: 50, sessionMinCount: 1 } }) }));
let wrapper: VueWrapper;
function render(component: Parameters<typeof mount>[0]) {
  wrapper = mount(component, { attachTo: document.body, global: { plugins: [ElementPlus], stubs: { ContentBoard: true, PracticeLayout: { template: '<main><slot /></main>' }, PracticeTrendChart: true } } });
}
function button(name: string) { return wrapper.findAll('button').find(b => b.text().trim() === name)!; }
const page = (list: unknown[] = [], total = list.length) => ({ list, total, page: 1, pageSize: 20 });
beforeEach(() => {
  vi.resetAllMocks(); api.exams.mockResolvedValue([]); api.records.mockResolvedValue(page()); api.appeals.mockResolvedValue(page()); api.retakes.mockResolvedValue(page()); api.notifications.mockResolvedValue(page());
  api.home.mockResolvedValue({ stats: { pending: 0, ongoing: 0, submitted: 0, avgScore: 0, passRate: 0, passLine: 60 }, todos: [], trend: [], shortcuts: [], recommendedBanks: [] });
  api.banks.mockResolvedValue([]); api.tree.mockResolvedValue([]); api.wrong.mockResolvedValue(page()); api.favorites.mockResolvedValue(page()); api.daily.mockResolvedValue({ enabled: false });
  api.summary.mockResolvedValue({ doneTotal: 0, correctTotal: 0, wrongTotal: 0, accuracy: 0, streakDays: 0 }); api.trend.mockResolvedValue([]); api.subjects.mockResolvedValue([]); api.bankStats.mockResolvedValue([]);
});
afterEach(() => { wrapper?.unmount(); document.body.innerHTML = ''; });

describe('考生和练题页面的真实数据与错误恢复', () => {
  it('考生首页统计或考试失败不显示零分与假空态，重试恢复', async () => {
    api.home.mockRejectedValueOnce(new Error('offline')); api.exams.mockRejectedValueOnce(new Error('offline'));
    render(ExamHome); await flushPromises();
    expect(wrapper.text()).toContain('首页统计加载失败'); expect(wrapper.text()).toContain('我的考试加载失败');
    expect(wrapper.findAll('.stat-card__value').every(card => card.text().includes('—'))).toBe(true);
    expect(wrapper.text()).not.toContain('当前没有待办事项');
    await button('重新加载').trigger('click'); await flushPromises();
    expect(wrapper.text()).not.toContain('首页统计加载失败');
    expect(wrapper.findAll('.stat-card__value')[3]!.text()).toContain('—');
  });
  it('首页趋势保留超过百分制的分数，并显示各场真实及格线', async () => {
    api.home.mockResolvedValue({ stats: { pending: 0, ongoing: 0, submitted: 2, avgScore: 120, passRate: 50 }, todos: [], shortcuts: [], recommendedBanks: [], trend: [
      { recordId: 'r1', score: 180, passScore: 120, passed: true, submittedAt: '2026-10-18T00:00:00Z' },
      { recordId: 'r2', score: 60, passScore: 80, passed: false, submittedAt: '2026-10-19T00:00:00Z' },
    ] });
    render(ExamHome); await flushPromises();
    expect(wrapper.text()).toContain('180'); expect(wrapper.text()).toContain('各场考试及格线'); expect(wrapper.text()).toContain('摘要最近 2 份');
    expect(wrapper.findAll('.exam-home__chart-dot').map(dot => Number(dot.attributes('cy'))).every(y => y >= 24 && y <= 126)).toBe(true);
  });
  it('我的考试加载失败显示重试，待阅卷和免考保持原有含义', async () => {
    api.exams.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(['pending_review', null].map((recordStatus, i) => ({ id: String(i), name: i ? '免考场次' : '待阅场次', recordStatus, exempt: i === 1, startTime: '2026-01-01T00:00:00Z', endTime: '2099-01-01T00:00:00Z', maxAttempts: 1, attemptsUsed: 1, extraAttempts: 0, passScore: 60 })));
    render(MyExam); await flushPromises(); expect(wrapper.text()).toContain('我的考试加载失败'); expect(wrapper.text()).not.toContain('暂无分配');
    await button('重新加载').trigger('click'); await flushPromises();
    expect(wrapper.text()).toContain('待阅卷'); expect(wrapper.text()).toContain('已免考');
    expect(wrapper.findAll('.my-exam__item').find(c => c.text().includes('免考场次'))!.find('button').attributes('disabled')).toBeDefined();
  });
  it('考生从我的考试先打开本人准考证预览，不直接触发下载', async () => {
    api.exams.mockResolvedValue([{ id: 'e1', name: '安全考试', startTime: '2026-01-01T00:00:00Z', endTime: '2099-01-01T00:00:00Z', maxAttempts: 1, attemptsUsed: 0, extraAttempts: 0, passScore: 60 }]);
    api.tickets.mockResolvedValue([{ userId: 'u1', examId: 'e1', examName: '安全考试', userName: '考生甲', username: 'student-1', admissionNo: 'NO-001', departmentName: '安全科', startTime: '2026-01-01T00:00:00Z', endTime: '2099-01-01T00:00:00Z', durationMinutes: 60, examMode: 'closed' }]);
    render(MyExam); await flushPromises();
    expect(api.tickets).not.toHaveBeenCalled();
    await button('准考证预览').trigger('click'); await flushPromises();
    expect(api.tickets).toHaveBeenCalledWith('e1'); expect(api.ticketsPdf).not.toHaveBeenCalled();
    expect(document.querySelector('.admission-ticket')?.textContent).toContain('考生甲');
    expect(document.querySelector('.admission-preview__actions')?.textContent).toContain('下载准考证 PDF');
    expect(document.querySelector('.admission-preview__toolbar')).toBeNull();
  });
  it('成绩统计明确样本范围，考试资料失败仍采用答卷冻结及格线', async () => {
    api.exams.mockRejectedValue(new Error('offline'));
    api.records.mockResolvedValue(page([{ id: 'r1', examId: 'e1', score: 40, passScore: 60, status: 'submitted', submittedAt: '2026-10-19T00:00:00Z', attemptNo: 1 }], 150));
    render(MyScore); await flushPromises();
    expect(wrapper.text()).toContain('1 / 150'); expect(wrapper.text()).toContain('未及格'); expect(wrapper.text()).toContain('及格线 60');
  });
  it('成绩与复核加载失败显示未知并阻止未知状态重复申请', async () => {
    api.records.mockRejectedValue(new Error('offline')); api.appeals.mockRejectedValue(new Error('offline'));
    render(MyScore); await flushPromises();
    expect(wrapper.text()).toContain('成绩统计加载失败'); expect(wrapper.text()).toContain('成绩列表加载失败'); expect(wrapper.text()).toContain('复核记录加载失败');
    expect(wrapper.text()).not.toContain('还没有成绩记录'); expect(wrapper.text()).not.toContain('暂无复核记录');
  });
  it('补考失败不冒充无申请，规则保持当前最高分口径', async () => {
    api.retakes.mockRejectedValue(new Error('offline')); api.exams.mockRejectedValue(new Error('offline'));
    render(MyRetake); await flushPromises();
    expect(wrapper.text()).toContain('补考申请加载失败'); expect(wrapper.text()).toContain('可申请考试加载失败'); expect(wrapper.text()).toContain('最高分');
    expect(button('提交补考申请').attributes('disabled')).toBeDefined();
  });
  it('练题首页题库失败可重试，辅助数量失败保持未知', async () => {
    api.tree.mockRejectedValueOnce(new Error('offline')); api.wrong.mockRejectedValue(new Error('offline'));
    render(PracticeHome); await flushPromises(); expect(wrapper.text()).toContain('可练题库加载失败'); expect(wrapper.text()).not.toContain('暂无可练习的题库');
    await button('重新加载').trigger('click'); await flushPromises(); expect(wrapper.text()).toContain('错题数量暂不可用');
  });
  it('错题下一页失败保留当前题目，并提供原页重试', async () => {
    api.wrong.mockResolvedValueOnce(page([{ id: 'q1', bankId: 'b1', type: 'judge', stem: '保留原错题', wrongCount: 2 }], 21)).mockRejectedValueOnce(new Error('offline'));
    render(WrongBook); await flushPromises(); await button('加载更多').trigger('click'); await flushPromises();
    expect(wrapper.text()).toContain('保留原错题'); expect(wrapper.text()).toContain('加载下一页失败'); expect(button('重试加载更多').exists()).toBe(true);
  });
  it('取消收藏失败不改列表，等待期间不发送第二次删除', async () => {
    api.favorites.mockResolvedValue(page([{ id: 'q1', bankId: 'b1', type: 'judge', stem: '原收藏题', favoritedAt: '2026-10-19' }]));
    let reject!: (error: Error) => void; api.remove.mockReturnValue(new Promise((_, fail) => { reject = fail; }));
    render(Favorites); await flushPromises(); await button('取消收藏').trigger('click'); await flushPromises();
    expect(wrapper.text()).toContain('原收藏题'); expect(api.remove).toHaveBeenCalledTimes(1);
    reject(new Error('offline')); await flushPromises(); expect(wrapper.text()).toContain('原收藏题'); expect(button('取消收藏').attributes('disabled')).toBeUndefined();
  });
  it('学习报告失败不显示空数据，重试后无样本正确率仍为未知', async () => {
    api.summary.mockRejectedValueOnce(new Error('offline')); render(Report); await flushPromises();
    expect(wrapper.text()).toContain('学习报告加载失败'); expect(wrapper.findAll('.rpt__num').every(n => n.text() === '—')).toBe(true);
    await button('重新加载').trigger('click'); await flushPromises(); expect(wrapper.findAll('.rpt__num')[2]!.text()).toBe('—');
  });
  it('练题个人统计请求失败，保留账号与退出入口，统计显示未知', async () => {
    api.summary.mockRejectedValue(new Error('offline')); render(Profile); await flushPromises();
    expect(wrapper.text()).toContain('练题统计加载失败'); expect(wrapper.findAll('.pf__num').map(n => n.text())).toEqual(['—', '—', '—', '0']); expect(wrapper.text()).toContain('退出登录');
  });
});
