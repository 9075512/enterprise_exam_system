import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { ElForm, ElFormItem, ElInput, ElButton, ElAlert } from 'element-plus';
import LoginPage from './LoginPage.vue';

const api = vi.hoisted(() => ({ login: vi.fn(), verify: vi.fn(), replace: vi.fn(), logout: vi.fn(), validate: vi.fn(), loadPublic: vi.fn() }));
vi.mock('vue-router', () => ({ useRoute: () => ({ query: {} }), useRouter: () => ({ replace: api.replace }) }));
vi.mock('@/stores/auth', () => ({ useAuthStore: () => ({ login: api.login, completeTwoFactor: api.verify, logout: api.logout }) }));
vi.mock('@/stores/settings', () => ({ useSettingsStore: () => ({ loadPublic: api.loadPublic, publicSettings: { systemName: '测试学习系统', systemShortName: '测试单位', copyright: '© 测试单位', loginSlogan: '学习进步' } }) }));
vi.mock('@/utils/appClient', () => ({ isLearnerAndroidApp: () => true }));
vi.mock('@/composables/useFormFocus', () => ({ validateAndFocus: api.validate }));

let wrapper: ReturnType<typeof mount>;
function render() {
  wrapper = mount(LoginPage, {
    attachTo: document.body,
    global: { components: { ElForm, ElFormItem, ElInput, ElButton, ElAlert }, stubs: { RouterLink: true, CaptchaImage: { template: '<span>图形验证码</span>', methods: { refresh() {} } } } },
  });
}
async function fillCredentials() {
  await wrapper.get('input[autocomplete="username"]').setValue('learner');
  await wrapper.get('input[autocomplete="current-password"]').setValue('test-password');
}
beforeEach(() => { vi.resetAllMocks(); api.validate.mockResolvedValue(true); api.replace.mockResolvedValue(undefined); });
afterEach(() => { wrapper?.unmount(); document.body.innerHTML = ''; });

describe('mobile login flow', () => {
  it('submits the form once while a login request is in flight', async () => {
    let complete!: (value: unknown) => void;
    api.login.mockReturnValue(new Promise((resolve) => { complete = resolve; }));
    render(); await fillCredentials();
    await wrapper.get('form').trigger('submit');
    await wrapper.get('form').trigger('submit');
    expect(api.login).toHaveBeenCalledTimes(1);
    complete({ user: { role: 'examinee' } });
    await flushPromises();
    expect(api.replace).toHaveBeenCalledWith('/exam/home');
  });

  it('keeps captcha requirements and inline failures visible', async () => {
    api.login.mockRejectedValue(Object.assign(new Error('请输入图形验证码'), { code: 1015 }));
    render(); await fillCredentials(); await wrapper.get('form').trigger('submit'); await flushPromises();
    expect(wrapper.text()).toContain('图形验证码');
    expect(wrapper.find('[role="alert"]').text()).toContain('请输入图形验证码');
    expect(wrapper.find('input[maxlength="6"]').exists()).toBe(true);
    expect(api.replace).not.toHaveBeenCalled();
  });

  it('continues through two-factor verification and can return to credentials', async () => {
    api.login.mockResolvedValue({ twoFactorRequired: true, challengeToken: 'challenge' });
    render(); await fillCredentials(); await wrapper.get('form').trigger('submit'); await flushPromises();
    expect(wrapper.get('.login__title-mobile').text()).toBe('两步验证');
    await wrapper.get('input[autocomplete="one-time-code"]').setValue('ABCDE-FGHIJ');
    api.verify.mockResolvedValue({ user: { role: 'examinee' } });
    await wrapper.get('form').trigger('submit'); await flushPromises();
    expect(api.verify).toHaveBeenCalledWith('challenge', 'ABCDE-FGHIJ');
    await wrapper.get('.login__back').trigger('click');
    expect(wrapper.find('input[autocomplete="username"]').exists()).toBe(true);
  });
});
