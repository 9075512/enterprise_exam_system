import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DOMWrapper, flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import ElementPlus, { ElButton, ElSelect, ElTreeSelect } from 'element-plus';
import BankAuthorBatchDialog from './BankAuthorBatchDialog.vue';
const api = vi.hoisted(() => ({ users: vi.fn(), departments: vi.fn(), grant: vi.fn(), revoke: vi.fn() }));
vi.mock('@/api/users', () => ({ list: api.users }));
vi.mock('@/api/departments', () => ({ list: api.departments }));
vi.mock('@/api/banks', () => ({ grantAuthors: api.grant, revokeAuthors: api.revoke }));
const users = [{ id: 'a', name: '已授权出题人', username: 'author_a', role: 'author', departmentId: 'root' }, { id: 'b', name: '下级科室出题人', username: 'author_b', role: 'author', departmentId: 'child' }, { id: 'c', name: '非出题人', username: 'candidate', role: 'examinee', departmentId: 'root' }];
let wrapper: VueWrapper;
beforeEach(() => { vi.resetAllMocks(); api.users.mockResolvedValue(users); api.departments.mockResolvedValue([{ id: 'root', name: '上级科室', parentId: null }, { id: 'child', name: '下级科室', parentId: 'root' }]); });
afterEach(() => { wrapper?.unmount(); document.body.innerHTML = ''; });
async function render() { wrapper = mount(BankAuthorBatchDialog, { props: { visible: false, bankId: 'bank-1', currentAuthorIds: ['a'] }, attachTo: document.body, global: { plugins: [ElementPlus] } }); await wrapper.setProps({ visible: true }); await flushPromises(); }
const button = (name: string) => wrapper.findAllComponents(ElButton).find(b => b.text() === name)!;
describe('批量出题人授权预演', () => {
  it('科室含下级和角色过滤口径保留，两种操作单独预演，失败可重试', async () => {
    await render();
    wrapper.getComponent(ElTreeSelect).vm.$emit('update:modelValue', 'root'); await flushPromises();
    expect(new DOMWrapper(document.body).get('.bank-author-batch__counts').text()).toContain('命中用户3 人');
    expect(new DOMWrapper(document.body).get('.bank-author-batch__counts').text()).toContain('非出题人1 人');
    wrapper.findAllComponents(ElSelect).find(c => c.props('placeholder') === '不限定角色')!.vm.$emit('update:modelValue', 'author'); await flushPromises();
    expect(new DOMWrapper(document.body).get('.bank-author-batch__counts').text()).toContain('命中用户2 人');
    expect(new DOMWrapper(document.body).get('.bank-author-batch__outcomes').text()).toContain('新增 1 人');
    expect(new DOMWrapper(document.body).get('.bank-author-batch__outcomes').text()).toContain('移除 1 人');
    let reject!: (error: Error) => void;
    api.grant.mockReturnValueOnce(new Promise((_, fail) => { reject = fail; })); api.revoke.mockResolvedValue({ changed: 1, skipped: 0, nonAuthor: 0, missing: 0 });
    button('批量授权').vm.$emit('click', new MouseEvent('click')); button('取消授权').vm.$emit('click', new MouseEvent('click')); await flushPromises();
    expect(api.grant).toHaveBeenCalledTimes(1); expect(api.revoke).not.toHaveBeenCalled();
    reject(new Error('offline')); await flushPromises();
    expect(new DOMWrapper(document.body).get('.bank-author-batch__outcomes').text()).toContain('新增 1 人');
    button('取消授权').vm.$emit('click', new MouseEvent('click')); await flushPromises();
    expect(api.revoke).toHaveBeenCalledWith('bank-1', { userIds: [], departmentId: 'root', includeSubDepartments: true, role: 'author' });
  });
  it('范围加载中与失败时不展示零人数或允许授权', async () => {
    let reject!: (error: Error) => void;
    api.users.mockReturnValue(new Promise((_, fail) => { reject = fail; }));
    await render();
    expect(new DOMWrapper(document.body).find('.bank-author-batch__counts').exists()).toBe(false);
    expect(button('批量授权').props('disabled')).toBe(true);
    reject(new Error('offline')); await flushPromises();
    expect(document.body.textContent).toContain('人员与科室加载失败');
    expect(new DOMWrapper(document.body).find('.bank-author-batch__counts').exists()).toBe(false);
    button('批量授权').vm.$emit('click', new MouseEvent('click')); await flushPromises();
    expect(api.grant).not.toHaveBeenCalled();
  });
});
