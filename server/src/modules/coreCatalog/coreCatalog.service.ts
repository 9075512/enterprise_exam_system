import { allowedMenuKeys, lockRoles } from '../roles/roles.service.js';
import type { Role } from '../../types/domain.js';
import type { ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { query, withTransaction } from '../../db/pool.js';
import { badRequest, conflict, notFound } from '../../utils/errors.js';
import { genId } from '../../utils/id.js';
import { fromDbDateSafe, nowDb } from '../../utils/datetime.js';
import { ADMIN_REQUIRED_KEYS, ALL_MENU_KEYS } from '../permissions/menuCatalog.js';
import type {
  MenuOverrideDto,
  PositionDto,
  SubjectDto,
  SubjectGrantDto,
} from '../../types/domain.js';

interface SubjectRow extends RowDataPacket {
  id: string; name: string; parent_id: string | null; sort_order: number;
  status: 'active' | 'disabled'; created_at: string; updated_at: string;
}

const subjectColumns = 'id, name, parent_id, sort_order, status, created_at, updated_at';
const subjectDto = (r: SubjectRow): SubjectDto => ({
  id: r.id, name: r.name, parentId: r.parent_id, sortOrder: Number(r.sort_order), status: r.status,
  createdAt: fromDbDateSafe(r.created_at), updatedAt: fromDbDateSafe(r.updated_at),
});

export async function listSubjects(): Promise<SubjectDto[]> {
  const rows = await query<SubjectRow[]>(`SELECT ${subjectColumns} FROM subjects ORDER BY sort_order, created_at, name`);
  return rows.map(subjectDto);
}

async function findSubject(id: string): Promise<SubjectRow | null> {
  const rows = await query<SubjectRow[]>(`SELECT ${subjectColumns} FROM subjects WHERE id = ? LIMIT 1`, [id]);
  return rows[0] ?? null;
}

async function assertSubjectParent(id: string | null, parentId: string | null): Promise<void> {
  if (!parentId) return;
  if (parentId === id) throw badRequest('上级科目不能是自身');
  if (!(await findSubject(parentId))) throw badRequest('上级科目不存在');
  if (!id) return;
  const all = await query<Array<RowDataPacket & { id: string; parent_id: string | null }>>(
    `SELECT id, parent_id FROM subjects`,
  );
  const byParent = new Map<string, string[]>();
  for (const row of all) {
    if (!row.parent_id) continue;
    const children = byParent.get(row.parent_id) ?? [];
    children.push(row.id);
    byParent.set(row.parent_id, children);
  }
  const queue = [id];
  const seen = new Set(queue);
  while (queue.length) {
    const current = queue.shift()!;
    for (const child of byParent.get(current) ?? []) {
      if (child === parentId) throw badRequest('不能将科目移到其子科目下');
      if (!seen.has(child)) { seen.add(child); queue.push(child); }
    }
  }
}

export async function saveSubject(id: string | null, input: {
  name: string; parentId?: string | null; sortOrder?: number; status?: 'active' | 'disabled';
}): Promise<SubjectDto> {
  const name = input.name.trim();
  if (!name) throw badRequest('科目名称不能为空');
  const parentId = input.parentId?.trim() || null;
  await assertSubjectParent(id, parentId);
  const duplicates = await query<Array<RowDataPacket & { id: string }>>(
    `SELECT id FROM subjects WHERE name = ? AND ${parentId ? 'parent_id = ?' : 'parent_id IS NULL'} LIMIT 1`,
    parentId ? [name, parentId] : [name],
  );
  if (duplicates[0] && duplicates[0].id !== id) throw conflict('同一上级下已存在同名科目');
  const now = nowDb();
  if (id) {
    if (!(await findSubject(id))) throw notFound('科目不存在');
    await query<ResultSetHeader>(
      `UPDATE subjects SET name = ?, parent_id = ?, sort_order = ?, status = ?, updated_at = ? WHERE id = ?`,
      [name, parentId, input.sortOrder ?? 0, input.status ?? 'active', now, id],
    );
    await query<ResultSetHeader>(`UPDATE questions SET subject = ? WHERE subject_id = ?`, [name, id]);
  } else {
    id = genId('subj-');
    await query<ResultSetHeader>(
      `INSERT INTO subjects (id, name, parent_id, sort_order, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [id, name, parentId, input.sortOrder ?? 0, input.status ?? 'active', now, now],
    );
  }
  return subjectDto((await findSubject(id))!);
}

export async function removeSubject(id: string): Promise<void> {
  if (!(await findSubject(id))) throw notFound('科目不存在');
  const refs = await query<Array<RowDataPacket & { children: number; questions: number }>>(
    `SELECT
      (SELECT COUNT(*) FROM subjects WHERE parent_id = ?) AS children,
      (SELECT COUNT(*) FROM questions WHERE subject_id = ?) AS questions`, [id, id],
  );
  if (Number(refs[0]?.children) > 0 || Number(refs[0]?.questions) > 0) {
    throw conflict('科目下存在子科目或试题，请先转移后再删除');
  }
  await query<ResultSetHeader>(`DELETE FROM subjects WHERE id = ?`, [id]);
}

interface OrgRow extends RowDataPacket { id: string; name: string; description: string; created_at: string; updated_at: string }
const orgDto = (r: OrgRow): PositionDto => ({ id: r.id, name: r.name, description: r.description, createdAt: fromDbDateSafe(r.created_at), updatedAt: fromDbDateSafe(r.updated_at) });

export async function listPositions(): Promise<PositionDto[]> {
  return (await query<OrgRow[]>(`SELECT id, name, description, created_at, updated_at FROM positions ORDER BY name`)).map(orgDto);
}
export async function savePosition(id: string | null, input: { name: string; description?: string }): Promise<PositionDto> {
  const name = input.name.trim(); if (!name) throw badRequest('岗位名称不能为空');
  const dup = await query<Array<RowDataPacket & { id: string }>>(`SELECT id FROM positions WHERE name = ? LIMIT 1`, [name]);
  if (dup[0] && dup[0].id !== id) throw conflict('岗位名称已存在');
  const now = nowDb();
  if (id) {
    const result = await query<ResultSetHeader>(`UPDATE positions SET name = ?, description = ?, updated_at = ? WHERE id = ?`, [name, input.description?.trim() ?? '', now, id]);
    if (!result.affectedRows) throw notFound('岗位不存在');
  } else {
    id = genId('pos-');
    await query<ResultSetHeader>(`INSERT INTO positions (id, name, description, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`, [id, name, input.description?.trim() ?? '', now, now]);
  }
  const rows = await query<OrgRow[]>(`SELECT id, name, description, created_at, updated_at FROM positions WHERE id = ?`, [id]);
  return orgDto(rows[0]!);
}
export async function removePosition(id: string): Promise<void> {
  const used = await query<Array<RowDataPacket & { c: number }>>(`SELECT COUNT(*) AS c FROM users WHERE position_id = ?`, [id]);
  if (Number(used[0]?.c) > 0) throw conflict('岗位已被用户使用，请先调整用户');
  const result = await query<ResultSetHeader>(`DELETE FROM positions WHERE id = ?`, [id]);
  if (!result.affectedRows) throw notFound('岗位不存在');
}

interface GrantRow extends RowDataPacket { id: string; subject_id: string; principal_type: SubjectGrantDto['principalType']; principal_id: string; effect: SubjectGrantDto['effect']; can_view: number; can_edit: number }
export async function listSubjectGrants(): Promise<SubjectGrantDto[]> {
  const rows = await query<GrantRow[]>(`SELECT id, subject_id, principal_type, principal_id, effect, can_view, can_edit FROM subject_grants ORDER BY subject_id, principal_type, principal_id`);
  return rows.map((r) => ({ id: r.id, subjectId: r.subject_id, principalType: r.principal_type, principalId: r.principal_id, effect: r.effect, canView: Boolean(r.can_view), canEdit: Boolean(r.can_edit) }));
}
export async function replaceSubjectGrants(subjectId: string, grants: Omit<SubjectGrantDto, 'id' | 'subjectId'>[]): Promise<SubjectGrantDto[]> {
  if (!(await findSubject(subjectId))) throw notFound('科目不存在');
  const now = nowDb();
  await withTransaction(async (conn) => {
    await conn.query(`DELETE FROM subject_grants WHERE subject_id = ?`, [subjectId]);
    for (const grant of grants) {
      await conn.query(
        `INSERT INTO subject_grants (id, subject_id, principal_type, principal_id, effect, can_view, can_edit, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [genId('sgrant-'), subjectId, grant.principalType, grant.principalId, grant.effect, grant.canView ? 1 : 0, grant.canEdit ? 1 : 0, now, now],
      );
    }
  });
  return (await listSubjectGrants()).filter((g) => g.subjectId === subjectId);
}

export async function listMenuOverrides(userId?: string): Promise<MenuOverrideDto[]> {
  const rows = await query<Array<RowDataPacket & { user_id: string; menu_key: string; effect: 'allow' | 'deny' }>>(
    `SELECT user_id, menu_key, effect FROM menu_overrides ${userId ? 'WHERE user_id = ?' : ''} ORDER BY user_id, menu_key`, userId ? [userId] : [],
  );
  return rows.map((r) => ({ userId: r.user_id, menuKey: r.menu_key, effect: r.effect }));
}
export async function replaceMenuOverrides(userId: string, overrides: Array<{ menuKey: string; effect: 'allow' | 'deny' }>): Promise<MenuOverrideDto[]> {
  const unknown = overrides.find((item) => !ALL_MENU_KEYS.includes(item.menuKey));
  if (unknown) throw badRequest(`无效的菜单权限项：${unknown.menuKey}`);
  const duplicate = overrides.find((item, index) => overrides.findIndex((other) => other.menuKey === item.menuKey) !== index);
  if (duplicate) throw badRequest(`菜单权限项重复：${duplicate.menuKey}`);
  const now = nowDb();
  await withTransaction(async (conn) => {
    await lockRoles(conn);
    const [user] = await conn.query<Array<RowDataPacket & { role: Role }>>('SELECT role FROM users WHERE id = ? LIMIT 1', [userId]);
    if (!user[0]) throw notFound('用户不存在');
    const allowed = allowedMenuKeys(user[0].role);
    if (overrides.some(item => !allowed.includes(item.menuKey))) throw badRequest('包含基础身份不能访问的菜单');
    if (user[0].role === 'admin' && overrides.some(item => item.effect === 'deny' && ADMIN_REQUIRED_KEYS.includes(item.menuKey))) {
      throw badRequest('管理员必备菜单不可拒绝');
    }
    await conn.query(`DELETE FROM menu_overrides WHERE user_id = ?`, [userId]);
    for (const item of overrides) await conn.query(`INSERT INTO menu_overrides (user_id, menu_key, effect, updated_at) VALUES (?, ?, ?, ?)`, [userId, item.menuKey, item.effect, now]);
  });
  return listMenuOverrides(userId);
}
