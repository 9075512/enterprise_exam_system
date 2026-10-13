/**
 * 菜单权限 —— 数据访问层。
 */
import type { RowDataPacket } from 'mysql2/promise';
import { query, runQuery, type SqlExecutor } from '../../db/pool.js';
import { nowDb } from '../../utils/datetime.js';
import type { Role } from '../../types/domain.js';

/** `menu_permissions` 表原始行。 */
export interface MenuPermissionRow extends RowDataPacket {
  role: Role;
  menu_keys: unknown;
}

/** 读取全部角色的菜单权限行。 */
export async function findAll(): Promise<MenuPermissionRow[]> {
  return query<MenuPermissionRow[]>('SELECT role, menu_keys FROM menu_permissions');
}

/** 按角色读取一行。 */
export async function findByRole(role: Role): Promise<MenuPermissionRow | null> {
  const rows = await query<MenuPermissionRow[]>(
    'SELECT role, menu_keys FROM menu_permissions WHERE role = ? LIMIT 1',
    [role],
  );
  return rows[0] ?? null;
}

/** 写入单个角色的菜单权限（UPSERT）。 */
export async function upsert(
  role: Role,
  menuKeys: string[],
  operatorId: string,
  exec?: SqlExecutor,
): Promise<void> {
  await runQuery(
    exec,
    `INSERT INTO menu_permissions (role, menu_keys, updated_by, updated_at)
     VALUES (?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE menu_keys = VALUES(menu_keys), updated_by = VALUES(updated_by), updated_at = VALUES(updated_at)`,
    [role, JSON.stringify(menuKeys), operatorId, nowDb()],
  );
}
