/**
 * 侧栏菜单配置与按角色过滤（权限三重同步之一，§9-14）。
 * icon 使用 @element-plus/icons-vue 组件对象。
 *
 * v1.5 起菜单支持「菜单权限」：每个菜单项有唯一 `key`（与后端 menuCatalog 一一对应），
 * `getMenuGroups(role, grantedKeys?)` 优先按后端下发的授权 key 过滤，
 * 未下发时回退到内置默认角色（`roles`）。
 *
 * v1.9 起菜单改为**二级分组**（左边菜单「有点乱」的整改）：
 *   数据中心 / 教学资源 / 考试运营 / 练题运营 / 组织与系统 / 考生中心
 * 分组只是**展示层**概念——菜单 key 与后端 MENU_CATALOG 完全不变，
 * 因此菜单权限矩阵、路由 meta.menuKey、后端 requireRole 三重同步不受影响。
 *
 * 展示规则：普通分组仅 1 项时直接渲染为顶层菜单；“学习中心”固定保留二级结构，
 * 明确呈现“学习中心 → 练题”的产品入口。
 */
import type { Component } from 'vue';
import {
  AlarmClock,
  Bell,
  Collection,
  DataBoard,
  Document,
  EditPen,
  FolderOpened,
  HomeFilled,
  Lock,
  Notebook,
  OfficeBuilding,
  Refresh,
  Setting,
  TrendCharts,
  User,
  Tickets,
  Tools,
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
  /** 所属分组 key（对应 MenuGroupDef.key） */
  group: string;
}

export interface MenuGroupDef {
  key: string;
  text: string;
  icon: Component;
}

/** 分组定义与顺序（仅管理端 + 考生中心；分组本身不参与权限校验）。 */
export const MENU_GROUP_DEFS: readonly MenuGroupDef[] = [
  { key: 'dashboard', text: '数据中心', icon: DataBoard },
  { key: 'resources', text: '教学资源', icon: Collection },
  { key: 'exam-ops', text: '考试运营', icon: AlarmClock },
  { key: 'practice-ops', text: '练题运营', icon: Notebook },
  { key: 'learning', text: '学习中心', icon: Notebook },
  { key: 'system', text: '组织与系统', icon: Setting },
  { key: 'examinee', text: '考生中心', icon: Tickets },
];

/** 分组展示名（菜单权限页按分组归类用）。 */
export function groupTextOf(groupKey: string): string {
  return MENU_GROUP_DEFS.find((g) => g.key === groupKey)?.text ?? '其他';
}

/** 分组排序权重（菜单权限页按此顺序展示）。 */
export function groupOrderOf(groupKey: string): number {
  const idx = MENU_GROUP_DEFS.findIndex((g) => g.key === groupKey);
  return idx < 0 ? MENU_GROUP_DEFS.length : idx;
}

/** 菜单 key → 所属分组 key（菜单权限页归类用）；未知 key 归入末尾「其他」。 */
export function groupKeyOf(menuKey: string): string {
  return ALL_MENUS.find((m) => m.key === menuKey)?.group ?? 'other';
}

