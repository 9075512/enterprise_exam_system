import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import DownloadDesign from './DownloadDesign.vue';
import type { AppRelease } from '@/api/apps';
import type { DownloadDesignId } from './designs';

const api = vi.hoisted(() => ({ latest: vi.fn(), qr: vi.fn(), brand: vi.fn() }));
vi.mock('@/api/apps', async importOriginal => ({ ...await importOriginal<typeof import('@/api/apps')>(), latestApp: api.latest }));
vi.mock('qrcode', () => ({ default: { toDataURL: api.qr } }));
vi.mock('@/stores/settings', () => ({ useSettingsStore: () => ({ loadPublic: api.brand, publicSettings: { copyright: '测试单位' } }) }));
const release: AppRelease = {
  id: 'real-release', appName: '卓达学习', versionName: '1.2.3', versionCode: 10203, minAndroid: '8.0',
  releaseNotes: '<script>alert(1)</script>\n- 优化手机学习体验', fileSize: 12 * 1024 * 1024, sha256: 'a'.repeat(64),
  status: 'published', revision: 1, downloadCount: 0, createdAt: '2026-10-20T00:00:00Z', publishedAt: '2026-10-23T00:00:00Z',
  downloadUrl: '/api/apps/releases/real-release/download',
};
let wrapper: ReturnType<typeof mount>;
function render(design: DownloadDesignId) {
  wrapper = mount(DownloadDesign, { props: { design }, global: { stubs: { RouterLink: { props: ['to'], template: '<a :href="to"><slot /></a>' } } } });
}
beforeEach(() => {
  vi.clearAllMocks();
  api.latest.mockResolvedValue(release);
  api.qr.mockResolvedValue('data:image/png;base64,test');
  api.brand.mockResolvedValue(undefined);
});
afterEach(() => { wrapper?.unmount(); vi.restoreAllMocks(); });

describe.each(['a', 'b', 'c', 'd', 'e'] as const)('下载页方案 %s', design => {
  it('uses the published release and a QR linking to the official page; notes stay plain text', async () => {
    render(design); await flushPromises();
    expect(wrapper.get('.dl-button').attributes('href')).toBe(release.downloadUrl);
    expect(wrapper.text()).toContain('v1.2.3');
    expect(wrapper.text()).toContain('12.0 MB');
    expect(wrapper.text()).toContain('<script>alert(1)</script>');
    expect(wrapper.find('.dl-release script').exists()).toBe(false);
    expect(api.qr).toHaveBeenCalledWith(`${location.origin}/download`, expect.any(Object));
    expect(wrapper.get('.dl-qr__url').attributes('href')).toBe(`${location.origin}/download`);
    expect(wrapper.get('.dl-web').attributes('href')).toBe('/login');
    expect(wrapper.find('#installation').exists()).toBe(true);
  });
  it('does not expose a download while loading or when no package exists', async () => {
    let resolveRelease!: (release: null) => void;
    api.latest.mockReturnValue(new Promise(resolve => { resolveRelease = resolve; }));
    render(design);
    expect(wrapper.get('.dl-button').attributes('href')).toBeUndefined();
    expect(wrapper.text()).toContain('正在获取版本');
    resolveRelease(null); await flushPromises();
    expect(wrapper.get('.dl-button').attributes('aria-disabled')).toBe('true');
    expect(wrapper.get('.dl-button').attributes('href')).toBeUndefined();
    expect(wrapper.text()).toContain('安装包待发布');
  });
  it('recovers from a real request failure using retry', async () => {
    api.latest.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(release);
    render(design); await flushPromises();
    expect(wrapper.get('[role="alert"]').text()).toContain('版本信息暂时无法加载');
    expect(wrapper.get('.dl-button').attributes('href')).toBeUndefined();
    await wrapper.get('.dl-error button').trigger('click'); await flushPromises();
    expect(wrapper.find('.dl-error').exists()).toBe(false);
    expect(wrapper.get('.dl-button').attributes('href')).toBe(release.downloadUrl);
  });
  it('prevents iPhone APK downloads and provides the web entry', async () => {
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue('iPhone Safari');
    render(design); await flushPromises();
    const event = new MouseEvent('click', { cancelable: true });
    wrapper.get('.dl-button').element.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect(wrapper.get('.dl-button').attributes('href')).toBeUndefined();
    expect(wrapper.get('.dl-platform').text()).toContain('iPhone');
    expect(wrapper.get('.dl-web').attributes('href')).toBe('/login');
  });
  it('intercepts WeChat downloads and lets the user dismiss the browser hint', async () => {
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue('Android MicroMessenger');
    render(design); await flushPromises();
    const event = new MouseEvent('click', { cancelable: true });
    wrapper.get('.dl-button').element.dispatchEvent(event);
    await flushPromises();
    expect(event.defaultPrevented).toBe(true);
    expect(wrapper.get('.dl-browser-hint').text()).toContain('在浏览器打开');
    await wrapper.get('[aria-label="关闭提示"]').trigger('click');
    expect(wrapper.find('.dl-browser-hint').exists()).toBe(false);
  });
});

it('keeps a usable official link and supports retry if QR generation fails', async () => {
  api.qr.mockRejectedValueOnce(new Error('canvas')).mockResolvedValueOnce('data:image/png;base64,recovered');
  render('a'); await flushPromises();
  expect(wrapper.get('.dl-qr__url').attributes('href')).toBe(`${location.origin}/download`);
  expect(wrapper.text()).toContain('二维码生成失败');
  await wrapper.get('.dl-qr__fallback button').trigger('click'); await flushPromises();
  expect(wrapper.get('.dl-qr__image img').attributes('src')).toContain('recovered');
});
