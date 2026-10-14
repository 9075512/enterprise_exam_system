/**
 * 练题端组件层测试：底部导航（TabBar）按配置过滤 + 当前项高亮，进度点（ProgressDots）状态归一化。
 */
import ElementPlus from 'element-plus';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { createMemoryHistory, createRouter } from 'vue-router';
import { usePracticeConfigStore } from '@/stores/practiceConfig';
import PracticeProgressDots from './PracticeProgressDots.vue';
import PracticeTabBar from './PracticeTabBar.vue';

vi.mock('@/api/practice', () => ({
  getConfig: vi.fn().mockResolvedValue({}),
  login: vi.fn(),
  logout: vi.fn(),
  fetchMe: vi.fn(),
}));

function buildRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/practice/home', component: { template: '<div />' } },
      { path: '/practice/wrong-book', component: { template: '<div />' } },
      { path: '/practice/report', component: { template: '<div />' } },
      { path: '/practice/profile', component: { template: '<div />' } },
    ],
  });
}

async function mountTabBar(path = '/practice/home', pinia = createPinia()) {
  setActivePinia(pinia);
  const router = buildRouter();
  await router.push(path);
  await router.isReady();
  const wrapper = mount(PracticeTabBar, {
    global: { plugins: [ElementPlus, router, pinia] },
  });
  return { wrapper, router };
}

beforeEach(() => {
  setActivePinia(createPinia());
});

describe('PracticeTabBar', () => {
  it('默认渲染四个 Tab（练题 / 错题本 / 报告 / 我的）', async () => {
    const { wrapper } = await mountTabBar();
    const texts = wrapper.findAll('.tabbar__item .tabbar__text').map((n) => n.text());
    expect(texts).toEqual(['练题', '错题本', '报告', '我的']);
  });

  it('关闭错题本与报告入口后仅保留两个 Tab', async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const config = usePracticeConfigStore();
    config.config = { ...config.config, wrongBookEnabled: false, reportEnabled: false };
    const { wrapper } = await mountTabBar('/practice/home', pinia);
    const texts = wrapper.findAll('.tabbar__item .tabbar__text').map((n) => n.text());
    expect(texts).toEqual(['练题', '我的']);
  });

  it('当前路由对应 Tab 标记为激活并设 aria-current="page"', async () => {
    const { wrapper } = await mountTabBar('/practice/profile');
    const active = wrapper.findAll('.tabbar__item').filter((n) => n.classes().includes('is-active'));
    expect(active).toHaveLength(1);
    expect(active[0].text()).toContain('我的');
    expect(active[0].attributes('aria-current')).toBe('page');
  });

  it('点击非当前 Tab 触发路由跳转，点击当前 Tab 不跳转', async () => {
    const { wrapper, router } = await mountTabBar('/practice/home');
    const push = vi.spyOn(router, 'push');

    await wrapper.findAll('.tabbar__item')[1].trigger('click');
    expect(push).toHaveBeenCalledWith('/practice/wrong-book');

    push.mockClear();
    await wrapper.findAll('.tabbar__item')[0].trigger('click');
    expect(push).not.toHaveBeenCalled();
  });
});

describe('PracticeProgressDots', () => {
  it('按 total 渲染等量圆点，并暴露 progressbar 的可访问性属性', () => {
    const wrapper = mount(PracticeProgressDots, {
      props: { total: 5, current: 2, marks: ['correct', 'wrong', 'unanswered', 'correct', 'wrong'] },
      global: { plugins: [ElementPlus, createPinia()] },
    });
    const dots = wrapper.findAll('.progress-dots__dot');
    expect(dots).toHaveLength(5);
    expect(dots[0].classes()).toContain('progress-dots__dot--correct');
    expect(dots[1].classes()).toContain('progress-dots__dot--wrong');
    expect(dots[2].classes()).toContain('progress-dots__dot--unanswered');

    const root = wrapper.find('.progress-dots');
    expect(root.attributes('role')).toBe('progressbar');
    expect(root.attributes('aria-valuenow')).toBe('3');
    expect(root.attributes('aria-valuemax')).toBe('5');
  });

  it('当前题索引标记 is-current，且不受 total 变化影响', async () => {
    const wrapper = mount(PracticeProgressDots, {
      props: { total: 3, current: 1, marks: ['unanswered', 'unanswered', 'unanswered'] },
      global: { plugins: [ElementPlus, createPinia()] },
    });
    const currentDots = wrapper.findAll('.progress-dots__dot').filter((n) => n.classes().includes('is-current'));
    expect(currentDots).toHaveLength(1);

    await wrapper.setProps({ current: 2 });
    const afterUpdate = wrapper.findAll('.progress-dots__dot').filter((n) => n.classes().includes('is-current'));
    expect(afterUpdate).toHaveLength(1);
    expect(wrapper.findAll('.progress-dots__dot')[2].classes()).toContain('is-current');
  });

  it('marks 长度不足时按未答补齐，多余项忽略', () => {
    const wrapper = mount(PracticeProgressDots, {
      props: { total: 4, current: 0, marks: ['correct'] },
      global: { plugins: [ElementPlus, createPinia()] },
    });
    const dots = wrapper.findAll('.progress-dots__dot');
    expect(dots).toHaveLength(4);
    expect(dots[0].classes()).toContain('progress-dots__dot--correct');
    expect(dots[1].classes()).toContain('progress-dots__dot--unanswered');
  });

  it('variant 决定容器配色类（默认 on-light）', async () => {
    const wrapper = mount(PracticeProgressDots, {
      props: { total: 2, current: 0, marks: ['unanswered', 'unanswered'] },
      global: { plugins: [ElementPlus, createPinia()] },
    });
    expect(wrapper.find('.progress-dots').classes()).toContain('progress-dots--on-light');

    await wrapper.setProps({ variant: 'on-dark' });
    expect(wrapper.find('.progress-dots').classes()).toContain('progress-dots--on-dark');
  });
});
