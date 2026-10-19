import type { RowDataPacket } from 'mysql2/promise';
import { query, runQuery, withTransaction, type SqlExecutor } from '../../db/pool.js';
import type { Role, RoleDefinitionDto } from '../../types/domain.js';
import { badRequest, conflict } from '../../utils/errors.js';
import { genId } from '../../utils/id.js';
import { fromDbDateSafe } from '../../utils/datetime.js';
import { parseJsonColumn } from '../../utils/json.js';
import { MENU_CATALOG, ADMIN_REQUIRED_KEYS, defaultGrants } from '../permissions/menuCatalog.js';
import * as permissionsRepo from '../permissions/permissions.repo.js';
import * as audit from '../audit/audit.service.js';

interface RoleRow extends RowDataPacket {
  id: string; name: string; base_role: Role; description: string; is_builtin: number;
  created_at: string; updated_at: string; member_count: number; menu_keys: unknown;
}

export function allowedMenuKeys(baseRole: Role): string[] {
  return MENU_CATALOG.filter(m => m.defaultRoles.includes(baseRole) || m.key === 'exam-messages').map(m => m.key);
}

export function normalizeMenuKeys(baseRole: Role, keys: unknown): string[] {
  if (!Array.isArray(keys) || keys.some(k => typeof k !== 'string')) throw badRequest('菜单权限格式不合法');
  const allowed = new Set(allowedMenuKeys(baseRole));
  if (keys.some(k => !allowed.has(k))) throw badRequest('包含基础身份不能访问的菜单');
  return [...new Set([...keys, ...(baseRole === 'admin' ? ADMIN_REQUIRED_KEYS : [])])];
}

export async function list(exec?: SqlExecutor): Promise<RoleDefinitionDto[]> {
  const rows = await runQuery<RoleRow[]>(exec, `SELECT r.*, GREATEST(r.updated_at, COALESCE(p.updated_at, r.updated_at)) AS updated_at,
    (SELECT COUNT(*) FROM users u WHERE u.role_id = r.id) AS member_count, p.menu_keys
    FROM roles r LEFT JOIN menu_permissions p ON p.role = r.id ORDER BY r.is_builtin DESC, r.created_at, r.id`);
  return rows.map(r => ({ id: r.id, name: r.name, baseRole: r.base_role, description: r.description,
    isBuiltin: Boolean(r.is_builtin), memberCount: Number(r.member_count),
    menuKeys: normalizeMenuKeys(r.base_role, parseJsonColumn<string[]>(r.menu_keys,
      r.is_builtin ? defaultGrants()[r.base_role] : []).filter(k => allowedMenuKeys(r.base_role).includes(k))),
    createdAt: fromDbDateSafe(r.created_at), updatedAt: fromDbDateSafe(r.updated_at) }));
}

export async function getDefinition(id: string, exec?: SqlExecutor): Promise<RoleDefinitionDto> {
  const role = (await list(exec)).find(r => r.id === id);
  if (!role) throw badRequest('角色不存在，请重新选择');
  return role;
}

// Shared lock order for role/member/user writes, including concurrent last-admin changes.
export async function lockRoles(exec: SqlExecutor): Promise<void> {
  await runQuery(exec, 'SELECT id FROM roles ORDER BY id FOR UPDATE');
}

export async function assertAdministratorRemains(exec: SqlExecutor): Promise<void> {
  const rows = await runQuery<RowDataPacket[]>(exec, "SELECT id FROM users WHERE role = 'admin' AND status = 'active' LIMIT 1");
  if (!rows.length) throw conflict('必须保留至少一个启用中的管理员');
}

export async function revokeUsers(ids: string[], exec: SqlExecutor): Promise<void> {
  if (!ids.length) return;
  await runQuery(exec, `UPDATE user_sessions SET revoked_at = NOW(3)
    WHERE user_id IN (${ids.map(() => '?').join(',')}) AND revoked_at IS NULL`, ids);
}

export interface RoleInput { name: string; baseRole: Role; description: string; menuKeys?: string[] }

