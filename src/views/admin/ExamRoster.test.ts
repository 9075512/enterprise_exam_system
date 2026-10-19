import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { createPinia } from 'pinia';
import ElementPlus from 'element-plus';
import { useAuthStore } from '@/stores/auth';
import type { User } from '@/types';
import ExamManagePage from './ExamManagePage.vue';

const api = vi.hoisted(() => ({ exams: vi.fn(), departments: vi.fn(), participants: vi.fn() }));
vi.mock('vue-router', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('@/api/exams', () => ({ list: api.exams }));
vi.mock('@/api/departments', () => ({ list: api.departments }));
vi.mock('@/api/coreFeatures', () => ({ participantsApi: { list: api.participants } }));
let wrapper: VueWrapper;
function render(role = 'admin') {
  const pinia = createPinia(); useAuthStore(pinia).currentUser = { role, id: 'u', name: '测试' } as User;
  wrapper = mount(ExamManagePage, { attachTo: document.body, global: { plugins: [pinia, ElementPlus], stubs: { ExamExceptionDialog: true } } });
}
async function open(index = 0) {
  const items = wrapper.findAllComponents({ name: 'ElDropdownItem' }).filter(i => i.text() === '生效名单');
  items[index]!.vm.$emit('click', new MouseEvent('click')); await flushPromises();
}
const person = (name: string) => ({ userId: name, userName: name, username: name + '-account', departmentName: '研发部', source: 'department', admissionNo: 'NO-001' });
beforeEach(() => {
  vi.resetAllMocks(); api.departments.mockResolvedValue([]);
  api.exams.mockResolvedValue(['first', 'second'].map(id => ({ id, name: id + '考试', bankIds: [], departmentIds: [], participantDepartmentIds: [], participantUserIds: [], authors: [], startAt: '2026-10-18T00:00:00Z', endAt: '2026-10-25T00:00:00Z', durationMinutes: 60, questionCount: 10, totalScore: 100, passScore: 60, maxAttempts: 1 })));
  api.participants.mockResolvedValue([]);
});
afterEach(() => { wrapper?.unmount(); document.body.innerHTML = ''; });

describe('考试生效名单', () => {
  it('名单失败不冒充空名单，重试显示实际人员与中文来源', async () => {
    api.participants.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce([person('考生甲')]);
    render(); await flushPromises(); await open();
    expect(document.body.textContent).toContain('生效名单加载失败');
    expect(document.body.textContent).toContain('人数未知');
    expect(document.body.textContent).not.toContain('该考试暂无生效人员');
    [...document.querySelectorAll<HTMLButtonElement>('button')].find(b => b.textContent?.trim() === '重新加载')!.click(); await flushPromises();
    expect(document.querySelector('.el-dialog')?.textContent).toContain('1 人');
    expect(document.querySelector('.el-dialog')?.textContent).toContain('考生甲-account');
    expect(document.querySelector('.el-dialog')?.textContent).toContain('科室范围');
    expect(api.participants).toHaveBeenLastCalledWith('first');
  });

  it('从一个考试切换到另一个时，不显示迟到的旧名单', async () => {
    let old!: (value: unknown[]) => void;
    api.participants.mockReturnValueOnce(new Promise(resolve => { old = resolve; })).mockResolvedValueOnce([person('新考生')]);
    render(); await flushPromises(); await open();
    wrapper.findAllComponents({ name: 'ElDialog' }).find(d => d.props('title') === '考试生效名单')!.vm.$emit('update:modelValue', false);
    await flushPromises(); await open(1);
    old([person('旧考生')]); await flushPromises();
    expect(document.querySelector('.el-dialog')?.textContent).toContain('second考试');
    expect(document.querySelector('.el-dialog')?.textContent).toContain('新考生');
    expect(document.querySelector('.el-dialog')?.textContent).not.toContain('旧考生');
  });

  it('出题人身份不显示生效名单入口，保持原有考务权限', async () => {
    render('author'); await flushPromises();
    expect(wrapper.findAllComponents({ name: 'ElDropdownItem' }).some(i => i.text() === '生效名单')).toBe(false);
    expect(api.participants).not.toHaveBeenCalled();
  });
});
