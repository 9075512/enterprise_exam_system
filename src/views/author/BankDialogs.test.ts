import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import ElementPlus, { ElDialog, ElMessage } from 'element-plus';
import BankCloneDialog from './BankCloneDialog.vue';
import BankAuthorBatchDialog from './BankAuthorBatchDialog.vue';
import QuestionBatchEditDialog from './QuestionBatchEditDialog.vue';
import type { QuestionBank } from '@/types';

const api = vi.hoisted(() => ({ users: vi.fn(), departments: vi.fn(), clone: vi.fn(), grant: vi.fn(), revoke: vi.fn(), batchEdit: vi.fn() }));
vi.mock('@/api/users', () => ({ list: api.users }));
vi.mock('@/api/departments', () => ({ list: api.departments }));
vi.mock('@/api/banks', () => ({ clone: api.clone, grantAuthors: api.grant, revokeAuthors: api.revoke }));
vi.mock('@/api/questions', () => ({ batchEdit: api.batchEdit }));

const bank = { id: 'b1', name: '安全题库', authorIds: ['author-1'] } as QuestionBank;
const wrappers: VueWrapper[] = [];
function button(text: string): HTMLButtonElement {
  return [...document.querySelectorAll<HTMLButtonElement>('.el-dialog button')].find(el => el.textContent?.trim() === text)!;
}
beforeEach(() => {
  vi.resetAllMocks();
  api.users.mockResolvedValue([{ id: 'author-1', name: '出题人甲', username: 'author', role: 'author', departmentId: 'd1' }]);
  api.departments.mockResolvedValue([]);
  api.clone.mockResolvedValue({ bank: { ...bank, id: 'b2' }, copied: 3, reused: 0 });
  api.grant.mockResolvedValue({ changed: 1, skipped: 0, nonAuthor: 0, missing: 0 });
  api.batchEdit.mockResolvedValue({ updated: 2 });
});
afterEach(() => { wrappers.splice(0).forEach(w => w.unmount()); ElMessage.closeAll(); document.body.innerHTML = ''; });
async function cloneDialog(isAdmin = true) {
  const wrapper = mount(BankCloneDialog, { attachTo: document.body, props: { visible: false, bank, isAdmin }, global: { plugins: [ElementPlus] } });
  wrappers.push(wrapper); await wrapper.setProps({ visible: true }); await flushPromises(); return wrapper;
}

describe('题库二级弹窗的状态与权限', () => {
  it('授权选项失败时阻止复制，重试保留源题库授权', async () => {
    api.users.mockRejectedValueOnce(new Error('offline'));
    const wrapper = await cloneDialog();
    expect(document.body.textContent).toContain('授权出题人加载失败');
    expect(button('确认复制').disabled).toBe(true);
    expect(api.clone).not.toHaveBeenCalled();
    button('重新加载').click(); await flushPromises();
    button('确认复制').click(); await flushPromises();
    expect(api.clone).toHaveBeenCalledWith('b1', { name: '安全题库（副本）', copyQuestions: true, authorIds: ['author-1'] });
    expect(wrapper.emitted('update:visible')?.at(-1)).toEqual([false]);
  });

  it('出题人复制沿用原接口的授权规则，不提交管理员授权字段', async () => {
    await cloneDialog(false);
    expect(api.users).not.toHaveBeenCalled();
    button('确认复制').click(); await flushPromises();
    expect(api.clone).toHaveBeenCalledWith('b1', { name: '安全题库（副本）', copyQuestions: true });
  });

  it('批量授权加载失败不显示零人预演，恢复后提交期间锁定关闭并只提交一次', async () => {
    api.users.mockRejectedValueOnce(new Error('offline'));
    const wrapper = mount(BankAuthorBatchDialog, { attachTo: document.body, props: { visible: false, bankId: 'b1', currentAuthorIds: [] }, global: { plugins: [ElementPlus] } });
    wrappers.push(wrapper); await wrapper.setProps({ visible: true }); await flushPromises();
    expect(document.body.textContent).toContain('人员与科室加载失败');
    expect(document.querySelector('.bank-author-batch__counts')).toBeNull();
    expect(button('批量授权').disabled).toBe(true);
    button('重新加载').click(); await flushPromises();
    const role = wrapper.findAllComponents({ name: 'ElSelect' }).find(w => w.props('placeholder') === '不限定角色')!;
    role.vm.$emit('update:modelValue', 'author'); await flushPromises();
    expect(document.querySelector('.bank-author-batch__counts > div')?.textContent).toBe('命中用户1 人');
    let finish!: (value: unknown) => void;
    api.grant.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    button('批量授权').click(); await flushPromises();
    button('批量授权').click(); await flushPromises();
    expect(api.grant).toHaveBeenCalledTimes(1);
    expect(api.grant).toHaveBeenCalledWith('b1', { userIds: [], departmentId: undefined, includeSubDepartments: true, role: 'author' });
    expect(button('取消').disabled).toBe(true);
    expect(wrapper.getComponent(ElDialog).props('closeOnPressEscape')).toBe(false);
    finish({ changed: 1, skipped: 0, nonAuthor: 0, missing: 0 }); await flushPromises();
    expect(wrapper.emitted('update:visible')?.at(-1)).toEqual([false]);
  });

  it('批量难度修改保留原始题目 ID，失败后保留选择并恢复操作', async () => {
    const wrapper = mount(QuestionBatchEditDialog, { attachTo: document.body, props: { visible: false, questionIds: ['q1', 'q2'] }, global: { plugins: [ElementPlus] } });
    wrappers.push(wrapper); await wrapper.setProps({ visible: true }); await flushPromises();
    await wrapper.findComponent({ name: 'ElCheckbox' }).setValue(true);
    wrapper.findComponent({ name: 'ElSelect' }).vm.$emit('update:modelValue', 'high'); await flushPromises();
    api.batchEdit.mockRejectedValueOnce(new Error('offline'));
    button('确认修改').click(); await flushPromises();
    expect(api.batchEdit).toHaveBeenCalledWith({ ids: ['q1', 'q2'], difficulty: 'high' });
    expect(wrapper.findComponent({ name: 'ElSelect' }).props('modelValue')).toBe('high');
    expect(button('确认修改').disabled).toBe(false);
    button('确认修改').click(); await flushPromises();
    expect(wrapper.emitted('update:visible')?.at(-1)).toEqual([false]);
  });
});