/** 全部菜单项（path 必须与 router/index.ts 中 layout children 一一对应）。 */
const ALL_MENUS: MenuItem[] = [
  { key: 'dashboard', text: '数据总览', path: '/admin/dashboard', icon: DataBoard, roles: ['admin'], group: 'dashboard' },
  { key: 'subjects', text: '科目管理', path: '/admin/subjects', icon: FolderOpened, roles: ['admin'], group: 'resources' },
  { key: 'banks', text: '题库管理', path: '/author/banks', icon: Collection, roles: ['admin', 'author'], group: 'resources' },
  { key: 'templates', text: '模板管理', path: '/admin/templates', icon: Document, roles: ['admin', 'author'], group: 'resources' },
  { key: 'question-feedback', text: '题目反馈', path: '/admin/question-feedback', icon: EditPen, roles: ['admin', 'author'], group: 'resources' },
  { key: 'duplicate-questions', text: '重复题审计', path: '/admin/duplicate-questions', icon: Tickets, roles: ['admin'], group: 'resources' },
  { key: 'exams', text: '考试管理', path: '/admin/exams', icon: AlarmClock, roles: ['admin', 'author'], group: 'exam-ops' },
  { key: 'retakes', text: '补考管理', path: '/admin/retakes', icon: Refresh, roles: ['admin'], group: 'exam-ops' },
  { key: 'appeals', text: '成绩复核', path: '/admin/appeals', icon: EditPen, roles: ['admin'], group: 'exam-ops' },
  { key: 'reviews', text: '人工阅卷', path: '/admin/reviews', icon: EditPen, roles: ['admin', 'author'], group: 'exam-ops' },
  { key: 'scores', text: '成绩报表', path: '/admin/scores', icon: TrendCharts, roles: ['admin'], group: 'exam-ops' },
  { key: 'content', text: '公告与轮播', path: '/admin/content', icon: Bell, roles: ['admin'], group: 'exam-ops' },
  { key: 'home-config', text: '首页配置', path: '/admin/home-config', icon: HomeFilled, roles: ['admin'], group: 'exam-ops' },
  { key: 'practice-settings', text: '练题端设置', path: '/admin/practice-settings', icon: Notebook, roles: ['admin'], group: 'practice-ops' },
  { key: 'practice-monitor', text: '练题监控', path: '/admin/practice-monitor', icon: DataBoard, roles: ['admin'], group: 'practice-ops' },
  { key: 'practice', text: '练题', path: '/exam/practice', icon: Notebook, roles: ['admin', 'author', 'examinee'], group: 'learning' },
  { key: 'departments', text: '科室管理', path: '/admin/departments', icon: OfficeBuilding, roles: ['admin'], group: 'system' },
  { key: 'users', text: '用户管理', path: '/admin/users', icon: User, roles: ['admin'], group: 'system' },
  { key: 'org-extensions', text: '用户组与岗位', path: '/admin/org-extensions', icon: OfficeBuilding, roles: ['admin'], group: 'system' },
  { key: 'permissions', text: '菜单权限', path: '/admin/permissions', icon: Lock, roles: ['admin'], group: 'system' },
  { key: 'settings', text: '系统设置', path: '/admin/settings', icon: Setting, roles: ['admin'], group: 'system' },
  { key: 'audit', text: '审计日志', path: '/admin/audit', icon: Tickets, roles: ['admin'], group: 'system' },
  { key: 'login-logs', text: '登录日志', path: '/admin/login-logs', icon: Lock, roles: ['admin'], group: 'system' },
  { key: 'maintenance', text: '系统维护', path: '/admin/maintenance', icon: Tools, roles: ['admin'], group: 'system' },
  { key: 'home', text: '首页', path: '/exam/home', icon: HomeFilled, roles: ['examinee'], group: 'examinee' },
  { key: 'my-exams', text: '我的考试', path: '/exam/my', icon: AlarmClock, roles: ['examinee'], group: 'examinee' },
  { key: 'my-scores', text: '我的成绩', path: '/exam/scores', icon: TrendCharts, roles: ['examinee'], group: 'examinee' },
  { key: 'my-retakes', text: '我的补考', path: '/exam/retakes', icon: Refresh, roles: ['examinee'], group: 'examinee' },
  { key: 'exam-messages', text: '消息中心', path: '/notifications', icon: Bell, roles: ['examinee'], group: 'examinee' },
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

/** 渲染用分组（组内菜单已过滤；空组不出现在结果中）。 */
export interface RenderGroup extends MenuGroupDef {
  items: MenuItem[];
}

/**
 * 生成侧栏渲染结构：过滤 → 按分组定义顺序归组 → 丢弃空组。
 * 组内仅 1 项时调用方可直接渲染为顶层菜单项（本函数不做展开，交由视图决定）。
 */
export function getMenuGroups(role: Role, grantedKeys?: string[] | null): RenderGroup[] {
  const items = getMenuItems(role, grantedKeys);
  const buckets = new Map<string, MenuItem[]>();
  for (const item of items) {
    const list = buckets.get(item.group);
    if (list) list.push(item);
    else buckets.set(item.group, [item]);
  }
  return MENU_GROUP_DEFS.filter((g) => buckets.has(g.key)).map((g) => ({
    ...g,
    items: buckets.get(g.key)!,
  }));
}

/** 角色首页路径（考生自 v1.9⑦ 起落「首页」而非「我的考试」）。 */
export function getHomePath(role: Role): string {
  if (role === 'admin') return '/admin/dashboard';
  if (role === 'author') return '/author/banks';
  return '/exam/home';
}
