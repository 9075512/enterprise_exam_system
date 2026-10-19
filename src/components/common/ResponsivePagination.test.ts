import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { defineComponent, h, ref } from 'vue';
import { ElPagination } from 'element-plus';
import ResponsivePagination from './ResponsivePagination.vue';

const wrappers: ReturnType<typeof mount>[] = [];
let media: { matches: boolean; addEventListener: ReturnType<typeof vi.fn>; removeEventListener: ReturnType<typeof vi.fn> };
beforeEach(() => {
  media = { matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() };
  vi.stubGlobal('matchMedia', vi.fn(() => media));
});
afterEach(() => { wrappers.splice(0).forEach(w => w.unmount()); vi.unstubAllGlobals(); });
async function setup(extra: Record<string, unknown> = {}) {
  const changed = vi.fn();
  const page = ref(2);
  const wrapper = mount(defineComponent({ setup: () => () => h(ResponsivePagination, {
    total: 115, pageSize: 20, currentPage: page.value,
    'onUpdate:currentPage': (value: number) => { page.value = value; },
    onCurrentChange: changed, ...extra,
  }) }));
  wrappers.push(wrapper);
  await flushPromises();
  return { wrapper, page, changed, pager: wrapper.findComponent(ResponsivePagination) };
}

describe('响应式分页：保留翻页及直接跳页', () => {
  it('手机端上一页、下一页正确更新页码，每次只通知一次加载', async () => {
    const { wrapper, page, changed } = await setup();
    await wrapper.find('.btn-next').trigger('click');
    await flushPromises();
    expect(page.value).toBe(3);
    expect(changed.mock.calls).toEqual([[3]]);
    await wrapper.find('.btn-prev').trigger('click');
    await flushPromises();
    expect(page.value).toBe(2);
    expect(changed.mock.calls).toEqual([[3], [2]]);
  });
  it('跳页上限、下限受到约束，首尾页不能继续翻页', async () => {
    const { wrapper, page, changed } = await setup();
    await wrapper.find('input').setValue('999');
    await flushPromises();
    expect(page.value).toBe(6);
    expect((wrapper.find('.btn-next').element as HTMLButtonElement).disabled).toBe(true);
    await wrapper.find('input').setValue('-3');
    await flushPromises();
    expect(page.value).toBe(1);
    expect((wrapper.find('.btn-prev').element as HTMLButtonElement).disabled).toBe(true);
    expect(changed.mock.calls).toEqual([[6], [1]]);
  });
  it('空白输入和重复确认保留当前页，不触发重复加载', async () => {
    const { wrapper, page, changed } = await setup();
    await wrapper.find('input').setValue('');
    expect((wrapper.find('input').element as HTMLInputElement).value).toBe('2');
    await wrapper.find('input').setValue('4');
    await flushPromises();
    await wrapper.find('input').trigger('keydown', { key: 'Enter' });
    await flushPromises();
    expect(page.value).toBe(4);
    expect(changed.mock.calls).toEqual([[4]]);
  });
  it('禁用分页时，输入和前后翻页都不可用', async () => {
    const { wrapper } = await setup({ disabled: true });
    expect((wrapper.find('input').element as HTMLInputElement).disabled).toBe(true);
    expect((wrapper.find('.btn-next').element as HTMLButtonElement).disabled).toBe(true);
    expect((wrapper.find('.btn-prev').element as HTMLButtonElement).disabled).toBe(true);
  });
  it('视口切换保留当前页与桌面的每页条数选项、事件', async () => {
    const sizeChange = vi.fn();
    const { wrapper, page } = await setup({ layout: 'total, sizes, prev, pager, next', pageSizes: [10, 20, 100], onSizeChange: sizeChange });
    media.matches = false;
    media.addEventListener.mock.calls[0][1]();
    await flushPromises();
    const elementPager = wrapper.findComponent(ElPagination);
    expect(elementPager.props('layout')).toBe('total, sizes, prev, pager, next');
    expect(elementPager.props('pageSizes')).toEqual([10, 20, 100]);
    expect(wrapper.find('.responsive-pagination__position').exists()).toBe(false);
    expect(page.value).toBe(2);
    elementPager.vm.$emit('size-change', 100);
    expect(sizeChange).toHaveBeenCalledWith(100);
  });
  it('离开页面后解除视口监听', async () => {
    const { wrapper } = await setup();
    const listener = media.addEventListener.mock.calls[0][1];
    wrapper.unmount();
    expect(media.removeEventListener).toHaveBeenCalledWith('change', listener);
  });
});
