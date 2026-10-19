import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import ElementPlus, { ElButton, ElOption, ElSelect } from 'element-plus';
import RoleManagePage from './RoleManagePage.vue';
const api = vi.hoisted(() => ({ permissions: vi.fn(), users: vi.fn(), members: vi.fn(), replaceMembers: vi.fn() }));
vi.mock('@/api/permissions', () => ({ getMenuPermissions: api.permissions }));
vi.mock('@/api/users', () => ({ list: api.users }));
vi.mock('@/api/roles', () => ({ rolesApi: { members: api.members, replaceMembers: api.replaceMembers } }));
let wrapper: VueWrapper;
const role = { id: 'custom', name: '完整的业务角色名称ABCDEFGHIJKLMNOPQRSTUVWXYZ', baseRole: 'author', description: '', isBuiltin: false, memberCount: 1, menuKeys: [] };
beforeEach(() => { vi.resetAllMocks(); api.permissions.mockResolvedValue({ roles: [role], catalog: [] }); api.members.mockResolvedValue(['a']); api.users.mockResolvedValue([{ id: 'a', name: '原有成员', username: 'author_account', roleName: '原角色' }, { id: 'b', name: '新增成员完整名称', username: 'long_account', roleName: '考生' }]); });
afterEach(() => { wrapper?.unmount(); document.body.innerHTML = ''; });
async function openMembers() { wrapper = mount(RoleManagePage, { attachTo: document.body, global: { plugins: [ElementPlus] } }); await flushPromises(); wrapper.findAllComponents(ElButton).find(b => b.text() === '成员')!.vm.$emit('click', new MouseEvent('click')); await flushPromises(); }
describe('角色成员维护', () => {
  it('完整清单与新增移出数量来自当前选择，保存失败保留，重复点击仅发一次', async () => {
    await openMembers();
    expect(wrapper.text()).toContain(role.name);
    wrapper.getComponent(ElSelect).vm.$emit('update:modelValue', ['a', 'b']); await flushPromises();
    expect(wrapper.get('.member-scope').text()).toContain('当前选择 2 人 · 新增 1 人 · 移出 0 人');
    expect(wrapper.get('.member-list').text()).toContain('新增成员完整名称');
    let rejectSave!: (error: Error) => void;
    api.replaceMembers.mockReturnValueOnce(new Promise((_, reject) => { rejectSave = reject; })).mockResolvedValueOnce(['a', 'b']);
    const save = () => wrapper.findAllComponents(ElButton).find(b => b.text() === '保存成员')!;
    save().vm.$emit('click', new MouseEvent('click')); save().vm.$emit('click', new MouseEvent('click')); await flushPromises();
    expect(api.replaceMembers).toHaveBeenCalledTimes(1);
    expect(api.replaceMembers).toHaveBeenCalledWith('custom', ['a', 'b']);
    expect(wrapper.getComponent(ElSelect).props('disabled')).toBe(true);
    rejectSave(new Error('offline')); await flushPromises();
    expect(wrapper.get('.member-list').text()).toContain('新增成员完整名称');
    save().vm.$emit('click', new MouseEvent('click')); await flushPromises();
    expect(api.replaceMembers).toHaveBeenCalledTimes(2);
  });
  it('内置角色原有成员保持禁选，成员加载失败不显示空清单', async () => {
    api.permissions.mockResolvedValue({ roles: [{ ...role, isBuiltin: true }], catalog: [] });
    await openMembers();
    expect(wrapper.findAllComponents(ElOption).find(o => o.props('value') === 'a')?.props('disabled')).toBe(true);
    expect(wrapper.get('.member-list').text()).toContain('内置角色原成员保留');
    wrapper.unmount();
    api.members.mockRejectedValue(new Error('offline'));
    await openMembers();
    expect(wrapper.text()).toContain('角色成员加载失败');
    expect(wrapper.find('.member-scope').exists()).toBe(false);
  });
});
