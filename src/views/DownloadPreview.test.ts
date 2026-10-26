import { afterEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createMemoryHistory, createRouter } from 'vue-router';
import DownloadPreview from './DownloadPreview.vue';

vi.mock('@/components/download/DownloadDesign.vue', () => ({ default: { props: ['design'], template: '<div data-design-stub :data-design="design" />' } }));
let wrapper: ReturnType<typeof mount>;
async function render(url: string) {
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/download-preview', component: DownloadPreview }] });
  await router.push(url); await router.isReady();
  wrapper = mount(DownloadPreview, { global: { plugins: [router] } });
  return router;
}
afterEach(() => wrapper?.unmount());

describe('下载页选稿入口', () => {
  it.each(['d', 'e'])('supports new design %s in standalone and switcher links', async design => {
    await render(`/download-preview?design=${design}`);
    expect(wrapper.findAll('.download-preview__designs button')).toHaveLength(5);
    expect(wrapper.get('iframe').attributes('src')).toBe(`/download-preview?design=${design}&standalone=1`);
    expect(wrapper.get('.download-preview__designs [aria-pressed="true"]').text()).toContain(design === 'd' ? '自然编辑风' : '活力海报风');
  });
  it('restores the chosen design and viewport from a shareable URL', async () => {
    await render('/download-preview?design=c&device=mobile');
    expect(wrapper.get('iframe').attributes('src')).toBe('/download-preview?design=c&standalone=1');
    expect(wrapper.get('.download-preview__stage').classes()).toContain('download-preview__stage--mobile');
    expect(wrapper.get('.download-preview__designs [aria-pressed="true"]').text()).toContain('深色科技风');
  });
  it('persists switches in the URL while viewport switches do not reload the frame', async () => {
    const router = await render('/download-preview');
    await wrapper.findAll('.download-preview__designs button')[1].trigger('click'); await flushPromises();
    expect(router.currentRoute.value.query.design).toBe('b');
    const url = wrapper.get('iframe').attributes('src');
    await wrapper.findAll('.download-preview__devices button')[1].trigger('click'); await flushPromises();
    expect(router.currentRoute.value.query.device).toBe('mobile');
    expect(wrapper.get('iframe').attributes('src')).toBe(url);
  });
  it('renders a standalone responsive page without a nested preview toolbar', async () => {
    await render('/download-preview?design=b&standalone=1');
    expect(wrapper.get('[data-design-stub]').attributes('data-design')).toBe('b');
    expect(wrapper.find('iframe').exists()).toBe(false);
    expect(wrapper.find('.download-preview__header').exists()).toBe(false);
  });
  it('falls back to the selected B design and desktop for unknown query values', async () => {
    await render('/download-preview?design=unknown&device=unknown');
    expect(wrapper.get('iframe').attributes('src')).toBe('/download-preview?design=b&standalone=1');
    expect(wrapper.get('.download-preview__stage').classes()).toContain('download-preview__stage--desktop');
  });
});
