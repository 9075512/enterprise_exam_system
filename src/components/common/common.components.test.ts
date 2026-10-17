/**
 * 通用组件冒烟测试（src/components/common/）。
 * 覆盖渲染契约与关键交互；Element Plus 以真实插件挂载（jsdom 下可渲染）。
 */
import ElementPlus from 'element-plus';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import type { Component } from 'vue';
import { PAGE_SIZE_MAX } from '@/constants';
import { THEME } from '@/constants/theme';
import { useAppStore } from '@/stores/app';
import BatchActionBar from './BatchActionBar.vue';
import TableDensityToggle from './TableDensityToggle.vue';
import DataTablePagination from './DataTablePagination.vue';
import EmptyState from './EmptyState.vue';
import LoadingSkeleton from './LoadingSkeleton.vue';
import PageHeader from './PageHeader.vue';
import StatCard from './StatCard.vue';
import StatusTag from './StatusTag.vue';

vi.mock('@/api/settings', () => ({
  getSettings: vi.fn().mockResolvedValue({}),
  getPublicSettings: vi.fn().mockResolvedValue({}),
  updateSettings: vi.fn().mockResolvedValue({}),
}));

/** 统一的挂载助手（props/slots 由各用例自行保证形状，此处仅透传） */
function mountWith(component: Component, props: Record<string, unknown> = {}, slots: Record<string, string> = {}) {
  return mount(component, {
    props: props as never,
    slots: slots as never,
    global: { plugins: [ElementPlus, createPinia()] },
  });
}

beforeEach(() => {
  setActivePinia(createPinia());
  // 密度用例会写 localStorage 与 <html data-density>，逐例清理避免相互污染
  localStorage.clear();
  delete document.documentElement.dataset.density;
});

describe('PageHeader', () => {
  it('渲染标题与描述，描述缺省时不渲染', () => {
    const withDesc = mountWith(PageHeader, { title: '题库管理', description: '维护题库与试题' });
    expect(withDesc.find('.page-header__title').text()).toBe('题库管理');
    expect(withDesc.find('.page-header__desc').text()).toBe('维护题库与试题');

    const noDesc = mountWith(PageHeader, { title: '题库管理' });
    expect(noDesc.find('.page-header__desc').exists()).toBe(false);
  });

  it('actions 具名插槽内容渲染在右侧区域', () => {
    const wrapper = mountWith(PageHeader, { title: 'T' }, { actions: '<button class="probe">新增</button>' });
    expect(wrapper.find('.page-header__actions .probe').text()).toBe('新增');
  });
});

describe('StatCard', () => {
  it('仅在显式指定时启用紧凑密度', () => {
    const compact = mountWith(StatCard, { label: '题目总数', value: 12, unit: '道', density: 'compact' });
    const normal = mountWith(StatCard, { label: '题目总数', value: 12 });
    expect(compact.find('.stat-card').classes()).toContain('stat-card--compact');
    expect(compact.text()).toContain('12道');
    expect(normal.find('.stat-card').classes()).toContain('stat-card--default');
    expect(normal.find('.stat-card').classes()).not.toContain('stat-card--compact');
  });
});

describe('EmptyState', () => {
  it('默认文案为「暂无数据」，text 可覆盖', () => {
    const wrapper = mountWith(EmptyState);
    expect(wrapper.text()).toContain('暂无数据');

    const custom = mountWith(EmptyState, { text: '还没有错题' });
    expect(custom.text()).toContain('还没有错题');
  });

  it('description 优先于 text', () => {
    const wrapper = mountWith(EmptyState, { text: 'fallback', description: '本场考试暂无记录' });
    expect(wrapper.text()).toContain('本场考试暂无记录');
    expect(wrapper.text()).not.toContain('fallback');
  });

  it('纯文案用法不渲染动作区（既有页面外观不变）', () => {
    const wrapper = mountWith(EmptyState, { text: '暂无数据' });
    expect(wrapper.find('.empty-state__actions').exists()).toBe(false);
  });

  it('filtered 为真时默认给「清空筛选」出路，点击 emit clear', async () => {
    const wrapper = mountWith(EmptyState, { text: '没有匹配的用户', filtered: true });
    const actions = wrapper.find('.empty-state__actions');
    expect(actions.exists()).toBe(true);
    expect(actions.text()).toContain('清空筛选');

    await actions.find('button').trigger('click');
    expect(wrapper.emitted('clear')).toHaveLength(1);
  });

  it('真·无数据（filtered=false）不给「清空筛选」，只给主操作', async () => {
    const wrapper = mountWith(EmptyState, { text: '暂无数据', actionText: '新建题库' });
    expect(wrapper.text()).not.toContain('清空筛选');

    const button = wrapper.find('.empty-state__actions button');
    expect(button.text()).toContain('新建题库');
    await button.trigger('click');
    expect(wrapper.emitted('action')).toHaveLength(1);
  });

  it('showClear 显式 true 可在非筛选态强制给出「清空筛选」', () => {
    const wrapper = mountWith(EmptyState, { text: '暂无数据', showClear: true });
    expect(wrapper.find('.empty-state__actions').text()).toContain('清空筛选');
  });
});

