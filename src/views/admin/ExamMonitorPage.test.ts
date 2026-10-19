import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import ElementPlus from 'element-plus';
import ExamMonitorPage from './ExamMonitorPage.vue';

const api = vi.hoisted(() => ({ monitor: vi.fn(), stream: vi.fn(), close: vi.fn() }));
vi.mock('vue-router', () => ({ useRoute: () => ({ params: { id: 'e1' } }), useRouter: () => ({ push: vi.fn() }) }));
vi.mock('@/api/exams', () => ({ monitor: api.monitor }));
vi.mock('@/utils/monitorStream', () => ({ openMonitorStream: api.stream }));
vi.mock('@/stores/settings', () => ({ useSettingsStore: () => ({ load: vi.fn(), settings: { countdownWarningMinutes: 5, cheatCountThreshold: 5, cheatSecondsThreshold: 60 } }) }));
let wrapper: VueWrapper;
const snapshot = (submitted: number) => ({ exam: { id: 'e1', name: '安全考试', startTime: '2026-10-18T00:00:00Z', endTime: '2026-10-25T00:00:00Z', durationMinutes: 60 }, rows: [], generatedAt: '2026-10-19T00:00:00Z', summary: { total: 5, notStarted: 5 - submitted, inProgress: 0, submitted, pendingReview: 0, cheatWarned: 0, averageScore: 0 } });
beforeEach(() => { vi.resetAllMocks(); api.monitor.mockResolvedValue(snapshot(0)); api.stream.mockReturnValue({ close: api.close }); });
afterEach(() => { wrapper?.unmount(); document.body.innerHTML = ''; });
function render() { wrapper = mount(ExamMonitorPage, { attachTo: document.body, global: { plugins: [ElementPlus] } }); }

describe('监考统计的真实样本范围', () => {
  it('没有已出成绩答卷时，平均分显示未知而非零分', async () => {
    render(); await flushPromises();
    const card = wrapper.findAll('.monitor__card').find(c => c.text().includes('平均分'))!;
    expect(card.find('.monitor__card-value').text()).toBe('—');
    expect(wrapper.text()).toContain('每人最近一次作答');
    expect(wrapper.text()).toContain('平均分仅统计已出成绩答卷');
  });

  it('已有成绩真实平均分为零时，保留零分', async () => {
    api.monitor.mockResolvedValue(snapshot(1)); render(); await flushPromises();
    const card = wrapper.findAll('.monitor__card').find(c => c.text().includes('平均分'))!;
    expect(card.find('.monitor__card-value').text()).toBe('0');
  });

  it('首个请求尚未结束就离开页面时，不再启动监控连接和轮询', async () => {
    let done!: (value: unknown) => void;
    api.monitor.mockReturnValue(new Promise(resolve => { done = resolve; }));
    render(); await flushPromises(); wrapper.unmount();
    done(snapshot(0)); await flushPromises();
    expect(api.stream).not.toHaveBeenCalled();
  });
});
