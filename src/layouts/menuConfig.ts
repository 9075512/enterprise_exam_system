/**
 * 侧栏菜单配置与按角色过滤（权限三重同步之一，§9-14）。
 * icon 使用 @element-plus/icons-vue 组件对象。
 */
import type { Component } from 'vue';
import {
  AlarmClock,
  Collection,
  DataBoard,
  Document,
  OfficeBuilding,
  Setting,
  TrendCharts,
  User,
} from '@element-plus/icons-vue';
import type { Role } from '@/types';

export interface MenuItem {
  text: string;
  path: string;
  icon: Component;
  roles: Role[];
}

/** 全部菜单项（path 必须与 router/index.ts 中 layout children 一一对应） */
const ALL_MENUS: MenuItem[] = [
  { text: '数据总览', path: '/admin/dashboard', icon: DataBoard, roles: ['admin'] },
  { text: '科室管理', path: '/admin/departments', icon: OfficeBuilding, roles: ['admin'] },
  { text: '用户管理', path: '/admin/users', icon: User, roles: ['admin'] },
  { text: '题库管理', path: '/author/banks', icon: Collection, roles: ['admin', 'author'] },
  { text: '试卷管理', path: '/author/papers', icon: Document, roles: ['admin', 'author'] },
  { text: '考试管理', path: '/admin/exams', icon: AlarmClock, roles: ['admin'] },
  { text: '成绩报表', path: '/admin/scores', icon: TrendCharts, roles: ['admin'] },
  { text: '系统设置', path: '/admin/settings', icon: Setting, roles: ['admin'] },
  { text: '我的考试', path: '/exam/my', icon: AlarmClock, roles: ['examinee'] },
  { text: '我的成绩', path: '/exam/scores', icon: TrendCharts, roles: ['examinee'] },
];

/** 按角色过滤菜单项 */
export function getMenuItems(role: Role): MenuItem[] {
  return ALL_MENUS.filter((item) => item.roles.includes(role));
}

/** 角色首页路径 */
export function getHomePath(role: Role): string {
  if (role === 'admin') return '/admin/dashboard';
  if (role === 'author') return '/author/banks';
  return '/exam/my';
}
