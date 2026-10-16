import { afterEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import ElementPlus from 'element-plus';
import ContentBoard from './PracticeNoticeCard.vue';

const api = vi.hoisted(() => ({ feed: vi.fn(), read: vi.fn().mockResolvedValue(null) }));
vi.mock('@/api/practice', () => ({ feed: api.feed, markAnnouncementRead: api.read, markBannerClick: vi.fn() }));
let wrapper: ReturnType<typeof mount>;
afterEach(() => { wrapper?.unmount(); document.body.innerHTML = ''; localStorage.clear(); vi.clearAllMocks(); });

describe('announcement overview', () => {
  it('shows three announcements, preserves order and opens later-page details with a read receipt', async () => {
    api.feed.mockResolvedValue({ banners: [], announcements: Array.from({ length: 23 }, (_, i) => ({
      id: `notice-${i}`, title: `公告${i + 1}`, content: `<p>正文${i + 1}</p>`,
      createdAt: '2026-10-16T00:00:00Z', pinned: i === 0, level: 'normal',
    })) });
    wrapper = mount(ContentBoard, { attachTo: document.body, global: { plugins: [ElementPlus] } });
    await flushPromises();
    expect(wrapper.findAll('.paged-overview__preview .notice__item')).toHaveLength(3);
    await wrapper.find('.paged-overview__more button').trigger('click');
    await flushPromises();
    (document.querySelector('.el-dialog .btn-next') as HTMLButtonElement).click();
    await flushPromises();
    const item = document.querySelector('.paged-overview__all .notice__item') as HTMLElement;
    expect(item.textContent).toContain('公告11');
    item.click();
    await flushPromises();
    expect(api.read).toHaveBeenCalledWith('notice-10');
    expect(document.body.textContent).toContain('正文11');
    expect(wrapper.findAll('.paged-overview__preview .notice__item')).toHaveLength(3);
  });
});
