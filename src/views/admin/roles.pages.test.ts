import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import ElementPlus from 'element-plus';
import RoleManagePage from './RoleManagePage.vue';
import MenuPermissionPage from './MenuPermissionPage.vue';
import type { MenuPermission, RoleDefinition } from '@/types';

const api = vi.hoisted(() => ({ load: vi.fn(), updatePermissions: vi.fn(), create: vi.fn(), update: vi.fn(), remove: vi.fn(), members: vi.fn(), replaceMembers: vi.fn(), users: vi.fn(), overridesList: vi.fn(), overridesReplace: vi.fn() }));
vi.mock('@/api/permissions', () => ({ getMenuPermissions: api.load, updateMenuPermissions: api.updatePermissions }));
vi.mock('@/api/roles', () => ({ rolesApi: { create: api.create, update: api.update, remove: api.remove, members: api.members, replaceMembers: api.replaceMembers } }));
vi.mock('@/api/users', () => ({ list: api.users }));
vi.mock('@/api/coreFeatures', () => ({ menuOverridesApi: { list: api.overridesList, replace: api.overridesReplace } }));

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
  api.overridesList.mockResolvedValue([]);
  api.overridesReplace.mockResolvedValue([]);
  api.create.mockResolvedValue(role('new', '新角色', 'examinee', ['my-exams']));
  api.members.mockResolvedValue([]);
  api.replaceMembers.mockResolvedValue([]);
  api.updatePermissions.mockImplementation(async grants => ({ ...structuredClone(data), grants }));
});
afterEach(() => { wrapper?.unmount(); document.body.innerHTML = ''; });

