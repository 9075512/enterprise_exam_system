/**
 * 菜单目录（后端权威来源，用于校验 + 默认权限）。
 * 与前端 `src/layouts/menuConfig.ts` 的菜单 key 一一对应（跨端约定）。
 *
 * 说明：
 * - `key` 同时作为路由 `meta.menuKey` 与菜单权限的授权粒度。
 * - `defaultRoles` 为内置默认可见角色（menu_permissions 无该角色行时回退）。
 * - `adminRequired` 标记「管理员不可关闭」的菜单（防止管理员把自己锁在门外）。
 */
import type { MenuCatalogItemDto, Role } from '../../types/domain.js';

export interface MenuDef {
  key: string;
  name: string;
  defaultRoles: Role[];
  adminRequired: boolean;
}

export const MENU_CATALOG: readonly MenuDef[] = [
  { key: 'dashboard', name: '数据总览', defaultRoles: ['admin'], adminRequired: false },
  { key: 'departments', name: '科室管理', defaultRoles: ['admin'], adminRequired: false },
  { key: 'users', name: '用户管理', defaultRoles: ['admin'], adminRequired: false },
  { key: 'subjects', name: '科目管理', defaultRoles: ['admin'], adminRequired: false },
  { key: 'banks', name: '题库管理', defaultRoles: ['admin', 'author'], adminRequired: false },
  { key: 'papers', name: '试卷管理', defaultRoles: ['admin', 'author'], adminRequired: false },
  { key: 'templates', name: '模板管理', defaultRoles: ['admin', 'author'], adminRequired: false },
  { key: 'question-feedback', name: '题目反馈', defaultRoles: ['admin', 'author'], adminRequired: false },
  { key: 'duplicate-questions', name: '重复题审计', defaultRoles: ['admin'], adminRequired: false },
  { key: 'exams', name: '考试管理', defaultRoles: ['admin'], adminRequired: false },
  { key: 'scores', name: '成绩报表', defaultRoles: ['admin'], adminRequired: false },
  { key: 'reviews', name: '人工阅卷', defaultRoles: ['admin', 'author'], adminRequired: false },
  { key: 'retakes', name: '补考管理', defaultRoles: ['admin'], adminRequired: false },
  { key: 'appeals', name: '成绩复核', defaultRoles: ['admin'], adminRequired: false },
  { key: 'practice-settings', name: '练题端设置', defaultRoles: ['admin'], adminRequired: false },
  { key: 'practice-monitor', name: '练题监控', defaultRoles: ['admin'], adminRequired: false },
  { key: 'practice', name: '在线练题', defaultRoles: ['admin', 'author', 'examinee'], adminRequired: false },
  { key: 'content', name: '公告与轮播', defaultRoles: ['admin'], adminRequired: false },
  { key: 'home-config', name: '首页配置', defaultRoles: ['admin'], adminRequired: false },
  { key: 'org-extensions', name: '组织扩展', defaultRoles: ['admin'], adminRequired: false },
  { key: 'settings', name: '系统设置', defaultRoles: ['admin'], adminRequired: true },
  { key: 'permissions', name: '菜单权限', defaultRoles: ['admin'], adminRequired: true },
  { key: 'audit', name: '审计日志', defaultRoles: ['admin'], adminRequired: false },
  { key: 'login-logs', name: '登录日志', defaultRoles: ['admin'], adminRequired: false },
  { key: 'maintenance', name: '系统维护', defaultRoles: ['admin'], adminRequired: false },
  { key: 'home', name: '首页', defaultRoles: ['examinee'], adminRequired: false },
  { key: 'my-exams', name: '我的考试', defaultRoles: ['examinee'], adminRequired: false },
  { key: 'my-scores', name: '我的成绩', defaultRoles: ['examinee'], adminRequired: false },
  { key: 'my-retakes', name: '我的补考', defaultRoles: ['examinee'], adminRequired: false },
  { key: 'exam-messages', name: '消息中心', defaultRoles: ['examinee'], adminRequired: false },
];

/** 全部合法菜单 key。 */
export const ALL_MENU_KEYS: readonly string[] = MENU_CATALOG.map((m) => m.key);

/** 对管理端暴露的目录 DTO。 */
export function catalogDto(): MenuCatalogItemDto[] {
  return MENU_CATALOG.map((m) => ({
    key: m.key,
    name: m.name,
    defaultRoles: [...m.defaultRoles],
    adminRequired: m.adminRequired,
  }));
}

/** 内置默认授权：角色 → 菜单 key 列表。 */
export function defaultGrants(): Record<Role, string[]> {
  const grants: Record<Role, string[]> = { admin: [], author: [], examinee: [] };
  for (const m of MENU_CATALOG) {
    for (const r of m.defaultRoles) grants[r].push(m.key);
  }
  return grants;
}

/** 管理员必授菜单 key（不可被取消）。 */
export const ADMIN_REQUIRED_KEYS: readonly string[] = MENU_CATALOG.filter(
  (m) => m.adminRequired,
).map((m) => m.key);
