import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, shallowMount } from '@vue/test-utils';
import ExamTakingPage from './ExamTakingPage.vue';
import QuestionCard from './components/QuestionCard.vue';
import ExamResultDialog from './components/ExamResultDialog.vue';
const api = vi.hoisted(() => ({ detail: vi.fn(), exam: vi.fn(), save: vi.fn(), submit: vi.fn(), confirm: vi.fn(), close: vi.fn(), push: vi.fn(), replace: vi.fn(), cheat: vi.fn() }));
vi.mock('vue-router', () => ({ useRoute: () => ({ params: { recordId: 'r1' } }), useRouter: () => ({ push: api.push, replace: api.replace }) }));
vi.mock('@/api/records', () => ({ detail: api.detail, saveAnswers: api.save, submit: api.submit, addCheatEvent: api.cheat }));
vi.mock('@/api/exams', () => ({ detail: api.exam }));
vi.mock('element-plus', () => ({ ElMessage: { info: vi.fn(), warning: vi.fn(), error: vi.fn() }, ElMessageBox: { confirm: api.confirm, close: api.close } }));
vi.mock('@/stores/auth', () => ({ useAuthStore: () => ({ currentUser: { name: '考生甲', username: 'test' } }) }));
vi.mock('@/stores/settings', () => ({ useSettingsStore: () => ({ load: vi.fn(), settings: { cheatWatermarkEnabled: false, abnormalExitResumePolicy: 'self', cheatCountThreshold: 5, cheatSecondsThreshold: 60 } }) }));
let wrapper: ReturnType<typeof shallowMount>;
const questions = ['single', 'multiple', 'judge', 'fill', 'short'].map((type, i) => ({ questionId: `q${i}`, score: 20, question: { id: `q${i}`, type, stem: type === 'fill' ? '___ 和 ___' : '示例题干', answer: [], options: ['甲', '乙'] } }));
const record = () => ({ id: 'r1', examId: 'e1', status: 'in_progress', answers: {}, cheatEvents: [], startedAt: new Date().toISOString(), paperSnapshot: { questions, totalScore: 100 } });
const global = { stubs: { ElIcon: true, ElButton: { props: ['disabled', 'loading'], template: '<button :disabled="disabled || loading"><slot /></button>' }, ElDrawer: { props: ['modelValue'], template: '<div v-if="modelValue"><slot /><slot name="footer" /></div>' }, ElAlert: { props: ['title'], template: '<p>{{ title }}</p>' }, ElCard: { template: '<div><slot /></div>' } } };
function render() { wrapper = shallowMount(ExamTakingPage, { global }); }
async function click(text: string) { await wrapper.findAll('button').find(b => b.text() === text)!.trigger('click'); await flushPromises(); }
async function answer(value: number[] = [0]) { wrapper.findAllComponents(QuestionCard)[0]!.vm.$emit('update:modelValue', value); await flushPromises(); }
beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] });
  vi.setSystemTime(new Date('2026-10-19T00:00:00Z'));
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
  api.detail.mockResolvedValue(record()); api.exam.mockResolvedValue({ name: '安全考试', durationMinutes: 60, endTime: '2026-10-19T02:00:00Z', passScore: 60 });
  api.save.mockResolvedValue(null); api.confirm.mockResolvedValue('confirm'); api.submit.mockResolvedValue({ ...record(), status: 'submitted', score: 60 });
});
afterEach(() => { wrapper?.unmount(); vi.useRealTimers(); vi.unstubAllGlobals(); });
describe('考试答题与安全交卷', () => {
  it('暂存失败时不退出答题页，重试成功后才返回考试列表', async () => {
    api.save.mockRejectedValueOnce(new Error('offline'));
    render(); await flushPromises(); await answer(); await click('暂存退出');
    expect(api.push).not.toHaveBeenCalled();
    expect(wrapper.findAllComponents(QuestionCard)[0]!.props('modelValue')).toEqual([0]);
    await click('暂存退出'); expect(api.push).toHaveBeenCalledWith('/exam/my');
  });
  it('最后一次作答未到自动暂存间隔，也须先保存再交卷', async () => {
    let done!: () => void; api.save.mockReturnValue(new Promise<void>(resolve => { done = resolve; }));
    render(); await flushPromises(); await answer(); await click('交卷');
    expect(api.save).toHaveBeenCalledWith('r1', { q0: [0] });
    expect(api.submit).not.toHaveBeenCalled();
    expect(wrapper.findAllComponents(QuestionCard)[0]!.props('disabled')).toBe(true);
    done(); await flushPromises();
    expect(api.submit).toHaveBeenCalledWith('r1', false);
    expect(wrapper.getComponent(ExamResultDialog).props('modelValue')).toBe(true);
    expect(api.confirm).toHaveBeenCalledWith(expect.stringContaining('4 道题未完整作答'), '交卷确认', expect.anything());
    expect(api.confirm.mock.calls[0]![0]).toContain('考试：安全考试\n已完整作答 1 / 5 题');
  });
  it('暂存失败保留答案，阻止交卷和退出，允许重试', async () => {
    api.save.mockRejectedValueOnce(new Error('offline'));
    render(); await flushPromises(); await answer(); await click('交卷');
    expect(api.submit).not.toHaveBeenCalled(); expect(wrapper.text()).toContain('暂存失败');
    expect(wrapper.findAllComponents(QuestionCard)[0]!.props('modelValue')).toEqual([0]);
    await click('交卷'); expect(api.submit).toHaveBeenCalledTimes(1);
  });
  it('连续暂存串行执行，旧答案不会晚于新答案写入', async () => {
    let first!: () => void; api.save.mockReturnValueOnce(new Promise<void>(resolve => { first = resolve; }));
    render(); await flushPromises(); await answer([0]); await vi.advanceTimersByTimeAsync(1500);
    await answer([1]); await click('交卷');
    expect(api.save).toHaveBeenCalledTimes(1);
    first(); await flushPromises();
    expect(api.save.mock.calls.map(c => c[1])).toEqual([{ q0: [0] }, { q0: [1] }]);
    expect(api.submit).toHaveBeenCalledTimes(1);
  });
  it('沿用个人时长和加时规则，到时自动交卷无需等关闭提示', async () => {
    api.detail.mockResolvedValue({ ...record(), startedAt: '2026-10-18T23:00:02Z', extraMinutes: 5 });
    api.exam.mockResolvedValue({ name: '安全考试', durationMinutes: 55, endTime: '2026-10-19T00:00:01Z' });
    render(); await flushPromises(); await answer(); await vi.advanceTimersByTimeAsync(1100);
    expect(api.submit).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1000); await flushPromises();
    expect(api.submit).toHaveBeenCalledWith('r1', true);
    expect(api.save).toHaveBeenCalledWith('r1', { q0: [0] });
  });
  it('确认框和交卷请求期间不重复提交', async () => {
    let confirm!: () => void; api.confirm.mockReturnValue(new Promise<void>(resolve => { confirm = resolve; }));
    render(); await flushPromises(); await click('交卷'); await click('交卷');
    expect(api.confirm).toHaveBeenCalledTimes(1); confirm(); await flushPromises(); expect(api.submit).toHaveBeenCalledTimes(1);
  });
  it('加载失败有可重试状态，待阅卷答卷直接进入明细', async () => {
    api.detail.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({ ...record(), status: 'pending_review' });
    render(); await flushPromises(); expect(wrapper.findComponent({ name: 'RequestError' }).exists()).toBe(true);
    wrapper.findComponent({ name: 'RequestError' }).vm.$emit('retry'); await flushPromises();
    expect(api.replace).toHaveBeenCalledWith('/score-detail/r1'); expect(api.submit).not.toHaveBeenCalled();
  });
});

it('交卷确认未关闭时到时仍按原规则自动交卷', async () => {
  api.detail.mockResolvedValue({ ...record(), startedAt: '2026-10-18T23:00:02Z' });
  api.confirm.mockReturnValue(new Promise(() => {}));
  render(); await flushPromises(); await answer(); await click('交卷');
  expect(api.submit).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(2000); await flushPromises();
  expect(api.close).toHaveBeenCalled();
  expect(api.submit).toHaveBeenCalledWith('r1', true);
  expect(wrapper.getComponent(ExamResultDialog).props('modelValue')).toBe(true);
});
