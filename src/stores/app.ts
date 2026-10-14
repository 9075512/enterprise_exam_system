/**
 * 应用级 UI 状态 store（Pinia）。
 * 仅存放需要跨页面共享的界面状态；纯布局内部状态可用局部 ref 替代。
 */
import { defineStore } from 'pinia';
import { ref } from 'vue';

/** 侧栏折叠状态存储 key（v2.1：跨会话记忆，刷新后保持上次选择） */
const SIDEBAR_COLLAPSED_KEY = 'app.sidebarCollapsed';

/** 表格密度存储 key（v2.1 §8.3） */
const TABLE_DENSITY_KEY = 'app.tableDensity';

/**
 * 表格密度：`default` 舒适（≈38px 行高）/ `compact` 紧凑（≈32px 行高）。
 * 只影响表格行高节奏，不影响字号、主题与其它组件。
 */
export type TableDensity = 'default' | 'compact';

/** 读取折叠状态（localStorage 不可用时回退展开态） */
function readCollapsed(): boolean {
  try {
    return localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === '1';
  } catch {
    return false;
  }
}

/** 写入折叠状态（写入失败静默忽略） */
function writeCollapsed(value: boolean): void {
  try {
    localStorage.setItem(SIDEBAR_COLLAPSED_KEY, value ? '1' : '0');
  } catch {
    /* 忽略：隐私模式等场景下不可写 */
  }
}

/** 读取密度（任何非 compact 的值均回退为舒适，避免脏数据把界面锁在紧凑态） */
function readDensity(): TableDensity {
  try {
    return localStorage.getItem(TABLE_DENSITY_KEY) === 'compact' ? 'compact' : 'default';
  } catch {
    return 'default';
  }
}

/** 写入密度（写入失败静默忽略） */
function writeDensity(value: TableDensity): void {
  try {
    localStorage.setItem(TABLE_DENSITY_KEY, value);
  } catch {
    /* 忽略 */
  }
}

/**
 * 把密度落到 `<html data-density>` —— 全局样式的作用域开关（styles/index.scss）。
 * 舒适态**移除属性**而非写成 `data-density="default"`，保证默认外观不依赖属性存在。
 */
export function applyTableDensity(value: TableDensity): void {
  if (typeof document === 'undefined') return;
  if (value === 'compact') {
    document.documentElement.dataset.density = 'compact';
  } else {
    delete document.documentElement.dataset.density;
  }
}

export const useAppStore = defineStore('app', () => {
  /** 侧栏是否折叠 */
  const sidebarCollapsed = ref(readCollapsed());

  /** 表格密度（持久化 + 立即作用于 DOM） */
  const tableDensity = ref<TableDensity>(readDensity());
  applyTableDensity(tableDensity.value);

  /** 切换侧栏折叠状态 */
  function toggleSidebar(): void {
    setSidebarCollapsed(!sidebarCollapsed.value);
  }

  /** 显式设置侧栏折叠状态 */
  function setSidebarCollapsed(value: boolean): void {
    sidebarCollapsed.value = value;
    writeCollapsed(value);
  }

  /** 显式设置表格密度 */
  function setTableDensity(value: TableDensity): void {
    tableDensity.value = value;
    writeDensity(value);
    applyTableDensity(value);
  }

  /** 在舒适 / 紧凑之间切换 */
  function toggleTableDensity(): void {
    setTableDensity(tableDensity.value === 'compact' ? 'default' : 'compact');
  }

  return {
    sidebarCollapsed,
    toggleSidebar,
    setSidebarCollapsed,
    tableDensity,
    setTableDensity,
    toggleTableDensity,
  };
});
