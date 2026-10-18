import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import ElementPlus from 'element-plus';
import RoleManagePage from './RoleManagePage.vue';
import MenuPermissionPage from './MenuPermissionPage.vue';
import type { MenuPermission, RoleDefinition } from '@/types';

const api = vi.hoisted(() => ({ load: vi.fn(), updatePermissions: vi.fn(), create: vi.fn(), update: vi.fn(), remove: vi.fn(), members: vi.fn(), replaceMembers: vi.fn(), users: vi.fn() }));
vi.mock('@/api/permissions', () => ({ getMenuPermissions: api.load, updateMenuPermissions: api.updatePermissions }));
vi.mock('@/api/roles', () => ({ rolesApi: { create: api.create, update: api.update, remove: api.remove, members: api.members, replaceMembers: api.replaceMembers } }));
vi.mock('@/api/users', () => ({ list: api.users }));
vi.mock('@/api/coreFeatures', () => ({ menuOverridesApi: { list: vi.fn().mockResolvedValue([]), replace: vi.fn() } }));

const role = (id: string, name: string, baseRole: RoleDefinition['baseRole'], menuKeys: string[], isBuiltin = false): RoleDefinition => ({
  id, name, baseRole, menuKeys, isBuiltin, memberCount: 0, description: '', createdAt: '2026-10-18T00:00:00Z', updatedAt: '2026-10-18T00:00:00Z',
});
const roles = [role('admin', '管理员', 'admin', ['roles'], true), role('author', '出题人', 'author', ['reviews'], true), role('examinee', '考生', 'examinee', ['my-exams'], true), role('teacher', '阅卷老师', 'author', [])];
const data: MenuPermission = {
  roles,
  grants: Object.fromEntries(roles.map(r => [r.id, r.menuKeys])),
  catalog: [
    { key: 'roles', name: '角色管理', defaultRoles: ['admin'], adminRequired: true },
    { key: 'reviews', name: '人工阅卷', defaultRoles: ['admin', 'author'], adminRequired: false },
    { key: 'my-exams', name: '我的考试', defaultRoles: ['examinee'], adminRequired: false },
  ],
};
let wrapper: VueWrapper;
const global = { plugins: [ElementPlus], stubs: { PageHeader: { props: ['title'], template: '<header><h1>{{ title }}</h1><slot name="actions" /></header>' } } };
beforeEach(() => {
  vi.clearAllMocks();
  api.load.mockResolvedValue(structuredClone(data));
  api.users.mockResolvedValue([]);
  api.create.mockResolvedValue(role('new', '新角色', 'examinee', ['my-exams']));
  api.members.mockResolvedValue([]);
  api.replaceMembers.mockResolvedValue([]);
  api.updatePermissions.mockImplementation(async grants => ({ ...structuredClone(data), grants }));
});
afterEach(() => { wrapper?.unmount(); document.body.innerHTML = ''; });

describe('角色管理页面交互', () => {
  it('显示角色清单，新增角色直接提交名称、基础身份和独立菜单', async () => {
    wrapper = mount(RoleManagePage, { attachTo: document.body, global });
    await flushPromises();
    expect(wrapper.text()).toContain('阅卷老师');
    expect(wrapper.text()).not.toContain('用户组');
    await wrapper.findAll('button').find(b => b.text() === '新增角色')!.trigger('click');
    await flushPromises();
    const nameInput = document.querySelector<HTMLInputElement>('input[maxlength="120"]')!;
    nameInput.value = '新角色'; nameInput.dispatchEvent(new Event('input', { bubbles: true }));
    await flushPromises();
    [...document.querySelectorAll<HTMLButtonElement>('.el-dialog__footer button')].find(b => b.textContent?.trim() === '保存')!.click();
    await flushPromises();
    expect(api.create).toHaveBeenCalledWith({ name: '新角色', baseRole: 'examinee', description: '', menuKeys: ['my-exams'] });
  });

  it('内置角色不可删除；自定义角色可打开并保存成员', async () => {
    wrapper = mount(RoleManagePage, { attachTo: document.body, global });
    await flushPromises();
    const rows = wrapper.findAll('.el-table__body tr');
    const builtin = rows.find(r => r.text().includes('管理员'))!;
    expect(builtin.findAll('button').find(b => b.text() === '删除')!.attributes()).toHaveProperty('disabled');
    const custom = rows.find(r => r.text().includes('阅卷老师'))!;
    await custom.findAll('button').find(b => b.text() === '成员')!.trigger('click');
    await flushPromises();
    expect(api.members).toHaveBeenCalledWith('teacher');
    expect(document.body.textContent).toContain('移出成员将回到对应身份的内置角色');
    [...document.querySelectorAll<HTMLButtonElement>('.el-dialog__footer button')].find(b => b.textContent?.trim() === '保存成员')!.click();
    await flushPromises();
    expect(api.replaceMembers).toHaveBeenCalledWith('teacher', []);
  });

  it('菜单权限页选择自定义角色并保存其菜单，包含全部动态角色', async () => {
    wrapper = mount(MenuPermissionPage, { attachTo: document.body, global });
    await flushPromises();
    await wrapper.findAll('.menu-permission-page__role').find(item => item.text().includes('阅卷老师'))!.trigger('click');
    await flushPromises();
    expect(wrapper.find('.role-menu-picker').text()).toContain('人工阅卷');
    expect(wrapper.find('.role-menu-picker').text()).not.toContain('角色管理');
    await wrapper.find('.role-menu-picker input[type=checkbox]').setValue(true);
    await wrapper.findAll('button').find(b => b.text() === '保存权限')!.trigger('click');
    await flushPromises();
    expect(api.updatePermissions).toHaveBeenCalledWith(expect.objectContaining({ teacher: ['reviews'], admin: ['roles'], author: ['reviews'], examinee: ['my-exams'] }));
  });
});
