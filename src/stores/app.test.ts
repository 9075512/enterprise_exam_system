/**
 * 应用级 UI 状态 store 测试。
 * 重点：侧栏折叠状态跨会话记忆（localStorage）与读写异常兜底；
 *      表格密度持久化 + `<html data-density>` 同步（全局样式作用域开关）。
 */
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it } from 'vitest';
import { useAppStore } from './app';

beforeEach(() => {
  localStorage.clear();
  setActivePinia(createPinia());
  // 密度会写 <html data-density>，用例之间必须清干净，避免相互污染
  delete document.documentElement.dataset.density;
});

describe('app store · 侧栏折叠', () => {
  it('无本地记录时默认展开', () => {
    const app = useAppStore();
    expect(app.sidebarCollapsed).toBe(false);
  });

  it('toggleSidebar 切换状态并写入 localStorage', () => {
    const app = useAppStore();

    app.toggleSidebar();
    expect(app.sidebarCollapsed).toBe(true);
    expect(localStorage.getItem('app.sidebarCollapsed')).toBe('1');

    app.toggleSidebar();
    expect(app.sidebarCollapsed).toBe(false);
    expect(localStorage.getItem('app.sidebarCollapsed')).toBe('0');
  });

  it('新会话按本地记录恢复折叠状态', () => {
    localStorage.setItem('app.sidebarCollapsed', '1');
    setActivePinia(createPinia());

    expect(useAppStore().sidebarCollapsed).toBe(true);
  });

  it('本地值非 "1" 时视为展开（容错）', () => {
    localStorage.setItem('app.sidebarCollapsed', 'true');
    setActivePinia(createPinia());

    expect(useAppStore().sidebarCollapsed).toBe(false);
  });

  it('setSidebarCollapsed 幂等设置同一值', () => {
    const app = useAppStore();
    app.setSidebarCollapsed(true);
    app.setSidebarCollapsed(true);

    expect(app.sidebarCollapsed).toBe(true);
    expect(localStorage.getItem('app.sidebarCollapsed')).toBe('1');
  });
});

describe('app store · 表格密度', () => {
  it('无本地记录时默认「舒适」，且不写 data-density（默认外观不依赖属性）', () => {
    const app = useAppStore();

    expect(app.tableDensity).toBe('default');
    expect(document.documentElement.dataset.density).toBeUndefined();
  });

  it('setTableDensity 持久化并同步 <html data-density>，切回舒适即移除属性', () => {
    const app = useAppStore();

    app.setTableDensity('compact');
    expect(localStorage.getItem('app.tableDensity')).toBe('compact');
    expect(document.documentElement.dataset.density).toBe('compact');

    app.setTableDensity('default');
    expect(localStorage.getItem('app.tableDensity')).toBe('default');
    expect(document.documentElement.dataset.density).toBeUndefined();
  });

  it('toggleTableDensity 两态互切', () => {
    const app = useAppStore();

    app.toggleTableDensity();
    expect(app.tableDensity).toBe('compact');

    app.toggleTableDensity();
    expect(app.tableDensity).toBe('default');
  });

  it('新会话按本地记录恢复，store 初始化即作用到 DOM（首屏不闪）', () => {
    localStorage.setItem('app.tableDensity', 'compact');
    setActivePinia(createPinia());

    expect(useAppStore().tableDensity).toBe('compact');
    expect(document.documentElement.dataset.density).toBe('compact');
  });

  it('本地脏值回退舒适，不把界面锁在紧凑态', () => {
    localStorage.setItem('app.tableDensity', 'dense');
    setActivePinia(createPinia());

    expect(useAppStore().tableDensity).toBe('default');
    expect(document.documentElement.dataset.density).toBeUndefined();
  });
});
