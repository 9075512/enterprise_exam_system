import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import ElementPlus, { ElMessage } from 'element-plus';
import ProfilePage from './ProfilePage.vue';
import { useAuthStore } from '@/stores/auth';
import type { User } from '@/types';
const api = vi.hoisted(() => ({ fetchMe: vi.fn(), logout: vi.fn(), replace: vi.fn() }));
vi.mock('vue-router', () => ({ useRouter: () => ({ replace: api.replace }) }));
vi.mock('@/stores/auth', async () => { const { reactive } = await import('vue'); const state = reactive({ currentUser: null, fetchMe: api.fetchMe, logout: api.logout }); return { useAuthStore: () => state }; });
const user: User = { id: 'sample-user', username: 'sample_account', name: '完整姓名ABCDEFGHIJKLMNOPQRSTUVWXYZ', role: 'examinee', roleId: 'examinee', roleName: '考生', departmentId: 'sample-dept', departmentName: '长科室名称', positionId: 'sample-position', positionName: '完整岗位', email: 'sample@example.test', status: 'active', twoFactorEnabled: true, passwordChangedAt: '', createdAt: '2026-10-20T00:00:00Z' };
let wrapper: VueWrapper;
beforeEach(() => { vi.resetAllMocks(); useAuthStore().currentUser = { ...user }; });
afterEach(() => { wrapper?.unmount(); ElMessage.closeAll(); document.body.innerHTML = ''; vi.restoreAllMocks(); });
async function render() { wrapper = mount(ProfilePage, { attachTo: document.body, global: { plugins: [ElementPlus], stubs: { ChangePasswordDialog: true, AccountSecurityDialog: true } } }); await flushPromises(); }
describe('个人资料刷新与账号状态', () => {
  it('连续刷新只请求一次，失败保留资料并提示当前为旧信息', async () => {
    await render(); let fail!: (error: Error) => void; api.fetchMe.mockReturnValueOnce(new Promise((_resolve, reject) => { fail = reject; }));
    const refresh = wrapper.find('button[aria-label="刷新资料"]'); await refresh.trigger('click'); await refresh.trigger('click'); expect(api.fetchMe).toHaveBeenCalledOnce();
    fail(new Error('offline')); await flushPromises(); expect(wrapper.text()).toContain('当前显示上次读取的账号信息'); expect(wrapper.text()).toContain(user.name); expect(wrapper.text()).toContain('已开启');
  });
  it('认证层清空账号时不提示刷新成功，提供现有登录入口', async () => {
    const success = vi.spyOn(ElMessage, 'success'); await render(); api.fetchMe.mockImplementationOnce(async () => { useAuthStore().currentUser = null; });
    await wrapper.find('button[aria-label="刷新资料"]').trigger('click'); await flushPromises(); expect(success).not.toHaveBeenCalled(); expect(wrapper.text()).toContain('当前账号资料不可用');
    await wrapper.findAll('button').find(b => b.text() === '前往登录')!.trigger('click'); expect(api.replace).toHaveBeenCalledWith('/login');
  });
});
