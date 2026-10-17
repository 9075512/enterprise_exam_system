import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import ElementPlus from 'element-plus';
import ExamSettingsForm from './ExamSettingsForm.vue';
import type { Exam } from '@/types';

const api = vi.hoisted(() => ({ load: vi.fn(), users: vi.fn(), audiences: vi.fn() }));
vi.mock('@/stores/settings', () => ({ useSettingsStore: () => ({ load: api.load, settings: { examDefaultDuration: 60, examDefaultPassScore: 60, examDefaultMaxAttempts: 1 } }) }));
vi.mock('@/api/users', () => ({ list: api.users }));
vi.mock('@/api/coreFeatures', () => ({ templatesApi: { audiences: api.audiences } }));

beforeEach(() => {
  vi.clearAllMocks(); api.load.mockResolvedValue(undefined); api.users.mockResolvedValue([]); api.audiences.mockResolvedValue([]);
});

describe('考试设置表单', () => {
  it('等待配置加载完成再挂载数值组件，保持输入框的无障碍可用状态', async () => {
    let resolve!: () => void;
    api.load.mockReturnValue(new Promise<void>(done => { resolve = done; }));
    const wrapper = mount(ExamSettingsForm, { props: { departments: [] }, global: { plugins: [ElementPlus] } });
    expect(wrapper.find('[role="spinbutton"]').exists()).toBe(false);
    resolve(); await flushPromises();
    expect(wrapper.findAll('[role="spinbutton"]')).toHaveLength(3);
    for (const input of wrapper.findAll('[role="spinbutton"]')) expect(input.attributes('aria-disabled')).not.toBe('true');
    wrapper.unmount();
  });

  it('锁定考试保存其他设置时保留开始时间的毫秒精度', async () => {
    const exam: Exam = { id: 'exam-1', name: '锁定考试', startTime: '2026-10-17T00:00:00.123Z', endTime: '2026-10-18T00:00:00.456Z',
      questionsLocked: true, departmentIds: [], includeUserIds: [], excludeUserIds: [], audienceTemplateId: null,
      durationMinutes: 60, passScore: 60, maxAttempts: 1, examMode: 'closed', authors: [{ id: 'author-1', name: '出题人' }],
      paperId: 'paper-1', audienceMode: 'frozen', shuffleEnabled: null, shuffleOptions: null, allowRetake: null, allowAppeal: null,
      createdBy: 'admin-1', createdAt: '2026-10-16T00:00:00.000Z' };
    const wrapper = mount(ExamSettingsForm, { props: { departments: [], exam }, global: { plugins: [ElementPlus] } });
    await flushPromises();
    expect(wrapper.vm.getPayload()).toMatchObject({ startTime: exam.startTime, authorIds: ['author-1'], name: '锁定考试' });
    wrapper.unmount();
  });
});
