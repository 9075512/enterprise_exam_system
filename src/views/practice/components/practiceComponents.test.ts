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
      { path: '/exam/practice', component: { template: '<div />' } },
      { path: '/exam/practice/wrong-book', component: { template: '<div />' } },
      { path: '/exam/practice/report', component: { template: '<div />' } },
      { path: '/exam/practice/profile', component: { template: '<div />' } },
    ],
  });
}

async function mountTabBar(path = '/exam/practice', pinia = createPinia()) {
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
  it('默认渲染三个 Tab（练题 / 错题本 / 报告）', async () => {
    const { wrapper } = await mountTabBar();
    const texts = wrapper.findAll('.tabbar__item .tabbar__text').map((n) => n.text());
    expect(texts).toEqual(['练题', '错题本', '报告']);
  });

  it('关闭错题本与报告入口后仅保留练题 Tab', async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const config = usePracticeConfigStore();
    config.config = { ...config.config, wrongBookEnabled: false, reportEnabled: false };
    const { wrapper } = await mountTabBar('/exam/practice', pinia);
    const texts = wrapper.findAll('.tabbar__item .tabbar__text').map((n) => n.text());
    expect(texts).toEqual(['练题']);
  });

  it('当前路由对应 Tab 标记为激活并设 aria-current="page"', async () => {
    const { wrapper } = await mountTabBar('/exam/practice/report');
    const active = wrapper.findAll('.tabbar__item').filter((n) => n.classes().includes('is-active'));
    expect(active).toHaveLength(1);
    expect(active[0].text()).toContain('报告');
    expect(active[0].attributes('aria-current')).toBe('page');
  });

  it('点击非当前 Tab 触发路由跳转，点击当前 Tab 不跳转', async () => {
    const { wrapper, router } = await mountTabBar('/exam/practice');
    const push = vi.spyOn(router, 'push');

    await wrapper.findAll('.tabbar__item')[1].trigger('click');
    expect(push).toHaveBeenCalledWith('/exam/practice/wrong-book');

    push.mockClear();
    await wrapper.findAll('.tabbar__item')[0].trigger('click');
    expect(push).not.toHaveBeenCalled();
  });

  it('使用主系统 /exam/practice 路径并标记集成样式', async () => {
    const { wrapper, router } = await mountTabBar('/exam/practice');
    expect(wrapper.find('.tabbar').classes()).toContain('is-integrated');
    const push = vi.spyOn(router, 'push');
    await wrapper.findAll('.tabbar__item')[1].trigger('click');
    expect(push).toHaveBeenCalledWith('/exam/practice/wrong-book');
  });
});

describe('PracticeProgressDots', () => {
  it('统一渲染连续进度条，并暴露已完成数量的可访问性属性', () => {
    const wrapper = mount(PracticeProgressDots, {
      props: { total: 5, current: 2, marks: ['correct', 'wrong', 'unanswered', 'correct', 'wrong'] },
      global: { plugins: [ElementPlus, createPinia()] },
    });

    const root = wrapper.find('.progress-dots');
    expect(root.attributes('role')).toBe('progressbar');
    expect(root.attributes('aria-valuenow')).toBe('4');
    expect(root.attributes('aria-valuemax')).toBe('5');
    expect(wrapper.find('.progress-dots__label').text()).toBe('已完成 4 / 5');
    expect(wrapper.find('.progress-dots__fill').attributes('style')).toContain('width: 80%');
  });

  it('作答状态更新后同步刷新进度', async () => {
    const wrapper = mount(PracticeProgressDots, {
      props: { total: 3, current: 1, marks: ['unanswered', 'unanswered', 'unanswered'] },
      global: { plugins: [ElementPlus, createPinia()] },
    });
    expect(wrapper.find('.progress-dots__label').text()).toBe('已完成 0 / 3');

    await wrapper.setProps({ current: 2, marks: ['correct', 'wrong', 'unanswered'] });
    expect(wrapper.find('.progress-dots__label').text()).toBe('已完成 2 / 3');
    expect(wrapper.find('.progress-dots__fill').attributes('style')).toContain('width: 67%');
  });

  it('marks 长度不足时按未答补齐，多余项忽略', () => {
    const wrapper = mount(PracticeProgressDots, {
      props: { total: 4, current: 0, marks: ['correct', 'unanswered', 'unanswered', 'unanswered', 'wrong'] },
      global: { plugins: [ElementPlus, createPinia()] },
    });
    expect(wrapper.find('.progress-dots__label').text()).toBe('已完成 1 / 4');
    expect(wrapper.find('.progress-dots__fill').attributes('style')).toContain('width: 25%');
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
