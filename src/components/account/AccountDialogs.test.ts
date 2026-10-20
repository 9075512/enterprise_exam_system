import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { createPinia } from 'pinia';
import ElementPlus, { ElDialog, ElMessageBox } from 'element-plus';
import { useAuthStore } from '@/stores/auth';
import type { User } from '@/types';
import AccountSecurityDialog from './AccountSecurityDialog.vue';
import ChangePasswordDialog from './ChangePasswordDialog.vue';

const api = vi.hoisted(() => ({ policy: vi.fn(), sessions: vi.fn(), setup: vi.fn(), enable: vi.fn(), disable: vi.fn(), regenerate: vi.fn(), revoke: vi.fn(), revokeOthers: vi.fn(), change: vi.fn(), me: vi.fn() }));
vi.mock('@/api/auth', () => ({ twoFactorPolicy: api.policy, listSessions: api.sessions, setupTwoFactor: api.setup, enableTwoFactor: api.enable, disableTwoFactor: api.disable, regenerateRecoveryCodes: api.regenerate, revokeSession: api.revoke, revokeOtherSessions: api.revokeOthers, changePassword: api.change, fetchMe: api.me }));
let wrapper: VueWrapper;
const user = { id: 'admin', name: '管理员', username: 'admin', role: 'admin', twoFactorEnabled: false } as User;
const policy = { text: '至少 8 位', expireDays: 90, recoveryCodesRemaining: 8 };
function render(component: typeof AccountSecurityDialog | typeof ChangePasswordDialog, enabled = false) {
  const pinia = createPinia(); useAuthStore(pinia).currentUser = { ...user, twoFactorEnabled: enabled };
  wrapper = mount(component, { props: { modelValue: false }, attachTo: document.body, global: { plugins: [pinia, ElementPlus] } });
  return wrapper.setProps({ modelValue: true });
}
function button(text: string): HTMLButtonElement { return [...document.querySelectorAll<HTMLButtonElement>('button')].find(b => b.textContent?.trim() === text)!; }
function input(placeholder: string, value: string) {
  const field = document.querySelector<HTMLInputElement>(`input[placeholder="${placeholder}"]`)!;
  field.value = value; field.dispatchEvent(new Event('input', { bubbles: true }));
}
beforeEach(() => {
  vi.resetAllMocks(); api.policy.mockResolvedValue(policy); api.sessions.mockResolvedValue([]); api.me.mockResolvedValue(user);
});
afterEach(() => { wrapper?.unmount(); document.body.innerHTML = ''; vi.restoreAllMocks(); });

