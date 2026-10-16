import { afterEach, expect, it, vi } from 'vitest';
import { shallowMount } from '@vue/test-utils';
import { nextTick } from 'vue';
import PracticeLoading from './PracticeLoading.vue';

let wrapper: ReturnType<typeof shallowMount>;
afterEach(() => { wrapper?.unmount(); vi.useRealTimers(); });
it('快速请求不闪骨架，慢请求显示状态并在完成后立即退出', async () => {
  vi.useFakeTimers();
  wrapper = shallowMount(PracticeLoading, {
    props: { loading: true, caption: '正在取题…' },
    global: { stubs: { ElSkeleton: true } },
  });
  expect(wrapper.find('el-skeleton-stub').exists()).toBe(false);
  await wrapper.setProps({ loading: false });
  vi.advanceTimersByTime(200); await nextTick();
  expect(wrapper.find('[role="status"]').exists()).toBe(false);
  await wrapper.setProps({ loading: true });
  vi.advanceTimersByTime(150); await nextTick();
  expect(wrapper.find('el-skeleton-stub').exists()).toBe(true);
  expect(wrapper.text()).toContain('正在取题…');
  await wrapper.setProps({ loading: false });
  expect(wrapper.find('[role="status"]').exists()).toBe(false);
  expect(vi.getTimerCount()).toBe(0);
});
