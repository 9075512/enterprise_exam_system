import { afterEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import ElementPlus, { ElDialog } from 'element-plus';
import ContentBoard from './ContentBoard.vue';

const api = vi.hoisted(() => ({ feed: vi.fn(), read: vi.fn().mockResolvedValue(null) }));
vi.mock('@/api/content', () => ({ fetchFeed: api.feed, markAnnouncementRead: api.read, markBannerClick: vi.fn() }));
let wrapper: ReturnType<typeof mount>;
afterEach(() => { wrapper?.unmount(); document.body.innerHTML = ''; localStorage.clear(); vi.clearAllMocks(); });

describe('announcement overview', () => {
  it('shows five announcements, preserves order and opens later-page details with a read receipt', async () => {
    api.feed.mockResolvedValue({ banners: [], announcements: Array.from({ length: 23 }, (_, i) => ({
      id: `notice-${i}`, title: `公告${i + 1}`, content: `<p>正文${i + 1}</p>`,
      createdAt: '2026-10-16T00:00:00Z', pinned: i === 0, level: 'normal',
    })) });
    wrapper = mount(ContentBoard, { attachTo: document.body, global: { plugins: [ElementPlus] } });
    await flushPromises();
    expect(wrapper.findAll('.paged-overview__preview .content-board__item')).toHaveLength(5);
    await wrapper.find('.paged-overview__more button').trigger('click');
    await flushPromises();
    (document.querySelector('.el-dialog .btn-next') as HTMLButtonElement).click();
    await flushPromises();
    const item = document.querySelector('.paged-overview__all .content-board__item') as HTMLElement;
    expect(item.textContent).toContain('公告11');
    item.click();
    await flushPromises();
    expect(api.read).toHaveBeenCalledWith('notice-10');
    expect(document.body.textContent).toContain('正文11');
    expect(wrapper.findAll('.paged-overview__preview .content-board__item')).toHaveLength(5);
  });
});


describe('重要公告队列', () => {
  it('按钮关闭与弹窗关闭生命周期只推进一次，并按顺序触达全部公告', async () => {
    api.feed.mockResolvedValue({ banners: [], announcements: ['甲', '乙', '丙'].map((title, i) => ({
      id: 'important-' + i, title, content: '<p>重要正文' + title + '</p>', level: 'important', pinned: false, createdAt: '2026-10-20T00:00:00Z',
    })) });
    wrapper = mount(ContentBoard, { attachTo: document.body, global: { plugins: [ElementPlus] } }); await flushPromises();
    const force = () => wrapper.findAllComponents(ElDialog).find(d => d.props('title') === '重要公告')!;
    expect(api.read.mock.calls.map(c => c[0])).toEqual(['important-0']);
    const close = () => [...document.querySelectorAll<HTMLButtonElement>('button')].find(b => b.textContent?.trim() === '我知道了')!.click();
    close(); close(); await flushPromises();
    expect(api.read).toHaveBeenCalledTimes(1);
    force().vm.$emit('closed'); force().vm.$emit('update:modelValue', false); await flushPromises();
    expect(api.read.mock.calls.map(c => c[0])).toEqual(['important-0', 'important-1']);
    expect(document.body.textContent).toContain('重要正文乙');
    force().vm.$emit('update:modelValue', false); await flushPromises();
    force().vm.$emit('closed'); force().vm.$emit('update:modelValue', false); await flushPromises();
    expect(api.read.mock.calls.map(c => c[0])).toEqual(['important-0', 'important-1', 'important-2']);
    expect(document.body.textContent).toContain('重要正文丙');
    close(); await flushPromises(); force().vm.$emit('closed'); force().vm.$emit('update:modelValue', false); await flushPromises();
    expect(force().props('modelValue')).toBe(false);
    expect(api.read).toHaveBeenCalledTimes(3);
  });
});
