import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import ElementPlus, { ElMessageBox } from 'element-plus';
import Profile from './PracticeProfilePage.vue';
import Report from './PracticeReportPage.vue';

const api = vi.hoisted(() => ({ summary: vi.fn(), wrong: vi.fn(), trend: vi.fn(), subjects: vi.fn(), banks: vi.fn(), daily: vi.fn(), load: vi.fn(), logout: vi.fn(), reset: vi.fn(), push: vi.fn(), replace: vi.fn(), config: { reportEnabled: true, wrongBookEnabled: true } }));
vi.mock('@/api/practice', () => ({ reportSummary: api.summary, wrongBook: api.wrong, reportTrend: api.trend, reportSubjects: api.subjects, reportBanks: api.banks, daily: api.daily }));
vi.mock('@/stores/practiceAuth', () => ({ usePracticeAuthStore: () => ({ currentUser: { name: '完整姓名ABCDEFGHIJKLMNOPQRSTUVWXYZ', username: 'learner', role: 'examinee', departmentName: '完整科室名称ABCDEFGHIJKLMNOPQRSTUVWXYZ' }, logout: api.logout }) }));
vi.mock('@/stores/practiceConfig', () => ({ usePracticeConfigStore: () => ({ config: api.config, load: api.load, reset: api.reset }) }));
vi.mock('vue-router', () => ({ useRouter: () => ({ push: api.push, replace: api.replace }) }));
let wrapper: VueWrapper;
function render(component: typeof Profile | typeof Report) { wrapper = mount(component, { attachTo: document.body, global: { plugins: [ElementPlus], stubs: { PracticeLayout: { template: '<main><slot /></main>' }, PracticeTrendChart: true } } }); }
function retry(text: string) { return wrapper.findAllComponents({ name: 'RequestError' }).find(c => c.props('text').includes(text))!.vm.$emit('retry'); }
beforeEach(() => {
  vi.resetAllMocks(); api.config.reportEnabled = true; api.config.wrongBookEnabled = true;
  api.load.mockResolvedValue(undefined); api.summary.mockResolvedValue({ doneTotal: 80, correctTotal: 60, wrongTotal: 20, accuracy: 75, streakDays: 5 });
  api.wrong.mockResolvedValue({ list: [], total: 7 }); api.trend.mockResolvedValue([]); api.subjects.mockResolvedValue([]); api.banks.mockResolvedValue([]); api.daily.mockResolvedValue({ enabled: false });
});
afterEach(() => { wrapper?.unmount(); vi.restoreAllMocks(); document.body.innerHTML = ''; });

describe('学习报告与我的练题的独立状态', () => {
  it('累计统计失败保留独立错题数，重试后恢复正确率', async () => {
    api.summary.mockRejectedValueOnce(new Error('offline'));
    render(Profile); await flushPromises();
    expect(wrapper.findAll('.pf__num').map(n => n.text())).toEqual(['—', '—', '—', '7']);
    expect(wrapper.find('.pf__badge').exists()).toBe(false);
    retry('练题统计'); await flushPromises();
    expect(wrapper.findAll('.pf__num').map(n => n.text())).toEqual(['80', '60', '75%', '7']);
    expect(wrapper.find('.pf__badge').text()).toBe('连续 5 天');
  });

  it('错题数失败不隐藏累计统计，关闭功能时不发请求且不显示零', async () => {
    api.wrong.mockRejectedValueOnce(new Error('offline'));
    render(Profile); await flushPromises();
    expect(wrapper.findAll('.pf__num').map(n => n.text())).toEqual(['80', '60', '75%', '—']);
    wrapper.unmount(); api.config.reportEnabled = false; api.config.wrongBookEnabled = false; api.summary.mockClear(); api.wrong.mockClear();
    render(Profile); await flushPromises();
    expect(api.summary).not.toHaveBeenCalled(); expect(api.wrong).not.toHaveBeenCalled();
    expect(wrapper.findAll('.pf__num').every(n => n.text() === '—')).toBe(true);
    expect(wrapper.text()).toContain('统计未开放');
  });

  it('退出确认防重复，取消后保留原会话与学习入口', async () => {
    let cancel!: (e: Error) => void;
    const confirm = vi.spyOn(ElMessageBox, 'confirm').mockImplementationOnce(() => new Promise((_, reject) => { cancel = reject; }));
    render(Profile); await flushPromises();
    const logout = wrapper.findAll('button').find(b => b.text().includes('退出登录'))!;
    await logout.trigger('click'); await logout.trigger('click');
    expect(confirm).toHaveBeenCalledTimes(1);
    cancel(new Error('cancel')); await flushPromises();
    expect(api.logout).not.toHaveBeenCalled(); expect(api.replace).not.toHaveBeenCalled();
  });

  it('趋势首次失败仅影响趋势，重试使用原区间且不重读总览', async () => {
    api.trend.mockRejectedValueOnce(new Error('offline'));
    render(Report); await flushPromises();
    expect(wrapper.findAll('.rpt__num').map(n => n.text())).toEqual(['80', '60', '75%', '20']);
    expect(wrapper.text()).toContain('练题趋势加载失败');
    expect(wrapper.text()).not.toContain('学习报告加载失败');
    retry('练题趋势'); await flushPromises();
    expect(api.trend).toHaveBeenLastCalledWith(7); expect(api.summary).toHaveBeenCalledTimes(1);
    expect(wrapper.text()).not.toContain('练题趋势加载失败');
  });

  it('科目、题库、今日状态失败分别呈现，单项重试保留其他成功数据', async () => {
    api.subjects.mockRejectedValueOnce(new Error('offline')); api.banks.mockRejectedValueOnce(new Error('offline')); api.daily.mockRejectedValueOnce(new Error('offline'));
    render(Report); await flushPromises();
    expect(wrapper.text()).toContain('科目掌握度加载失败'); expect(wrapper.text()).toContain('题库进度加载失败'); expect(wrapper.text()).toContain('今日一练状态加载失败');
    expect(wrapper.text()).not.toContain('暂无可练习的题库');
    retry('题库进度'); await flushPromises();
    expect(wrapper.text()).toContain('暂无可练习的题库'); expect(api.summary).toHaveBeenCalledTimes(1); expect(api.subjects).toHaveBeenCalledTimes(1);
  });

  it('30天趋势失败保留选择区间，重试仍请求30天', async () => {
    render(Report); await flushPromises(); api.trend.mockRejectedValueOnce(new Error('offline'));
    await wrapper.findAll('button').find(b => b.text() === '近 30 天')!.trigger('click'); await flushPromises();
    retry('练题趋势'); await flushPromises();
    expect(api.trend.mock.calls.map(c => c[0])).toEqual([7, 30, 30]);
  });
});
