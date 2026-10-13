/**
 * 菜单权限 —— 业务逻辑层。
 * 读取时合并内置默认（缺角色行 = 使用 defaultGrants）；写入时校验 key 合法 + 管理员必授菜单不可移除。
 */
import * as repo from './permissions.repo.js';
import {
  ADMIN_REQUIRED_KEYS,
  ALL_MENU_KEYS,
  catalogDto,
  defaultGrants,
} from './menuCatalog.js';
import { parseJsonColumn } from '../../utils/json.js';
import { badRequest } from '../../utils/errors.js';
import { withTransaction } from '../../db/pool.js';
import * as auditService from '../audit/audit.service.js';
import type { MenuGrantsDto, MenuPermissionDto, MyMenusDto, Role } from '../../types/domain.js';

const ROLES: Role[] = ['admin', 'author', 'examinee'];

/** 读取某个角色的有效菜单授权（缺行回退默认）。 */
async function grantsFor(role: Role): Promise<string[]> {
  const row = await repo.findByRole(role);
  if (!row) return defaultGrants()[role];
  const stored = parseJsonColumn<string[]>(row.menu_keys, []);
  // 兜底：管理员必授菜单恒存在（防止历史数据/手工改动造成自锁）
  if (role === 'admin') {
    for (const k of ADMIN_REQUIRED_KEYS) {
      if (!stored.includes(k)) stored.push(k);
    }
  }
  return stored;
}

/** 读取全部角色的有效授权。 */
async function grantsAll(): Promise<MenuGrantsDto> {
  const result: MenuGrantsDto = { admin: [], author: [], examinee: [] };
  for (const r of ROLES) result[r] = await grantsFor(r);
  return result;
}

/** 管理端完整视图：目录 + 授权。 */
export async function getMenuPermissions(): Promise<MenuPermissionDto> {
  const [catalog, grants] = await Promise.all([Promise.resolve(catalogDto()), grantsAll()]);
  return { catalog, grants };
}

/** 当前登录用户的可见菜单 key 列表。 */
export async function getMyMenus(role: Role): Promise<MyMenusDto> {
  return { menus: await grantsFor(role) };
}

/** 更新菜单授权（整体替换语义）。 */
export async function updateMenuPermissions(
  input: unknown,
  operatorId: string,
): Promise<MenuPermissionDto> {
  const raw = input as { grants?: Record<string, unknown> };
  if (!raw || typeof raw.grants !== 'object' || raw.grants === null) {
    throw badRequest('请求参数不合法');
  }

  const next: MenuGrantsDto = { admin: [], author: [], examinee: [] };
  for (const r of ROLES) {
    const value = raw.grants[r];
    if (!Array.isArray(value)) throw badRequest('请求参数不合法');
    const keys = [...new Set(value.map((v) => String(v)))];
    for (const k of keys) {
      if (!ALL_MENU_KEYS.includes(k)) throw badRequest(`存在未知菜单项：${k}`);
    }
    next[r] = keys;
  }

  // 管理员必授菜单恒在（防自锁）
  for (const k of ADMIN_REQUIRED_KEYS) {
    if (!next.admin.includes(k)) next.admin.push(k);
  }

  await withTransaction(async (conn) => {
    for (const r of ROLES) {
      await repo.upsert(r, next[r], operatorId, conn);
    }
  });

  await auditService.record({
    actorId: operatorId,
    action: 'permission.update',
    targetType: 'permission',
    targetName: '菜单权限',
    detail: {
      admin: next.admin.length,
      author: next.author.length,
      examinee: next.examinee.length,
    },
  });

  return { catalog: catalogDto(), grants: next };
}