describe('BatchActionBar', () => {
  it('未勾选（count=0）时不渲染', () => {
    const wrapper = mountWith(BatchActionBar, { count: 0 });
    expect(wrapper.find('.batch-bar').exists()).toBe(false);
  });

  it('勾选后显示「已选 N 量词」与批量动作插槽', () => {
    const wrapper = mountWith(
      BatchActionBar,
      { count: 3, noun: '条公告' },
      { default: '<button class="act">批量上线</button>' },
    );
    const bar = wrapper.find('.batch-bar');
    expect(bar.exists()).toBe(true);
    expect(bar.find('.batch-bar__count').text().replace(/\s+/g, '')).toBe('已选3条公告');
    expect(bar.find('.batch-bar__actions .act').text()).toBe('批量上线');
  });

  it('量词缺省为「项」', () => {
    const wrapper = mountWith(BatchActionBar, { count: 1 });
    expect(wrapper.find('.batch-bar__count').text().replace(/\s+/g, '')).toBe('已选1项');
  });

  it('点击「取消选择」emit clear', async () => {
    const wrapper = mountWith(BatchActionBar, { count: 2 });
    await wrapper.find('.batch-bar__clear').trigger('click');
    expect(wrapper.emitted('clear')).toHaveLength(1);
  });
});

describe('TableDensityToggle', () => {
  /** 组件依赖 app store：同一个 pinia 既要 setActive 也要注入 app，否则读到的不是同一实例 */
  function mountToggle() {
    const pinia = createPinia();
    setActivePinia(pinia);
    return mount(TableDensityToggle, { global: { plugins: [ElementPlus, pinia] } });
  }

  it('两段常显，默认「舒适」选中', () => {
    const wrapper = mountToggle();
    const items = wrapper.findAll('.density-toggle__item');

    expect(items).toHaveLength(2);
    expect(items[0].text()).toBe('舒适');
    expect(items[1].text()).toBe('紧凑');
    expect(items[0].attributes('aria-pressed')).toBe('true');
    expect(items[1].attributes('aria-pressed')).toBe('false');
  });

  it('点「紧凑」写入 store、持久化并同步 <html data-density>', async () => {
    const wrapper = mountToggle();
    await wrapper.findAll('.density-toggle__item')[1].trigger('click');

    expect(useAppStore().tableDensity).toBe('compact');
    expect(localStorage.getItem('app.tableDensity')).toBe('compact');
    expect(document.documentElement.dataset.density).toBe('compact');
    expect(wrapper.findAll('.density-toggle__item')[1].classes()).toContain('is-active');
  });

  it('再点「舒适」回到默认并移除属性', async () => {
    const wrapper = mountToggle();
    const items = () => wrapper.findAll('.density-toggle__item');

    await items()[1].trigger('click');
    await items()[0].trigger('click');

    expect(useAppStore().tableDensity).toBe('default');
    expect(document.documentElement.dataset.density).toBeUndefined();
  });

  it('容器声明分组语义与可读名称', () => {
    const wrapper = mountToggle();
    const group = wrapper.find('.density-toggle');

    expect(group.attributes('role')).toBe('group');
    expect(group.attributes('aria-label')).toBe('表格密度');
  });
});