export async function save(id: string | null, input: RoleInput, operatorId: string): Promise<RoleDefinitionDto> {
  if (['admin', 'author', 'examinee'].includes(input.name.toLowerCase())) throw badRequest('角色名称不能使用内置身份代码');
  const roleId = id ?? genId('role-');
  await withTransaction(async conn => {
    await lockRoles(conn);
    const current = id ? await getDefinition(id, conn) : null;
    if (current && current.baseRole !== input.baseRole) throw badRequest('角色基础身份不可修改');
    if (current?.isBuiltin && current.name !== input.name) throw badRequest('内置角色名称不可修改');
    const duplicates = await runQuery<RowDataPacket[]>(conn, 'SELECT id FROM roles WHERE name = ? AND id <> ?', [input.name, roleId]);
    if (duplicates.length) throw conflict('角色名称已存在');
    const base = await getDefinition(input.baseRole, conn);
    const keys = normalizeMenuKeys(input.baseRole, input.menuKeys ?? current?.menuKeys ?? base.menuKeys);
    if (current) {
      await conn.query('UPDATE roles SET name = ?, description = ?, updated_at = NOW(3) WHERE id = ?', [input.name, input.description, roleId]);
    } else {
      await conn.query(`INSERT INTO roles (id, name, base_role, description, is_builtin, created_at, updated_at)
        VALUES (?, ?, ?, ?, 0, NOW(3), NOW(3))`, [roleId, input.name, input.baseRole, input.description]);
    }
    await permissionsRepo.upsert(roleId, keys, operatorId, conn);
    if (current && JSON.stringify([...current.menuKeys].sort()) !== JSON.stringify([...keys].sort())) {
      const members = await runQuery<RowDataPacket[]>(conn, 'SELECT id FROM users WHERE role_id = ?', [roleId]);
      await revokeUsers(members.map(u => String(u.id)), conn);
    }
  });
  await audit.record({ actorId: operatorId, action: id ? 'role.update' : 'role.create', targetType: 'role', targetId: roleId, targetName: input.name });
  return getDefinition(roleId);
}

export async function members(id: string): Promise<string[]> {
  await getDefinition(id);
  const rows = await query<RowDataPacket[]>('SELECT id FROM users WHERE role_id = ? ORDER BY id', [id]);
  return rows.map(r => String(r.id));
}

export async function replaceMembers(id: string, userIds: string[], operatorId: string): Promise<string[]> {
  const next = [...new Set(userIds)];
  await withTransaction(async conn => {
    await lockRoles(conn);
    const role = await getDefinition(id, conn);
    const current = await runQuery<RowDataPacket[]>(conn, 'SELECT id FROM users WHERE role_id = ? FOR UPDATE', [id]);
    const removed = current.map(r => String(r.id)).filter(uid => !next.includes(uid));
    if (role.isBuiltin && removed.length) throw conflict('内置角色成员请通过用户管理切换到其他角色');
    const selected = next.length ? await runQuery<RowDataPacket[]>(conn,
      `SELECT id, role_id, department_id FROM users WHERE id IN (${next.map(() => '?').join(',')}) FOR UPDATE`, next) : [];
    if (selected.length !== next.length) throw badRequest('成员中包含不存在的用户');
    if (role.baseRole === 'examinee' && selected.some(u => !u.department_id)) throw badRequest('考生必须归属一个科室，请先在用户管理中补充');
    const changed = selected.filter(u => u.role_id !== id).map(u => String(u.id));
    for (const uid of changed) await conn.query('UPDATE users SET role_id = ?, role = ? WHERE id = ?', [id, role.baseRole, uid]);
    for (const uid of removed) await conn.query('UPDATE users SET role_id = ?, role = ? WHERE id = ?', [role.baseRole, role.baseRole, uid]);
    await assertAdministratorRemains(conn);
    await revokeUsers([...changed, ...removed], conn);
  });
  await audit.record({ actorId: operatorId, action: 'role.members', targetType: 'role', targetId: id, detail: { userIds: next } });
  return members(id);
}

export async function remove(id: string, operatorId: string): Promise<void> {
  await withTransaction(async conn => {
    await lockRoles(conn);
    const role = await getDefinition(id, conn);
    if (role.isBuiltin) throw conflict('内置角色不可删除');
    if (role.memberCount) throw conflict('角色尚有成员，请先调整成员角色');
    await conn.query('DELETE FROM menu_permissions WHERE role = ?', [id]);
    await conn.query('DELETE FROM roles WHERE id = ?', [id]);
  });
  await audit.record({ actorId: operatorId, action: 'role.delete', targetType: 'role', targetId: id });
}
