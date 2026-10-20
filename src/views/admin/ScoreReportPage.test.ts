import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { reactive } from 'vue';
import ElementPlus from 'element-plus';
import ScoreReportPage from './ScoreReportPage.vue';
const api = vi.hoisted(() => ({ exams: vi.fn(), users: vi.fn(), departments: vi.fn(), report: vi.fn(), records: vi.fn(), cheats: vi.fn(), rules: vi.fn() }));
vi.mock('@/api/exams', () => ({ list: api.exams }));
vi.mock('@/api/users', () => ({ list: api.users }));
vi.mock('@/api/departments', () => ({ list: api.departments }));
vi.mock('@/api/reports', () => ({ examReport: api.report }));
vi.mock('@/api/records', () => ({ listByExam: api.records, listCheatByExam: api.cheats }));
vi.mock('@/stores/settings', () => ({ useSettingsStore: () => state }));
vi.mock('vue-echarts', () => ({ default: { name: 'VChart', template: '<div />' } }));
const state = reactive({ ready: true, settings: { defaultPageSize: 20, retakeScorePolicy: 'highest', cheatCountThreshold: 3, cheatSecondsThreshold: 30 }, load: api.rules });
const row = { id: 'r', userId: 'u', userName: '完整考生姓名', departmentId: 'd', departmentName: '完整科室', status: 'submitted', score: 80, attemptNo: 2, submittedAt: '2026-10-20T00:00:00Z', cheatEvents: [{ at: '2026-10-20T00:00:00Z', awaySeconds: 31 }] };
const wrong = { questionId: 'q', stem: '第一段题干\n第二段完整内容' + 'LONG'.repeat(50), wrongCount: 1, totalAnswered: 2, wrongRate: 0.5 };
const report = { summary: { total: 2, avgScore: 80, minScore: 70, maxScore: 90, passRate: 1 }, bands: [{ label: '80–89', count: 2 }], departments: [{ departmentId: 'd', departmentName: '完整科室', count: 2, avgScore: 80, passRate: 1 }], wrongRate: [wrong] };
let wrapper: VueWrapper;
const render = async () => { wrapper = mount(ScoreReportPage, { attachTo: document.body, global: { plugins: [ElementPlus], stubs: { VChart: true, ScoreExportDialog: true } } }); await flushPromises(); };
beforeEach(() => {
  vi.clearAllMocks(); state.ready = true;
  api.rules.mockResolvedValue(undefined); api.exams.mockResolvedValue([{ id: 'e', name: '考试甲', passScore: 60, startTime: '2026-10-20' }, { id: 'e2', name: '考试乙', passScore: 60, startTime: '2026-10-19' }]);
  api.users.mockResolvedValue([]); api.departments.mockResolvedValue([]); api.report.mockResolvedValue(report);
  api.records.mockResolvedValue({ list: [row], total: 1, page: 1, pageSize: 20 }); api.cheats.mockResolvedValue([row]);
});
afterEach(() => { wrapper?.unmount(); document.body.innerHTML = ''; });
describe('成绩报表的真实范围与详情', () => {
  it('少于10人的科室仍展示，不附加高错误率判断；完整题干可打开阅读', async () => {
    await render(); expect(wrapper.text()).toContain('按人数前 5 项'); expect(wrapper.text()).not.toContain('参考人数 ≥ 10');
    expect(wrapper.find('.report-page__mini').text()).toContain('完整科室'); expect(wrapper.text()).not.toContain('前两题错误率偏高');
    await wrapper.find('.report-page__wrong-stem').trigger('click'); await flushPromises();
    expect(document.querySelector('.el-drawer')?.textContent).toContain(wrong.stem);
    expect(document.querySelector('.el-drawer')?.textContent).toContain('本题作答人数2 人');
    wrapper.findComponent({ name: 'ElSelect' }).vm.$emit('update:modelValue', 'e2'); await flushPromises();
    expect(wrapper.findComponent({ name: 'ElDrawer' }).props('modelValue')).toBe(false);
  });
  it('规则读取失败不显示正常或0异常，失败可重试并按原阈值标记', async () => {
    state.ready = false; api.rules.mockResolvedValue(undefined);
    await render(); expect(wrapper.text()).toContain('成绩选取口径暂未知'); expect(wrapper.text()).toContain('规则未知'); expect(wrapper.text()).toContain('异常人数未知');
    const cheat = wrapper.findAllComponents({ name: 'StatCard' }).find(c => String(c.props('label')).includes('切屏异常'))!;
    expect(cheat.props('value')).toBe('—');
    api.rules.mockImplementation(async () => { state.ready = true; });
    await wrapper.findAll('button').find(b => b.text() === '重试读取规则')!.trigger('click'); await flushPromises();
    expect(cheat.props('value')).toBe(1); expect(wrapper.text()).toContain('最高分已交卷答卷');
  });
  it('没有出分样本时不虚构均分与及格率，导出禁用', async () => {
    api.report.mockResolvedValue({ ...report, summary: { ...report.summary, total: 0, avgScore: 0, passRate: 0 } });
    api.records.mockResolvedValue({ list: [], total: 0, page: 1, pageSize: 20 }); api.cheats.mockResolvedValue([]);
    await render(); const stats = wrapper.findAllComponents({ name: 'StatCard' });
    expect(stats.slice(1,4).map(c => c.props('value'))).toEqual(['—','—','—']);
    expect(wrapper.findAll('button').find(b => b.text() === '导出成绩')!.attributes()).toHaveProperty('disabled');
    expect(wrapper.text()).toContain('当前考试暂无已出分答卷');
  });
  it('切屏读取中人数未知；姓名打开完整时间线和阈值', async () => {
    let resolve!: (rows: unknown[]) => void; api.cheats.mockReturnValueOnce(new Promise(r => { resolve = r; }));
    await render(); expect(wrapper.findAllComponents({ name: 'StatCard' }).at(-1)!.props('value')).toBe('—');
    resolve([row]); await flushPromises(); await wrapper.find('.report-page__person-entry').trigger('click'); await flushPromises();
    expect(document.querySelector('.el-drawer')?.textContent).toContain('完整考生姓名');
    expect(document.querySelector('.el-drawer')?.textContent).toContain('3 次或 30 秒');
    expect(document.querySelector('.el-drawer')?.textContent).toContain('31 秒');
    expect(document.querySelectorAll('.el-drawer .cheat-event-list li')).toHaveLength(1);
  });
});
