import * as repo from './permissions.repo.js';
import { ADMIN_REQUIRED_KEYS, ALL_MENU_KEYS, catalogDto } from './menuCatalog.js';
import { badRequest } from '../../utils/errors.js';
import { query, withTransaction, runQuery } from '../../db/pool.js';
import * as audit from '../audit/audit.service.js';
import * as roles from '../roles/roles.service.js';
import type { MenuGrantsDto, MenuPermissionDto, MyMenusDto, Role } from '../../types/domain.js';
import type { RowDataPacket } from 'mysql2/promise';

export async function getMenuPermissions(): Promise<MenuPermissionDto> {
  const definitions = await roles.list();
  return { catalog: catalogDto(), roles: definitions, grants: Object.fromEntries(definitions.map(r => [r.id, r.menuKeys])) };
}

export async function getMyMenus(baseRole: Role, userId?: string): Promise<MyMenusDto> {
  let roleId: string = baseRole;
  if (userId) {
    const users = await query<RowDataPacket[]>('SELECT role_id FROM users WHERE id = ?', [userId]);
    if (!users[0]) return { menus: [] };
    roleId = String(users[0].role_id);
  }
  const definition = await roles.getDefinition(roleId);
  const menus = new Set(definition.menuKeys);
  if (userId) {
    const overrides = await query<RowDataPacket[]>('SELECT menu_key, effect FROM menu_overrides WHERE user_id = ?', [userId]);
    const allowed = roles.allowedMenuKeys(definition.baseRole);
    for (const row of overrides) {
      if (!ALL_MENU_KEYS.includes(row.menu_key) || !allowed.includes(row.menu_key)) continue;
      if (row.effect === 'allow') menus.add(row.menu_key);
      else if (!(definition.baseRole === 'admin' && ADMIN_REQUIRED_KEYS.includes(row.menu_key))) menus.delete(row.menu_key);
    }
  }
  return { menus: [...menus] };
}

export async function updateMenuPermissions(input: unknown, operatorId: string): Promise<MenuPermissionDto> {
  const raw = input as { grants?: Record<string, unknown> };
  if (!raw || !raw.grants || typeof raw.grants !== 'object' || Array.isArray(raw.grants)) throw badRequest('请求参数不合法');
  await withTransaction(async conn => {
    await roles.lockRoles(conn);
    const definitions = await roles.list(conn);
    if (Object.keys(raw.grants!).some(id => !definitions.some(r => r.id === id))) throw badRequest('包含不存在的角色，请刷新后重试');
    const next: MenuGrantsDto = {};
    for (const role of definitions) {
      if (!(role.id in raw.grants!)) throw badRequest('角色列表已变化，请刷新后重试');
      next[role.id] = roles.normalizeMenuKeys(role.baseRole, raw.grants![role.id]);
    }
    for (const role of definitions) {
      const keys = next[role.id];
      await repo.upsert(role.id, keys, operatorId, conn);
      if (JSON.stringify([...role.menuKeys].sort()) !== JSON.stringify([...keys].sort())) {
        const users = await runQuery<RowDataPacket[]>(conn, 'SELECT id FROM users WHERE role_id = ?', [role.id]);
        await roles.revokeUsers(users.map(u => String(u.id)), conn);
      }
    }
  });
  await audit.record({ actorId: operatorId, action: 'permission.update', targetType: 'permission', targetName: '菜单权限' });
  return getMenuPermissions();
}
