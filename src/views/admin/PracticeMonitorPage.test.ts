import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import ElementPlus, { ElButton } from 'element-plus';
import PracticeMonitorPage from './PracticeMonitorPage.vue';
const api = vi.hoisted(() => ({ overview: vi.fn(), sessions: vi.fn(), logs: vi.fn(), users: vi.fn(), departments: vi.fn(), banks: vi.fn() }));
vi.mock('@/api/coreFeatures', () => ({ practiceMonitorApi: { overview: api.overview, sessions: api.sessions, logs: api.logs } }));
vi.mock('@/api/users', () => ({ list: api.users })); vi.mock('@/api/departments', () => ({ list: api.departments })); vi.mock('@/api/banks', () => ({ list: api.banks }));
const session = { id: 'sample-session', userName: '完整姓名', departmentName: '长科室名称', bankName: '长题库名称', mode: 'wrong-book', questionCount: 10, answeredCount: 3, correctCount: 2, status: 'offline', startedAt: '2026-10-20T00:00:00Z', lastSeenAt: '2026-10-20T00:01:00Z', endedAt: null };
const log = { userName: '完整姓名', bankName: '长题库名称', sessionId: 'sample-session', questionId: 'sample-question', stem: '题干第一段\n第二段ABCDEFGHIJKLMNOPQRSTUVWXYZ', answer: ['第一空', '', '第三空\n第二行'], correct: false, answeredAt: '2026-10-20T00:01:00Z' };
let wrapper: VueWrapper;
async function render() { wrapper = mount(PracticeMonitorPage, { attachTo: document.body, global: { plugins: [ElementPlus], stubs: { TableDensityToggle: true } } }); await flushPromises(); }
beforeEach(() => { vi.resetAllMocks(); api.overview.mockResolvedValue({ activeUsers: 1, sessionTotal: 10, dailyActiveUsers: 2, answerTotal: 30, averageCorrectRate: 50, wrongConsolidationRate: 20, generatedAt: '2026-10-20T00:00:00Z' }); api.sessions.mockResolvedValue([session]); api.logs.mockResolvedValue([log]); api.users.mockResolvedValue([]); api.departments.mockResolvedValue([]); api.banks.mockResolvedValue([]); vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('stream unavailable'))); });
afterEach(() => { wrapper?.unmount(); document.body.innerHTML = ''; vi.unstubAllGlobals(); vi.restoreAllMocks(); });
const click = async (name: string) => { wrapper.findAllComponents(ElButton).find(b => b.text() === name && b.isVisible())!.vm.$emit('click', new MouseEvent('click')); await flushPromises(); };
describe('练题监控完整阅读与真实范围', () => {
  it('加载中的会话不显示0条，完整会话详情包含状态、时间和真实进度', async () => {
    let finish!: (value: unknown) => void; api.sessions.mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
    await render(); expect(wrapper.text()).toContain('正在加载'); expect(wrapper.text()).not.toContain('已返回 0 条');
    finish([session]); await flushPromises(); await click(session.userName);
    const detail = document.querySelector('.practice-monitor-detail')!; expect(detail.textContent).toContain('长科室名称'); expect(detail.textContent).toContain('3 / 10'); expect(detail.textContent).toContain('67%'); expect(detail.textContent).toContain('离线'); expect(detail.textContent).toContain('错题练习'); expect(detail.textContent).toContain('尚无结束记录');
  });
  it('日志详情保留多空、未填写项和换行，日志不传会话状态筛选', async () => {
    await render(); const status = wrapper.findAllComponents({ name: 'ElSelect' })[3]!; status.vm.$emit('update:modelValue', 'offline'); await flushPromises();
    expect(api.sessions).toHaveBeenLastCalledWith(expect.objectContaining({ status: 'offline' })); expect(api.logs.mock.lastCall?.[0]).not.toHaveProperty('status');
    await wrapper.findAll('[role="tab"]').find(t => t.text() === '逐题作答日志')!.trigger('click'); await flushPromises(); await click(log.userName);
    const blocks = [...document.querySelectorAll('.practice-monitor-detail__block p')]; expect(blocks[0]?.textContent).toBe(log.stem); expect(blocks[1]?.textContent).toBe('第一空\n（未填写）\n第三空\n第二行');
    expect(document.querySelector('.practice-monitor-detail')?.textContent).toContain('sample-question'); expect(wrapper.text()).toContain('最多返回最近 5,000 条'); expect(wrapper.text()).toContain('会话状态不参与日志筛选');
  });
  it('手动刷新不重复请求，概览失败不显示旧时间，卸载清理轮询', async () => {
    const clear = vi.spyOn(globalThis, 'clearInterval'); await render();
    let fail!: (reason: Error) => void; api.overview.mockReturnValueOnce(new Promise((_resolve, reject) => { fail = reject; }));
    await click('刷新'); await click('刷新'); expect(api.overview).toHaveBeenCalledTimes(2); expect(api.sessions).toHaveBeenCalledTimes(2); expect(api.logs).toHaveBeenCalledTimes(2);
    fail(new Error('offline')); await flushPromises(); expect(wrapper.text()).toContain('概览暂不可用'); expect(wrapper.findAll('.stat-card__value').every(el => el.text() === '—')).toBe(true);
    wrapper.unmount(); expect(clear).toHaveBeenCalled();
  });
});