describe('账号弹窗的错误恢复与提交保护', () => {
  it('请求失败不会宣称无有效期、零恢复码或无设备，重试显示真实范围', async () => {
    api.policy.mockRejectedValueOnce(new Error('offline')); api.sessions.mockRejectedValueOnce(new Error('offline'));
    await render(AccountSecurityDialog, true); await flushPromises();
    expect(document.body.textContent).toContain('密码策略与恢复码数量加载失败');
    expect(document.body.textContent).toContain('登录设备加载失败');
    expect(document.body.textContent).not.toContain('密码未设置有效期');
    expect(document.body.textContent).not.toContain('暂无有效登录设备');
    expect(document.body.textContent).toContain('— / 10');
    expect(button('下线其他设备').disabled).toBe(true);
    const retry = [...document.querySelectorAll<HTMLButtonElement>('button')].filter(b => b.textContent?.trim() === '重新加载');
    retry.forEach(b => b.click()); await flushPromises();
    expect(document.body.textContent).toContain('密码有效期为 90 天');
    expect(document.body.textContent).toContain('8 / 10');
    expect(document.body.textContent).toContain('暂无有效登录设备');
    expect(api.revokeOthers).not.toHaveBeenCalled();
  });

  it('重新打开安全弹窗时，旧会话请求不能覆盖当前列表', async () => {
    let old!: (value: unknown[]) => void;
    api.sessions.mockReturnValueOnce(new Promise(resolve => { old = resolve; }))
      .mockResolvedValueOnce([{ id: 'new', userAgent: 'Chrome/1 Windows NT', current: true, ip: 'new-ip', lastSeenAt: '2026-10-19T00:00:00Z' }]);
    await render(AccountSecurityDialog); await flushPromises();
    await wrapper.setProps({ modelValue: false }); await flushPromises();
    await wrapper.setProps({ modelValue: true }); await flushPromises();
    old([{ id: 'old', userAgent: '', ip: 'old-ip' }]); await flushPromises();
    expect(document.body.textContent).toContain('new-ip');
    expect(document.body.textContent).not.toContain('old-ip');
    expect(document.body.textContent).toContain('1 台设备');
  });

  it('恢复码二次确认期间阻止重复提交与关闭，取消不调用接口', async () => {
    let cancel!: (reason: Error) => void;
    vi.spyOn(ElMessageBox, 'confirm').mockImplementation(() => new Promise((_, reject) => { cancel = reject; }));
    await render(AccountSecurityDialog, true); await flushPromises();
    const passwords = document.querySelectorAll<HTMLInputElement>('input[placeholder="登录密码"]');
    const codes = document.querySelectorAll<HTMLInputElement>('input[placeholder="6 位验证码"]');
    passwords[1]!.value = 'mock-password'; passwords[1]!.dispatchEvent(new Event('input', { bubbles: true }));
    codes[1]!.value = '123456'; codes[1]!.dispatchEvent(new Event('input', { bubbles: true }));
    button('重新生成').click(); button('重新生成').click(); await flushPromises();
    expect(ElMessageBox.confirm).toHaveBeenCalledTimes(1);
    expect(wrapper.getComponent(ElDialog).props('closeOnPressEscape')).toBe(false);
    expect(button('关闭').disabled).toBe(true);
    cancel(new Error('cancel')); await flushPromises();
    expect(api.regenerate).not.toHaveBeenCalled();
    expect(button('关闭').disabled).toBe(false);
  });

  it('开启验证失败保留验证码，重试仍沿用原接口，关闭清除密钥', async () => {
    api.setup.mockResolvedValue({ secret: 'mock-secret', otpauthUrl: 'otpauth://mock' });
    api.enable.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({ recoveryCodes: ['code-one', 'code-two'] });
    api.me.mockResolvedValue({ ...user, twoFactorEnabled: true });
    await render(AccountSecurityDialog); await flushPromises();
    button('开启两步验证').click(); await flushPromises();
    input('6 位验证码', '123456'); button('确认开启').click(); await flushPromises();
    expect(document.querySelector<HTMLInputElement>('input[placeholder="6 位验证码"]')?.value).toBe('123456');
    button('确认开启').click(); await flushPromises();
    expect(api.enable).toHaveBeenCalledTimes(2);
    expect(api.enable).toHaveBeenLastCalledWith('123456');
    expect(document.body.textContent).toContain('code-one');
    await wrapper.setProps({ modelValue: false }); await wrapper.setProps({ modelValue: true }); await flushPromises();
    expect(document.body.textContent).not.toContain('code-one');
    expect(document.body.textContent).not.toContain('mock-secret');
  });

  it('修改密码阻止重复请求，失败保留草稿，成功正常关闭', async () => {
    let fail!: (error: Error) => void;
    api.change.mockReturnValueOnce(new Promise((_, reject) => { fail = reject; })).mockResolvedValueOnce(null);
    await render(ChangePasswordDialog); await flushPromises();
    const fields = document.querySelectorAll<HTMLInputElement>('.el-dialog input');
    ['old-password', 'new-password-123', 'new-password-123'].forEach((value, index) => {
      fields[index]!.value = value; fields[index]!.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await flushPromises();
    button('确定').click(); button('确定').click(); await flushPromises();
    expect(api.change).toHaveBeenCalledTimes(1);
    expect(wrapper.getComponent(ElDialog).props('showClose')).toBe(false);
    fail(new Error('offline')); await flushPromises();
    expect(fields[1]!.value).toBe('new-password-123');
    button('确定').click(); await flushPromises();
    expect(api.change).toHaveBeenCalledTimes(2);
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([false]);
  });
});


describe('账号弹窗的剩余边界', () => {
  it('修改密码不一致在字段下显示错误，不发送请求并保留输入', async () => {
    await render(ChangePasswordDialog); await flushPromises();
    const fields = document.querySelectorAll<HTMLInputElement>('.el-dialog input');
    ['old-password', 'new-password-123', 'different-password'].forEach((value, i) => { fields[i]!.value = value; fields[i]!.dispatchEvent(new Event('input', { bubbles: true })); });
    await flushPromises(); expect(wrapper.findComponent({ name: 'ElForm' }).props('model').confirmPassword).toBe('different-password'); button('确定').click(); await flushPromises();
    expect(api.change).not.toHaveBeenCalled();
    await vi.waitFor(() => expect(document.querySelector('.el-form-item__error')?.textContent).toContain('两次输入的密码不一致'));
    expect(fields[2]!.value).toBe('different-password');
    expect(button('取消').disabled).toBe(false);
  });

  it('设备确认期间锁定安全操作，取消后恢复；当前设备没有下线入口', async () => {
    api.sessions.mockResolvedValue([
      { id: 'here', userAgent: 'iPhone Mac OS X Safari/1', current: true, ip: '2001:db8::1', lastSeenAt: '2026-10-20T00:00:00Z' },
      { id: 'other', userAgent: 'Chrome/1 Windows NT', current: false, ip: '2001:db8::2', lastSeenAt: '2026-10-20T00:00:00Z' },
    ]);
    let cancel!: (reason: Error) => void;
    vi.spyOn(ElMessageBox, 'confirm').mockImplementation(() => new Promise((_, reject) => { cancel = reject; }));
    await render(AccountSecurityDialog); await flushPromises();
    expect(document.querySelector('.security__device-head')?.textContent).toContain('iOS · Safari');
    expect(document.querySelectorAll('.security__device')[0]?.querySelector('button')).toBeNull();
    button('下线设备').click(); button('下线设备').click(); await flushPromises();
    expect(ElMessageBox.confirm).toHaveBeenCalledTimes(1);
    expect(button('开启两步验证').disabled).toBe(true);
    expect(button('关闭').disabled).toBe(true);
    cancel(new Error('cancel')); await flushPromises();
    expect(button('开启两步验证').disabled).toBe(false);
    expect(api.revoke).not.toHaveBeenCalled();
  });

  it('安全操作期间禁用设备入口，失败显示原位错误，不清除验证码', async () => {
    api.sessions.mockResolvedValue([{ id: 'other', userAgent: '', current: false, ip: 'test-ip', lastSeenAt: '2026-10-20T00:00:00Z' }]);
    let fail!: (error: Error) => void;
    api.setup.mockReturnValueOnce(new Promise((_, reject) => { fail = reject; }));
    await render(AccountSecurityDialog); await flushPromises();
    button('开启两步验证').click(); await flushPromises();
    expect(button('下线其他设备').disabled).toBe(true);
    expect(button('下线设备').disabled).toBe(true);
    fail(new Error('offline')); await flushPromises();
    expect(document.querySelector('[role="alert"]')?.textContent).toContain('密钥生成失败，请重试');
    expect(button('关闭').disabled).toBe(false);
  });
});


describe('密码原有必填和长度规则', () => {
  it('空旧密码和过短新密码不能提交', async () => {
    await render(ChangePasswordDialog); await flushPromises();
    const fields = document.querySelectorAll<HTMLInputElement>('.el-dialog input');
    ['', '123', '123'].forEach((value, i) => { fields[i]!.value = value; fields[i]!.dispatchEvent(new Event('input', { bubbles: true })); });
    await flushPromises(); button('确定').click(); await flushPromises();
    expect(api.change).not.toHaveBeenCalled();
  });
});
