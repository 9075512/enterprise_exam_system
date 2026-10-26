import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import AppDownloadPage from './AppDownloadPage.vue';
const api = vi.hoisted(() => ({ latest: vi.fn() }));
vi.mock('@/api/apps', async importOriginal => ({ ...await importOriginal<typeof import('@/api/apps')>(), latestApp: api.latest }));
vi.mock('qrcode', () => ({ default: { toDataURL: vi.fn().mockResolvedValue('data:image/png;base64,test') } }));
vi.mock('@/stores/settings', () => ({ useSettingsStore: () => ({ loadPublic: vi.fn().mockResolvedValue(undefined), publicSettings: { copyright: '测试单位' } }) }));
let wrapper: ReturnType<typeof mount>;
function render() { wrapper = mount(AppDownloadPage, { global: { stubs: { RouterLink: { props: ['to'], template: '<a :href="to"><slot /></a>' } } } }); }
beforeEach(() => vi.clearAllMocks());
afterEach(() => wrapper?.unmount());
describe('public App download page', () => {
  it('uses the selected brand showcase with a real phone preview and no selection controls', async () => {
    api.latest.mockResolvedValue(null); render(); await flushPromises();
    expect(wrapper.get('[data-ui-page="AppDownloadPage"]').attributes('data-download-design')).toBe('b');
    expect(wrapper.find('.dl-b__hero').exists()).toBe(true);
    expect(wrapper.get('h1').text()).toBe('随时启程，学有所成。');
    expect(wrapper.find('.download-preview').exists()).toBe(false);
    expect(wrapper.get('.dl-phone img').attributes('src')).toBe('/app/login-preview.jpg');
    expect(wrapper.find('.dl-a__card').exists()).toBe(false);
    expect(api.latest).toHaveBeenCalledTimes(1);
  });
  it('renders only a published API version and escapes release notes', async () => {
    api.latest.mockResolvedValue({ id: 'test', appName: '卓达学习', versionName: '1.0.2', fileSize: 28573, minAndroid: '8.0', publishedAt: '2026-10-23T00:00:00Z', releaseNotes: '<script>alert(1)</script>\n优化手机登录', sha256: 'abc', downloadUrl: '/api/apps/releases/test/download' });
    render(); await flushPromises();
    expect(wrapper.get('.dl-button').attributes('href')).toBe('/api/apps/releases/test/download');
    expect(wrapper.text()).toContain('v1.0.2');
    expect(wrapper.find('.dl-release script').exists()).toBe(false);
    expect(wrapper.text()).toContain('<script>alert(1)</script>');
  });
  it('does not offer a fake package when no version has been published', async () => {
    api.latest.mockResolvedValue(null); render(); await flushPromises();
    expect(wrapper.get('.dl-button').attributes('aria-disabled')).toBe('true');
    expect(wrapper.get('.dl-button').attributes('href')).toBeUndefined();
    expect(wrapper.text()).toContain('安装包待发布');
  });
  it('shows a retry action after an API failure and recovers', async () => {
    api.latest.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(null);
    render(); await flushPromises(); expect(wrapper.find('[role="alert"]').exists()).toBe(true);
    await wrapper.get('.dl-error button').trigger('click'); await flushPromises();
    expect(wrapper.find('[role="alert"]').exists()).toBe(false);
    expect(api.latest).toHaveBeenCalledTimes(2);
  });
});
