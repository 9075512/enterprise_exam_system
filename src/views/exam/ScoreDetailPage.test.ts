import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { reactive } from 'vue';
import ElementPlus, { ElMessage } from 'element-plus';
import ScoreDetailPage from './ScoreDetailPage.vue';
import type { ExamRecord } from '@/types';

const api = vi.hoisted(() => ({ role: 'admin', detail: vi.fn(), exams: vi.fn(), replace: vi.fn(), push: vi.fn() }));
const route = reactive({ params: { recordId: 'r1' } });
vi.mock('vue-router', () => ({ useRoute: () => route, useRouter: () => ({ push: api.push, replace: api.replace }) }));
vi.mock('@/api/records', () => ({ detail: api.detail }));
vi.mock('@/api/exams', () => ({ list: api.exams, my: api.exams }));
vi.mock('@/api/coreFeatures', () => ({ feedbackApi: { create: vi.fn() } }));
vi.mock('@/stores/auth', () => ({ useAuthStore: () => ({ currentUser: { role: api.role, name: '当前管理员' } }) }));
vi.mock('@/stores/settings', () => ({ useSettingsStore: () => ({ load: vi.fn(), settings: { cheatCountThreshold: 5, cheatSecondsThreshold: 60 } }) }));

const kinds = ['single', 'multiple', 'judge', 'fill', 'short'] as const;
function record(id = 'r1', name = '考生甲'): ExamRecord {
  return {
    id, examId: 'e1', userName: name, departmentName: '生产科', passScore: 60, status: 'submitted', score: 72, attemptNo: 1,
    submittedAt: '2026-10-19T00:00:00Z', cheatEvents: [], subjectiveScores: { short: 8 }, reviewNotes: { short: { comment: '评分说明', doubtful: true } },
    answers: { single: [0], multiple: [0], judge: [1], fill: ['安全'], short: ['<p>实际作答</p>'] },
    paperSnapshot: { paperName: '安全考试', totalScore: 100, questions: kinds.map(type => ({
      questionId: type, score: 20,
      question: { id: type, type, stem: type + '题干', options: ['甲', '乙', '丙'], tags: [], analysis: '解析',
        answer: type === 'multiple' ? [0, 2] : type === 'judge' ? [1] : type === 'fill' ? ['安全'] : type === 'short' ? ['参考答案'] : [0] },
    })) },
  } as unknown as ExamRecord;
}
let wrapper: VueWrapper;
function render() {
  wrapper = mount(ScoreDetailPage, { global: { plugins: [ElementPlus], stubs: { PageHeader: { props: ['title', 'description'], template: '<header><h1>{{ title }}</h1>{{ description }}<slot name="actions" /></header>' } } } });
}
beforeEach(() => { vi.resetAllMocks(); api.role = 'admin'; route.params.recordId = 'r1'; api.exams.mockResolvedValue([]); api.detail.mockResolvedValue(record()); });
afterEach(() => { wrapper?.unmount(); ElMessage.closeAll(); document.body.innerHTML = ''; });

describe('成绩明细真实数据与身份视角', () => {
  it('旧答卷没有及格线且考试信息不可用时，保持未知，不误判不及格', async () => {
    api.detail.mockResolvedValue({ ...record(), passScore: undefined });
    api.exams.mockRejectedValue(new Error('offline'));
    render(); await flushPromises();
    expect(wrapper.text()).toContain('及格线未知');
    expect(wrapper.text()).not.toContain('未及格');
    expect(wrapper.find('.sd__score.is-fail').exists()).toBe(false);
  });
  it('保留五种题型、阅卷说明和真实分数差额，管理员采用考生视角文案', async () => {
    render(); await flushPromises();
    for (const label of ['单选题', '多选题', '判断题', '填空题', '简答题']) expect(wrapper.text()).toContain(label);
    expect(wrapper.text()).toContain('考生答案');
    expect(wrapper.text()).toContain('考生作答');
    expect(wrapper.text()).not.toContain('你的答案');
    expect(wrapper.text()).toContain('记录总分 72 分；逐题得分合计 68 分');
    expect(wrapper.text()).toContain('阅卷存疑');
    expect(wrapper.text()).toContain('75%');
  });

  it('网络失败可重试，未知记录不显示空态或总分', async () => {
    api.detail.mockRejectedValueOnce(new Error('offline'));
    render(); await flushPromises();
    expect(wrapper.text()).toContain('无法加载成绩明细');
    expect(wrapper.text()).not.toContain('未找到该成绩记录');
    expect(api.push).not.toHaveBeenCalled();
    await wrapper.findAll('button').find(el => el.text() === '重新加载')!.trigger('click'); await flushPromises();
    expect(wrapper.text()).toContain('考生甲');
  });

  it('切换记录作废旧请求，不能在新记录下显示旧考生答卷', async () => {
    let first!: (value: ExamRecord) => void;
    let second!: (value: ExamRecord) => void;
    api.detail.mockImplementation((id: string) => new Promise(resolve => { if (id === 'r1') first = resolve; else second = resolve; }));
    render(); await flushPromises();
    route.params.recordId = 'r2'; await flushPromises();
    second(record('r2', '考生乙')); await flushPromises();
    first(record()); await flushPromises();
    expect(wrapper.text()).toContain('考生乙');
    expect(wrapper.text()).not.toContain('考生甲');
  });

  it('考生视角保留本人答案文案并隐藏内部存疑标记', async () => {
    api.role = 'examinee';
    render(); await flushPromises();
    expect(wrapper.text()).toContain('你的答案');
    expect(wrapper.text()).toContain('你的作答');
    expect(wrapper.text()).not.toContain('阅卷存疑');
  });

  it('尚未交卷保持原有拦截与返回路径', async () => {
    api.detail.mockResolvedValue({ ...record(), status: 'in_progress', submittedAt: null });
    render(); await flushPromises();
    expect(api.replace).toHaveBeenCalledWith('/admin/scores');
    expect(wrapper.text()).not.toContain('single题干');
  });
});