describe('角色管理页面交互', () => {
  it('成员加载失败保持弹窗并阻止覆盖，重试成功后保留内置成员限制', async () => {
    api.members.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(['u1']);
    api.users.mockResolvedValue([{ id: 'u1', name: '原管理员', username: 'original', roleName: '管理员' }]);
    wrapper = mount(RoleManagePage, { attachTo: document.body, global }); await flushPromises();
    const row = wrapper.findAll('.el-table__body tr').find(r => r.text().includes('管理员'))!;
    await row.findAll('button').find(b => b.text() === '成员')!.trigger('click'); await flushPromises();
    expect(document.body.textContent).toContain('角色成员加载失败');
    const save = () => [...document.querySelectorAll<HTMLButtonElement>('.el-drawer__footer button')].find(b => b.textContent?.trim() === '保存成员')!;
    expect(save().disabled).toBe(true);
    [...document.querySelectorAll<HTMLButtonElement>('button')].find(b => b.textContent?.trim() === '重新加载')!.click(); await flushPromises();
    expect(wrapper.findComponent({ name: 'ElSelect' }).props('modelValue')).toEqual(['u1']);
    expect(wrapper.findComponent({ name: 'ElOption' }).props('disabled')).toBe(true);
    save().click(); await flushPromises();
    expect(api.replaceMembers).toHaveBeenCalledWith('admin', ['u1']);
  });

  it('切换角色只接收最新成员响应', async () => {
    let old!: (value: string[]) => void;
    api.members.mockImplementation((id: string) => id === 'admin' ? new Promise(resolve => { old = resolve; }) : Promise.resolve(['teacher-user']));
    wrapper = mount(RoleManagePage, { attachTo: document.body, global }); await flushPromises();
    const open = async (name: string) => {
      await wrapper.findAll('.el-table__body tr').find(r => r.text().includes(name))!.findAll('button').find(b => b.text() === '成员')!.trigger('click');
      await flushPromises();
    };
    await open('管理员');
    wrapper.findAllComponents({ name: 'ElDrawer' }).find(d => d.props('title') === '分配角色成员')!.vm.$emit('update:modelValue', false);
    await flushPromises(); await open('阅卷老师');
    old(['old-admin']); await flushPromises();
    expect(wrapper.findComponent({ name: 'ElSelect' }).props('modelValue')).toEqual(['teacher-user']);
    [...document.querySelectorAll<HTMLButtonElement>('.el-drawer__footer button')].find(b => b.textContent?.trim() === '保存成员')!.click(); await flushPromises();
    expect(api.replaceMembers).toHaveBeenCalledWith('teacher', ['teacher-user']);
  });
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
    [...document.querySelectorAll<HTMLButtonElement>('.el-drawer__footer button')].find(b => b.textContent?.trim() === '保存')!.click();
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
    [...document.querySelectorAll<HTMLButtonElement>('.el-drawer__footer button')].find(b => b.textContent?.trim() === '保存成员')!.click();
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


describe('权限页的加载保护', () => {
  it('个人例外默认继承，管理员必授项不可拒绝；失败保留选择并锁定保存期间的切换', async () => {
    api.users.mockResolvedValue([{ id: 'u', name: '管理员甲', username: 'admin', role: 'admin' }]);
    let reject!: (error: Error) => void;
    api.overridesReplace.mockReturnValueOnce(new Promise((_, r) => { reject = r; }));
    wrapper = mount(MenuPermissionPage, { attachTo: document.body, global }); await flushPromises();
    const select = wrapper.findComponent({ name: 'ElSelect' });
    select.vm.$emit('update:modelValue', 'u'); select.vm.$emit('change', 'u'); await flushPromises();
    const radios = wrapper.findAllComponents({ name: 'ElRadioGroup' });
    expect(radios.every(r => r.props('modelValue') === '')).toBe(true);
    const required = wrapper.findAll('.menu-permission-page__override-item').find(r => r.text().includes('角色管理'))!;
    expect(required.findAll('input').at(-1)!.attributes()).toHaveProperty('disabled');
    const review = wrapper.findAll('.menu-permission-page__override-item').find(r => r.text().includes('人工阅卷'))!;
    review.findComponent({ name: 'ElRadioGroup' }).vm.$emit('update:modelValue', 'allow'); await flushPromises();
    await wrapper.findAll('button').find(b => b.text() === '保存个人例外')!.trigger('click'); await flushPromises();
    expect(select.props('disabled')).toBe(true);
    expect(wrapper.findAll('.menu-permission-page__override-item input').every(input => (input.element as HTMLInputElement).disabled)).toBe(true);
    await wrapper.findAll('.menu-permission-page__role').find(r => r.text().includes('阅卷老师'))!.trigger('click');
    expect(wrapper.find('.menu-permission-page__role.is-active').text()).toContain('管理员');
    reject(new Error('offline')); await flushPromises();
    expect(wrapper.text()).toContain('个人例外选择已保留');
    expect(review.findComponent({ name: 'ElRadioGroup' }).props('modelValue')).toBe('allow');
    await wrapper.findAll('button').find(b => b.text() === '保存个人例外')!.trigger('click'); await flushPromises();
    expect(api.overridesReplace).toHaveBeenLastCalledWith('u', [{ menuKey: 'reviews', effect: 'allow' }]);
  });

  it('角色保存失败保留草稿，处理中禁止修改和切换角色', async () => {
    let reject!: (error: Error) => void;
    api.updatePermissions.mockReturnValueOnce(new Promise((_, r) => { reject = r; }));
    wrapper = mount(MenuPermissionPage, { attachTo: document.body, global }); await flushPromises();
    await wrapper.findAll('.menu-permission-page__role').find(r => r.text().includes('阅卷老师'))!.trigger('click');
    await wrapper.find('.role-menu-picker input[type=checkbox]').setValue(true);
    await wrapper.findAll('button').find(b => b.text() === '保存权限')!.trigger('click'); await flushPromises();
    expect(wrapper.find('.role-menu-picker input').attributes()).toHaveProperty('disabled');
    await wrapper.findAll('.menu-permission-page__role').find(r => r.text().includes('管理员'))!.trigger('click');
    expect(wrapper.find('.menu-permission-page__role.is-active').text()).toContain('阅卷老师');
    reject(new Error('offline')); await flushPromises();
    expect(wrapper.text()).toContain('各角色的菜单选择已保留');
    expect((wrapper.find('.role-menu-picker input').element as HTMLInputElement).checked).toBe(true);
  });

  it('权限数据失败显示重试，阻止保存未知授权', async () => {
    api.load.mockRejectedValue(new Error('offline'));
    wrapper = mount(MenuPermissionPage, { attachTo: document.body, global });
    await flushPromises();
    expect(wrapper.text()).toContain('菜单权限加载失败');
    expect(wrapper.findAll('button').find(b => b.text() === '保存权限')!.attributes()).toHaveProperty('disabled');
    expect(api.updatePermissions).not.toHaveBeenCalled();
  });

  it('快速切换用户只采用最后一人的例外权限', async () => {
    api.users.mockResolvedValue([{ id: 'first', name: '甲', username: 'first', role: 'author' }, { id: 'second', name: '乙', username: 'second', role: 'author' }]);
    let first!: (value: unknown) => void;
    let second!: (value: unknown) => void;
    api.overridesList.mockImplementation((id: string) => new Promise(resolve => { if (id === 'first') first = resolve; else second = resolve; }));
    wrapper = mount(MenuPermissionPage, { attachTo: document.body, global });
    await flushPromises();
    const select = wrapper.findComponent({ name: 'ElSelect' });
    select.vm.$emit('update:modelValue', 'first'); select.vm.$emit('change', 'first'); await flushPromises();
    select.vm.$emit('update:modelValue', 'second'); select.vm.$emit('change', 'second'); await flushPromises();
    second([{ menuKey: 'reviews', effect: 'deny' }]); await flushPromises();
    first([{ menuKey: 'reviews', effect: 'allow' }]); await flushPromises();
    await wrapper.findAll('button').find(b => b.text() === '保存个人例外')!.trigger('click'); await flushPromises();
    expect(api.overridesReplace).toHaveBeenCalledWith('second', [{ menuKey: 'reviews', effect: 'deny' }]);
  });
});
