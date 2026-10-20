import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { createPinia } from 'pinia';
import ElementPlus, { ElMessageBox } from 'element-plus';
import { useAuthStore } from '@/stores/auth';
import type { User } from '@/types';
import ExamManagePage from './ExamManagePage.vue';

const api = vi.hoisted(() => ({ exams: vi.fn(), departments: vi.fn(), participants: vi.fn(), pdf: vi.fn(), tickets: vi.fn(), remove: vi.fn() }));
vi.mock('vue-router', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('@/api/exams', () => ({ list: api.exams, exportPdf: api.pdf, remove: api.remove }));
vi.mock('@/api/departments', () => ({ list: api.departments }));
vi.mock('@/api/coreFeatures', () => ({ participantsApi: { list: api.participants, ticketsPdf: api.tickets } }));
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
afterEach(() => { wrapper?.unmount(); document.body.innerHTML = ''; vi.restoreAllMocks(); vi.unstubAllGlobals(); });

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

  it('考试名称打开完整详情，作者仍不能维护未获编辑权限的题目', async () => {
    render('author'); await flushPromises();
    await wrapper.find('.exam-page__exam-name').trigger('click'); await flushPromises();
    expect(document.querySelector('.el-drawer')?.textContent).toContain('first考试');
    const edit = [...document.querySelectorAll<HTMLButtonElement>('.el-drawer__footer button')].find(b => b.textContent?.trim() === '维护题目')!;
    expect(edit.disabled).toBe(true);
    expect(document.querySelector('.el-drawer')?.textContent).not.toContain('生效名单');
  });

  it('准考证导出失败可重试，处理中阻止重复请求', async () => {
    let reject!: (error: Error) => void;
    api.tickets.mockReturnValueOnce(new Promise((_, r) => { reject = r; })).mockResolvedValueOnce(new Blob(['pdf']));
    const create = vi.fn(() => 'blob:sample'), revoke = vi.fn();
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: create, revokeObjectURL: revoke }));
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    render(); await flushPromises();
    const download = wrapper.findAllComponents({ name: 'ElDropdownItem' }).find(i => i.text() === '导出准考证')!;
    download.vm.$emit('click', new MouseEvent('click')); await flushPromises();
    download.vm.$emit('click', new MouseEvent('click')); await flushPromises();
    expect(api.tickets).toHaveBeenCalledTimes(1);
    reject(new Error('offline')); await flushPromises();
    expect(wrapper.text()).toContain('准考证导出失败');
    download.vm.$emit('click', new MouseEvent('click')); await flushPromises();
    expect(api.tickets).toHaveBeenCalledTimes(2); expect(create).toHaveBeenCalledTimes(1); expect(revoke).toHaveBeenCalledWith('blob:sample');
  });

  it('删除确认期间不重复弹框，取消后不删除且可继续操作', async () => {
    let cancel!: (reason: string) => void;
    const confirm = vi.spyOn(ElMessageBox, 'confirm').mockImplementation(() => new Promise((_, r) => { cancel = r; }));
    render(); await flushPromises();
    const item = wrapper.findAllComponents({ name: 'ElDropdownItem' }).find(i => i.text() === '删除')!;
    item.vm.$emit('click', new MouseEvent('click')); item.vm.$emit('click', new MouseEvent('click')); await flushPromises();
    expect(confirm).toHaveBeenCalledTimes(1); cancel('cancel'); await flushPromises();
    expect(api.remove).not.toHaveBeenCalled();
    expect(wrapper.find('.exam-page__stat').attributes('disabled')).toBeUndefined();
  });
});
