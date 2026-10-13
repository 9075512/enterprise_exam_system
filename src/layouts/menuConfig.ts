/**
 * 侧栏菜单配置与按角色过滤（权限三重同步之一，§9-14）。
 * icon 使用 @element-plus/icons-vue 组件对象。
 *
 * v1.5 起菜单支持「菜单权限」：每个菜单项有唯一 `key`（与后端 menuCatalog 一一对应），
 * `getMenuItems(role, grantedKeys?)` 优先按后端下发的授权 key 过滤，
 * 未下发时回退到内置默认角色（`roles`）。
 */
import type { Component } from 'vue';
import {
  AlarmClock,
  Collection,
  DataBoard,
  Document,
  EditPen,
  Lock,
  Notebook,
  OfficeBuilding,
  Refresh,
  Setting,
  TrendCharts,
  User,
} from '@element-plus/icons-vue';
import type { Role } from '@/types';

export interface MenuItem {
  /** 菜单唯一 key（与后端 menuCatalog 一致，菜单权限授权粒度） */
  key: string;
  text: string;
  path: string;
  icon: Component;
  /** 内置默认可见角色（菜单权限未配置时回退） */
  roles: Role[];
}

/** 全部菜单项（path 必须与 router/index.ts 中 layout children 一一对应） */
const ALL_MENUS: MenuItem[] = [
  { key: 'dashboard', text: '数据总览', path: '/admin/dashboard', icon: DataBoard, roles: ['admin'] },
  { key: 'departments', text: '科室管理', path: '/admin/departments', icon: OfficeBuilding, roles: ['admin'] },
  { key: 'users', text: '用户管理', path: '/admin/users', icon: User, roles: ['admin'] },
  { key: 'banks', text: '题库管理', path: '/author/banks', icon: Collection, roles: ['admin', 'author'] },
  { key: 'papers', text: '试卷管理', path: '/author/papers', icon: Document, roles: ['admin', 'author'] },
  { key: 'exams', text: '考试管理', path: '/admin/exams', icon: AlarmClock, roles: ['admin'] },
  { key: 'retakes', text: '补考管理', path: '/admin/retakes', icon: Refresh, roles: ['admin'] },
  { key: 'scores', text: '成绩报表', path: '/admin/scores', icon: TrendCharts, roles: ['admin'] },
  { key: 'reviews', text: '人工阅卷', path: '/admin/reviews', icon: EditPen, roles: ['admin', 'author'] },
  { key: 'practice-settings', text: '练题端设置', path: '/admin/practice-settings', icon: Notebook, roles: ['admin'] },
  { key: 'settings', text: '系统设置', path: '/admin/settings', icon: Setting, roles: ['admin'] },
  { key: 'permissions', text: '菜单权限', path: '/admin/permissions', icon: Lock, roles: ['admin'] },
  { key: 'my-exams', text: '我的考试', path: '/exam/my', icon: AlarmClock, roles: ['examinee'] },
  { key: 'my-scores', text: '我的成绩', path: '/exam/scores', icon: TrendCharts, roles: ['examinee'] },
];

/** 内置默认授权：角色 → 菜单 key 列表（与后端 menuCatalog.defaultGrants 一致）。 */
function buildDefaultKeys(): Record<Role, string[]> {
  const grants: Record<Role, string[]> = { admin: [], author: [], examinee: [] };
  for (const item of ALL_MENUS) {
    for (const r of item.roles) grants[r].push(item.key);
  }
  return grants;
}

const DEFAULT_KEYS = buildDefaultKeys();

/** 角色默认菜单 key（菜单权限未下发时回退）。 */
export function getDefaultKeys(role: Role): string[] {
  return DEFAULT_KEYS[role];
}

/** 按角色 + 授权 key 过滤菜单项（grantedKeys 为 null/undefined 时回退默认角色）。 */
export function getMenuItems(role: Role, grantedKeys?: string[] | null): MenuItem[] {
  if (grantedKeys) {
    const set = new Set(grantedKeys);
    return ALL_MENUS.filter((item) => set.has(item.key));
  }
  return ALL_MENUS.filter((item) => item.roles.includes(role));
}

/** 角色首页路径 */
export function getHomePath(role: Role): string {
  if (role === 'admin') return '/admin/dashboard';
  if (role === 'author') return '/author/banks';
  return '/exam/my';
}
