import { afterEach, describe, expect, it } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { h, nextTick } from 'vue';
import ElementPlus from 'element-plus';
import PagedOverview from './PagedOverview.vue';

const wrappers: ReturnType<typeof mount>[] = [];
function setup(count: number, limit = 5) {
  const wrapper = mount(PagedOverview, {
    attachTo: document.body,
    props: { items: Array.from({ length: count }, (_,i) => i + 1), title: '测试列表', limit },
    slots: { default: ({ items, offset }: { items: unknown[]; offset: number }) =>
      h('ul', { 'data-offset': offset }, items.map(item => h('li', String(item)))) },
    global: { plugins: [ElementPlus] },
  });
  wrappers.push(wrapper);
  return wrapper;
}
const rows = () => [...document.querySelectorAll('.paged-overview__all li')].map(el => el.textContent);
afterEach(() => {
  wrappers.splice(0).forEach(wrapper => wrapper.unmount());
  document.body.innerHTML = '';
});

describe('bounded overview lists', () => {
  it.each([0, 1, 5])('does not show more for %i items', count => {
    const wrapper = setup(count);
    expect(wrapper.findAll('.paged-overview__preview li')).toHaveLength(count);
    expect(wrapper.find('.paged-overview__more').exists()).toBe(false);
  });
  it('keeps the preview bounded while every remaining item is reachable by pagination', async () => {
    const wrapper = setup(23);
    await wrapper.find('.paged-overview__more button').trigger('click');
    await flushPromises();
    expect(rows()).toEqual(Array.from({ length: 10 }, (_,i) => String(i + 1)));
    for (let page = 0; page < 2; page++) {
      (document.querySelector('.el-dialog .btn-next') as HTMLButtonElement).click();
      await nextTick();
    }
    expect(rows()).toEqual(['21', '22', '23']);
    expect(wrapper.findAll('.paged-overview__preview li')).toHaveLength(5);
    expect(document.querySelector('.paged-overview__all ul')?.getAttribute('data-offset')).toBe('20');
    expect((document.querySelector('.el-dialog .btn-next') as HTMLButtonElement).disabled).toBe(true);
    await wrapper.setProps({ items: [1, 2, 3] });
    await flushPromises();
    expect(rows()).toEqual(['1', '2', '3']);
  });
  it('respects the mobile preview limit and resets the page when reopened', async () => {
    const wrapper = setup(23, 3);
    await wrapper.find('.paged-overview__more button').trigger('click');
    await flushPromises();
    (document.querySelector('.el-dialog .btn-next') as HTMLButtonElement).click();
    await nextTick();
    expect(rows()[0]).toBe('11');
    (document.querySelector('.el-dialog__headerbtn') as HTMLButtonElement).click();
    await flushPromises();
    await wrapper.find('.paged-overview__more button').trigger('click');
    await flushPromises();
    expect(rows()[0]).toBe('1');
    expect(wrapper.findAll('.paged-overview__preview li')).toHaveLength(3);
  });
});
