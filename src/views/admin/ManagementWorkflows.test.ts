import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { createPinia } from 'pinia';
import ElementPlus from 'element-plus';
import QuestionFeedbackPage from './QuestionFeedbackPage.vue';
import PracticeMonitorPage from './PracticeMonitorPage.vue';

const api = vi.hoisted(() => ({
  feedback: vi.fn(), updateFeedback: vi.fn(), overview: vi.fn(), sessions: vi.fn(), logs: vi.fn(),
  users: vi.fn(), departments: vi.fn(), banks: vi.fn(),
}));
vi.mock('@/api/coreFeatures', () => ({
  feedbackApi: { list: api.feedback, update: api.updateFeedback },
  practiceMonitorApi: { overview: api.overview, sessions: api.sessions, logs: api.logs },
}));
vi.mock('@/api/users', () => ({ list: api.users }));
vi.mock('@/api/departments', () => ({ list: api.departments }));
vi.mock('@/api/banks', () => ({ list: api.banks }));
let wrapper: VueWrapper;
function render(component: typeof QuestionFeedbackPage | typeof PracticeMonitorPage) {
  wrapper = mount(component, { attachTo: document.body, global: {
    plugins: [ElementPlus, createPinia()],
    stubs: { PageHeader: { props: ['title'], template: '<header><h1>{{ title }}</h1><slot name="actions" /></header>' } },
  } });
}
function button(text: string): HTMLButtonElement {
  return [...document.querySelectorAll<HTMLButtonElement>('button')].find(item => item.textContent?.trim() === text)!;
}
beforeEach(() => {
  vi.resetAllMocks();
  api.feedback.mockResolvedValue([]);
  api.users.mockResolvedValue([]); api.departments.mockResolvedValue([]); api.banks.mockResolvedValue([]);
  api.sessions.mockResolvedValue([]); api.logs.mockResolvedValue([]);
  api.overview.mockResolvedValue({ activeUsers: 0, dailyActiveUsers: 0, sessionTotal: 0, answerTotal: 0, averageCorrectRate: 0, wrongConsolidationRate: 0, generatedAt: '2026-10-19T00:00:00Z' });
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('stream unavailable')));
});
afterEach(() => { wrapper?.unmount(); document.body.innerHTML = ''; vi.unstubAllGlobals(); });

describe('其余管理工作流的失败恢复', () => {
  it('反馈处理显示原始内容，保存失败保留回复', async () => {
    api.feedback.mockResolvedValue([{ id: 'f1', userName: '考生甲', content: '题干有误，请核对', category: 'other', status: 'pending', reply: '', source: 'exam', createdAt: '2026-10-19T00:00:00Z' }]);
    render(QuestionFeedbackPage); await flushPromises();
    button('查看并处理').click(); await flushPromises();
    expect(document.querySelector('.admin-detail-block')?.textContent).toContain('题干有误，请核对');
    const textarea = document.querySelector<HTMLTextAreaElement>('textarea')!;
    textarea.value = '已交出题人核对'; textarea.dispatchEvent(new Event('input', { bubbles: true }));
    api.updateFeedback.mockRejectedValue(new Error('offline'));
    button('保存处理结果').click(); await flushPromises();
    expect(api.updateFeedback).toHaveBeenCalledWith('f1', { status: 'pending', reply: '已交出题人核对' });
    expect(document.querySelector('textarea')?.value).toBe('已交出题人核对');
  });

  it('练题统计失败显示未知，明细保留各自范围与上限', async () => {
    api.overview.mockRejectedValue(new Error('offline')); api.sessions.mockRejectedValue(new Error('offline'));
    render(PracticeMonitorPage); await flushPromises();
    expect(wrapper.text()).toContain('不受下方筛选影响');
    expect(wrapper.text()).toContain('1,000 条');
    expect(wrapper.text()).toContain('练题会话加载失败');
    const cards = wrapper.findAll('.stat-card');
    expect(cards).toHaveLength(6);
    expect(cards.every(item => item.find('.stat-card__value').text() === '—')).toBe(true);
    expect(wrapper.text()).not.toContain('当前筛选范围暂无练题会话');
  });
});
