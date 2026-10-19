import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, shallowMount, type VueWrapper } from '@vue/test-utils';
import ElementPlus from 'element-plus';
import DashboardPage from './DashboardPage.vue';

const api = vi.hoisted(() => ({ departments: vi.fn(), users: vi.fn(), banks: vi.fn(), exams: vi.fn(), dashboard: vi.fn(), report: vi.fn(), pending: vi.fn(), appeals: vi.fn(), retakes: vi.fn(), cheat: vi.fn() }));
vi.mock('@/api/departments', () => ({ list: api.departments }));
vi.mock('@/api/users', () => ({ list: api.users }));
vi.mock('@/api/banks', () => ({ list: api.banks }));
vi.mock('@/api/exams', () => ({ list: api.exams }));
vi.mock('@/api/reports', () => ({ dashboard: api.dashboard, examReport: api.report }));
vi.mock('@/api/records', () => ({ listPending: api.pending, listCheatByExam: api.cheat }));
vi.mock('@/api/appeals', () => ({ list: api.appeals }));
vi.mock('@/api/retakes', () => ({ listRetakes: api.retakes }));
vi.mock('@/stores/settings', () => ({ useSettingsStore: () => ({ load: async () => {}, settings: { cheatCountThreshold: 3, cheatSecondsThreshold: 120 } }) }));
vi.mock('vue-echarts', () => ({ default: { props: ['option'], template: '<div class="chart" />' } }));
const slot = { template: '<section><slot name="header" /><slot /></section>' };
let wrapper: VueWrapper;
beforeEach(() => {
  vi.resetAllMocks();
  api.departments.mockResolvedValue([]);
  api.users.mockResolvedValue([]);
  api.banks.mockResolvedValue([{ isLeaf: false, questionCount: 0 }, { isLeaf: true, questionCount: 6 }, { isLeaf: true, questionCount: 4 }]);
  api.exams.mockResolvedValue([]);
  api.dashboard.mockResolvedValue({ examTrend: [], subjectWrong: [], tagWrong: [] });
  api.report.mockResolvedValue({ departments: [] });
  api.pending.mockResolvedValue({ list: [], total: 12 });
  api.appeals.mockResolvedValue({ list: [], total: 3 });
  api.retakes.mockResolvedValue({ list: [], total: 2 });
  api.cheat.mockResolvedValue([]);
});
afterEach(() => wrapper?.unmount());
async function setup() {
  wrapper = shallowMount(DashboardPage, { global: { plugins: [ElementPlus], stubs: {
    ElCard: slot, ElRow: slot, ElCol: slot, ElTable: { template: '<div />' },
    PageHeader: { template: '<header><slot name="actions" /></header>' },
    RouterLink: { template: '<a><slot /></a>' },
    EmptyState: { props: ['text'], template: '<div>{{ text }}</div>' },
    ElAlert: { props: ['title'], template: '<p role="alert">{{ title }}</p>' },
  } } });
  await flushPromises();
}
describe('数据总览的真实统计范围', () => {
  it('题库只计叶子科目，待办使用服务端全量 total，而非当前页条数', async () => {
    await setup();
    expect(wrapper.findAll('.stat-card__value').map(x => x.text())).toEqual(['0', '0', '2 / 10', '0']);
    expect(wrapper.text()).toContain('12 份主观题待阅卷');
    expect(wrapper.text()).toContain('3 份成绩复核申请');
    expect(wrapper.text()).toContain('不受下方报表筛选影响');
    expect(wrapper.text()).toContain('每人每场最新已交卷答卷');
  });
  it('资源请求失败显示未知数量与错误，不用零值冒充加载成功', async () => {
    api.users.mockRejectedValue(new Error('offline'));
    await setup();
    expect(wrapper.findAll('.stat-card__value')[1].text()).toBe('—');
    expect(wrapper.text()).toContain('用户资源加载失败');
  });
  it('考试列表失败时不把未知的派生范围显示为零场或零条切屏异常', async () => {
    api.exams.mockRejectedValue(new Error('offline'));
    await setup();
    expect(wrapper.text()).toContain('考试范围未加载');
    expect(wrapper.text()).not.toContain('全局最近 0 场');
    expect(wrapper.text()).not.toContain('0 条切屏异常');
    expect(api.report).not.toHaveBeenCalled();
    expect(api.cheat).not.toHaveBeenCalled();
  });
  it('部分逐场报表失败时标明成功样本数，保留可用数据', async () => {
    api.exams.mockResolvedValue([
      { id: 'e1', name: '考试一', startTime: '2026-10-18T09:00:00Z', endTime: '2026-10-19T09:00:00Z', departmentIds: [] },
      { id: 'e2', name: '考试二', startTime: '2026-10-17T09:00:00Z', endTime: '2026-10-18T09:00:00Z', departmentIds: [] },
    ]);
    api.report.mockImplementation(async (id: string) => {
      if (id === 'e1') throw new Error('offline');
      return { departments: [{ departmentId: 'd1', departmentName: '研发部', count: 2, avgScore: 80, passRate: 0.5 }] };
    });
    await setup();
    expect(wrapper.text()).toContain('全局最近 2 场');
    expect(wrapper.text()).toContain('成功 1 场，1 场加载失败');
    expect(wrapper.text()).toContain('按参考人次加权');
  });
});
