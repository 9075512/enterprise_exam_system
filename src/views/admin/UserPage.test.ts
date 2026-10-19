import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DOMWrapper, flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import ElementPlus, { ElButton, ElForm } from 'element-plus';
import UserPage from './UserPage.vue';
const api = vi.hoisted(() => ({ list: vi.fn(), update: vi.fn(), create: vi.fn(), departments: vi.fn(), roles: vi.fn(), positions: vi.fn() }));
vi.mock('@/api/users', () => ({ list: api.list, update: api.update, create: api.create }));
vi.mock('@/api/departments', () => ({ list: api.departments }));
vi.mock('@/api/roles', () => ({ rolesApi: { list: api.roles } }));
vi.mock('@/api/coreFeatures', () => ({ positionsApi: { list: api.positions } }));
vi.mock('@/stores/settings', () => ({ useSettingsStore: () => ({ load: async () => {}, settings: { minPasswordLength: 6, defaultPassword: 'sample-password' } }) }));
let wrapper: VueWrapper;
const user = { id: 'u1', username: 'sample_user', name: '原有用户', role: 'examinee', roleId: 'examinee', roleName: '考生', positionId: 'p1', positionName: '岗位', departmentId: 'd1', departmentName: '科室', status: 'active', email: 'sample@example.test', createdAt: '' };
beforeEach(() => { vi.resetAllMocks(); api.list.mockResolvedValue([user]); api.roles.mockResolvedValue([{ id: 'examinee', name: '考生', baseRole: 'examinee' }]); api.positions.mockResolvedValue([{ id: 'p1', name: '岗位' }]); api.departments.mockResolvedValue([{ id: 'd1', name: '科室', parentId: null }]); });
afterEach(() => { vi.restoreAllMocks(); wrapper?.unmount(); document.body.innerHTML = ''; });
async function render() { wrapper = mount(UserPage, { attachTo: document.body, global: { plugins: [ElementPlus], stubs: { TableDensityToggle: true, UserImportDialog: true } } }); await flushPromises(); }
const button = (name: string) => wrapper.findAllComponents(ElButton).find(b => b.text() === name)!;
describe('用户编辑提交保护', () => {
  it('异步校验和请求期间连续点击只提交一次，失败保留账号、角色和科室', async () => {
    await render(); button('编辑').vm.$emit('click', new MouseEvent('click')); await flushPromises();
    let validate!: (value: boolean) => void; let reject!: (error: Error) => void;
    const validator = vi.spyOn(wrapper.getComponent(ElForm).vm.$.exposed as { validate: () => Promise<boolean> }, 'validate').mockReturnValueOnce(new Promise(resolve => { validate = resolve; })).mockResolvedValue(true);
    api.update.mockReturnValueOnce(new Promise((_, fail) => { reject = fail; })).mockResolvedValueOnce(user);
    button('保存').vm.$emit('click', new MouseEvent('click')); button('保存').vm.$emit('click', new MouseEvent('click')); await flushPromises();
    expect(validator).toHaveBeenCalledTimes(1); expect(api.update).not.toHaveBeenCalled();
    validate(true); await flushPromises();
    expect(api.update).toHaveBeenCalledTimes(1);
    expect(api.update).toHaveBeenCalledWith('u1', expect.objectContaining({ roleId: 'examinee', role: 'examinee', departmentId: 'd1', positionId: 'p1', username: 'sample_user' }));
    expect(wrapper.getComponent(ElForm).props('disabled')).toBe(true);
    reject(new Error('offline')); await flushPromises();
    expect(wrapper.getComponent(ElForm).props('disabled')).toBe(false);
    expect(new DOMWrapper(document.body).get('.user-page__form input').element).toHaveProperty('value', 'sample_user');
    button('保存').vm.$emit('click', new MouseEvent('click')); await flushPromises();
    expect(api.update).toHaveBeenCalledTimes(2);
  });
  it('考生缺少科室时不创建，并保留必填校验规则', async () => {
    await render(); button('新建用户').vm.$emit('click', new MouseEvent('click')); await flushPromises();
    await new DOMWrapper(document.body).get('input[placeholder="3~20 位字母/数字/下划线"]').setValue('sample_new');
    await new DOMWrapper(document.body).get('input[placeholder="请输入姓名"]').setValue('模拟用户');
    vi.spyOn(wrapper.getComponent(ElForm).vm.$.exposed as { validate: () => Promise<boolean> }, 'validate').mockResolvedValue(true);
    await (wrapper.vm as unknown as { handleSubmit: () => Promise<void> }).handleSubmit(); await flushPromises();
    expect(api.create).not.toHaveBeenCalled();
    expect(wrapper.getComponent(ElForm).props('model')).toMatchObject({ username: 'sample_new', departmentId: '', roleId: 'examinee' });
    expect(wrapper.getComponent(ElForm).props('rules')?.username).toEqual(expect.arrayContaining([expect.objectContaining({ required: true })]));
  });
});