describe('StatusTag', () => {
  const cases: Array<[string, string]> = [
    ['not_started', '未开始'],
    ['ongoing', '进行中'],
    ['in_progress', '进行中'],
    ['submitted', '已交卷'],
    ['pending_review', '待阅卷'],
    ['ended', '已结束'],
  ];

  it.each(cases)('状态 %s → 文案「%s」', (status, expected) => {
    const wrapper = mountWith(StatusTag, { status });
    expect(wrapper.text()).toContain(expected);
  });

  it('未知状态回退为原值文本（不抛错）', () => {
    const wrapper = mountWith(StatusTag, { status: 'archived' });
    expect(wrapper.text()).toContain('archived');
  });

  it('文字色取 700 档三件套文本色，不得使用语义原色（可访问性护栏）', () => {
    // jsdom 会把 hex 归一化为 rgb()，这里做等价转换后再比对
    const hexToRgb = (hex: string) => {
      const h = hex.replace('#', '');
      const n = (i: number) => parseInt(h.slice(i, i + 2), 16);
      return `rgb(${n(0)}, ${n(2)}, ${n(4)})`;
    };
    const styleOf = (status: string) =>
      (mountWith(StatusTag, { status }).attributes('style') ?? '').replace(/\s/g, '').toLowerCase();
    const usesColor = (status: string, hex: string) => {
      const s = styleOf(status);
      return s.includes(hex.toLowerCase()) || s.includes(hexToRgb(hex).replace(/\s/g, ''));
    };

    // 已交卷 / 待阅卷 / 已结束 必须用达标文本档
    expect(usesColor('submitted', THEME.successText)).toBe(true);
    expect(usesColor('pending_review', THEME.warningText)).toBe(true);
    expect(usesColor('not_started', THEME.warningText)).toBe(true);
    expect(usesColor('ongoing', THEME.primaryDark)).toBe(true);
    expect(usesColor('ended', THEME.textSecondary)).toBe(true);
    // 且不得等于语义原色（原色 3.0–3.3:1 不达标）
    expect(usesColor('submitted', THEME.success)).toBe(false);
    expect(usesColor('pending_review', THEME.warning)).toBe(false);
    expect(usesColor('ended', THEME.info)).toBe(false);
  });
});

describe('LoadingSkeleton', () => {
  it('rows 默认 6 行，可覆盖', () => {
    const defaultWrapper = mountWith(LoadingSkeleton);
    const defaultSkeleton = defaultWrapper.findComponent({ name: 'ElSkeleton' });
    expect(defaultSkeleton.props('rows')).toBe(6);
    expect(defaultSkeleton.props('animated')).toBe(true);

    const custom = mountWith(LoadingSkeleton, { rows: 3, animated: false });
    const customSkeleton = custom.findComponent({ name: 'ElSkeleton' });
    expect(customSkeleton.props('rows')).toBe(3);
    expect(customSkeleton.props('animated')).toBe(false);
  });
});

describe('DataTablePagination', () => {
  it('每页条数候选 = [10, 默认页大小, 50, PAGE_SIZE_MAX] 去重升序', () => {
    const wrapper = mountWith(DataTablePagination, { total: 120, page: 1, pageSize: 20 });
    expect(wrapper.findComponent({ name: 'ElPagination' }).props('pageSizes')).toEqual([10, 20, 50, PAGE_SIZE_MAX]);
  });

  it('显式传入 pageSizes 时不叠加默认候选', () => {
    const wrapper = mountWith(DataTablePagination, {
      total: 120,
      page: 1,
      pageSize: 25,
      pageSizes: [25, 25, 100],
    });
    expect(wrapper.findComponent({ name: 'ElPagination' }).props('pageSizes')).toEqual([25, 100]);
  });

  it('翻页 / 改每页条数按约定 emit', async () => {
    const wrapper = mountWith(DataTablePagination, { total: 120, page: 1, pageSize: 20 });
    const pagination = wrapper.findComponent({ name: 'ElPagination' });

    pagination.vm.$emit('current-change', 3);
    pagination.vm.$emit('size-change', 50);
    await wrapper.vm.$nextTick();

    expect(wrapper.emitted('update:page')?.[0]).toEqual([3]);
    expect(wrapper.emitted('update:pageSize')?.[0]).toEqual([50]);
  });

  it('移动端使用紧凑的上一页 / 页码 / 下一页导航', async () => {
    const wrapper = mountWith(DataTablePagination, { total: 45, page: 2, pageSize: 20 });
    expect(wrapper.find('.data-table-pagination__summary').text()).toBe('共 45 条');
    expect(wrapper.find('.data-table-pagination__current').text()).toBe('2 / 3');

    const buttons = wrapper.findAll('.data-table-pagination__button');
    await buttons[0].trigger('click');
    await buttons[1].trigger('click');
    expect(wrapper.emitted('update:page')).toEqual([[1], [3]]);
  });
});
