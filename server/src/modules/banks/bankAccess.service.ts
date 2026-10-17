import type { RowDataPacket } from 'mysql2/promise';
import { query, withTransaction } from '../../db/pool.js';
import { badRequest, forbidden, notFound } from '../../utils/errors.js';
import type { BankAccessConfig, Role } from '../../types/domain.js';
import type { BankRowWithCount } from './banks.repo.js';

export interface AccessOperator { id: string; role: Role }

export interface AccessRows {
  departments: Map<string, string[]>;
  users: Map<string, string[]>;
  editors: Map<string, string[]>;
}

export interface EffectiveAccess {
  sourceBankId: string | null;
  viewAll: boolean;
  includeChildDepartments: boolean;
  departmentIds: string[];
  userIds: string[];
  editorIds: string[];
}

function push(map: Map<string, string[]>, key: string, value: string): void {
  const values = map.get(key) ?? [];
  values.push(value);
  map.set(key, values);
}

export async function loadAccessRows(): Promise<AccessRows> {
  const [departments, users, editors] = await Promise.all([
    query<Array<RowDataPacket & { bank_id: string; department_id: string }>>(`SELECT bank_id, department_id FROM bank_view_departments`),
    query<Array<RowDataPacket & { bank_id: string; user_id: string }>>(`SELECT bank_id, user_id FROM bank_view_users`),
    query<Array<RowDataPacket & { bank_id: string; user_id: string }>>(`SELECT bank_id, user_id FROM bank_authors`),
  ]);
  const result: AccessRows = { departments: new Map(), users: new Map(), editors: new Map() };
  for (const row of departments) push(result.departments, row.bank_id, row.department_id);
  for (const row of users) push(result.users, row.bank_id, row.user_id);
  for (const row of editors) push(result.editors, row.bank_id, row.user_id);
  return result;
}

/** 最近 override 节点的整组配置；根上方的默认配置为“无人浏览”。 */
export function effectiveAccessFor(
  bankId: string,
  rows: BankRowWithCount[],
  access: AccessRows,
): EffectiveAccess {
  const byId = new Map(rows.map((row) => [row.id, row]));
  let cursor: string | null = bankId;
  const seen = new Set<string>();
  while (cursor && !seen.has(cursor)) {
    seen.add(cursor);
    const bank = byId.get(cursor);
    if (!bank) break;
    if (bank.permission_mode === 'override') {
      return {
        sourceBankId: bank.id,
        viewAll: Boolean(Number(bank.view_all)),
        includeChildDepartments: Boolean(Number(bank.include_child_departments)),
        departmentIds: access.departments.get(bank.id) ?? [],
        userIds: access.users.get(bank.id) ?? [],
        editorIds: access.editors.get(bank.id) ?? [],
      };
    }
    cursor = bank.parent_id;
  }
  return { sourceBankId: null, viewAll: false, includeChildDepartments: true, departmentIds: [], userIds: [], editorIds: [] };
}

export function effectiveStatusFor(bankId: string, rows: BankRowWithCount[]): 'active' | 'disabled' {
  const byId = new Map(rows.map((row) => [row.id, row]));
  let cursor: string | null = bankId;
  const seen = new Set<string>();
  while (cursor && !seen.has(cursor)) {
    seen.add(cursor);
    const bank = byId.get(cursor);
    if (!bank) break;
    if (bank.status === 'disabled') return 'disabled';
    cursor = bank.parent_id;
  }
  return 'active';
}

async function userDepartmentId(userId: string): Promise<string | null> {
  const rows = await query<Array<RowDataPacket & { department_id: string | null }>>(
    `SELECT department_id FROM users WHERE id = ? AND status = 'active' LIMIT 1`, [userId],
  );
  return rows[0]?.department_id ?? null;
}

async function departmentMatches(userDepartmentIdValue: string | null, roots: string[], includeChildren: boolean): Promise<boolean> {
  if (!userDepartmentIdValue || roots.length === 0) return false;
  if (roots.includes(userDepartmentIdValue)) return true;
  if (!includeChildren) return false;
  const departments = await query<Array<RowDataPacket & { id: string; parent_id: string | null }>>(`SELECT id, parent_id FROM departments`);
  const byId = new Map(departments.map((row) => [row.id, row.parent_id]));
  let cursor = byId.get(userDepartmentIdValue) ?? null;
  const seen = new Set<string>();
  while (cursor && !seen.has(cursor)) {
    if (roots.includes(cursor)) return true;
    seen.add(cursor);
    cursor = byId.get(cursor) ?? null;
  }
  return false;
}

export async function permissionsFor(
  bankId: string,
  operator: AccessOperator,
  rows: BankRowWithCount[],
  access: AccessRows,
): Promise<{ canView: boolean; canEdit: boolean }> {
  if (operator.role === 'admin') return { canView: true, canEdit: true };
  const effective = effectiveAccessFor(bankId, rows, access);
  const canEdit = operator.role === 'author' && effective.editorIds.includes(operator.id);
  if (canEdit || effective.viewAll || effective.userIds.includes(operator.id)) return { canView: true, canEdit };
  const departmentId = await userDepartmentId(operator.id);
  const departmentAllowed = await departmentMatches(departmentId, effective.departmentIds, effective.includeChildDepartments);
  return { canView: departmentAllowed, canEdit };
}

export async function assertCanView(bankId: string, operator: AccessOperator, rows?: BankRowWithCount[]): Promise<void> {
  const repo = await import('./banks.repo.js');
  const all = rows ?? await repo.list();
  const bank = all.find((item) => item.id === bankId);
  if (!bank) throw notFound('科目题库不存在或已被删除');
  if (operator.role !== 'admin' && effectiveStatusFor(bankId, all) !== 'active') throw forbidden('该科目题库已停用');
  const permission = await permissionsFor(bankId, operator, all, await loadAccessRows());
  if (!permission.canView) throw forbidden('您没有该科目题库的浏览权限');
}

export async function assertCanEdit(bankId: string, operator: AccessOperator, rows?: BankRowWithCount[]): Promise<void> {
  const repo = await import('./banks.repo.js');
  const all = rows ?? await repo.list();
  const bank = all.find((item) => item.id === bankId);
  if (!bank) throw notFound('科目题库不存在或已被删除');
  if (Number(bank.child_count) > 0) throw badRequest('父级科目仅作为目录，不能维护题目');
  if (effectiveStatusFor(bankId, all) !== 'active') throw forbidden('该科目题库已停用');
  const permission = await permissionsFor(bankId, operator, all, await loadAccessRows());
  if (!permission.canEdit) throw forbidden('您没有该科目题库的编辑权限');
}

export async function getAccessConfig(bankId: string): Promise<BankAccessConfig> {
  const repo = await import('./banks.repo.js');
  const rows = await repo.list();
  const bank = rows.find((item) => item.id === bankId);
  if (!bank) throw notFound('科目题库不存在或已被删除');
  const access = await loadAccessRows();
  const effective = effectiveAccessFor(bankId, rows, access);
  return {
    bankId,
    permissionMode: bank.permission_mode,
    viewAll: Boolean(Number(bank.view_all)),
    includeChildDepartments: Boolean(Number(bank.include_child_departments)),
    departmentIds: access.departments.get(bankId) ?? [],
    userIds: access.users.get(bankId) ?? [],
    editorIds: access.editors.get(bankId) ?? [],
    effectiveFromBankId: effective.sourceBankId,
    effectiveViewAll: effective.viewAll,
    effectiveIncludeChildDepartments: effective.includeChildDepartments,
    effectiveDepartmentIds: effective.departmentIds,
    effectiveUserIds: effective.userIds,
    effectiveEditorIds: effective.editorIds,
  };
}

export async function setAccessConfig(bankId: string, input: {
  permissionMode: 'inherit' | 'override'; viewAll?: boolean; includeChildDepartments?: boolean;
  departmentIds?: string[]; userIds?: string[]; editorIds?: string[];
}): Promise<BankAccessConfig> {
  const repo = await import('./banks.repo.js');
  if (!(await repo.findById(bankId))) throw notFound('科目题库不存在或已被删除');
  const departmentIds = [...new Set(input.departmentIds ?? [])];
  const userIds = [...new Set(input.userIds ?? [])];
  const editorIds = [...new Set(input.editorIds ?? [])];
  if (input.permissionMode === 'override') {
    if (departmentIds.length) {
      const found = await query<RowDataPacket[]>(`SELECT id FROM departments WHERE id IN (${departmentIds.map(() => '?').join(',')})`, departmentIds);
      if (found.length !== departmentIds.length) throw badRequest('浏览部门中包含不存在的部门');
    }
    const targetUserIds = [...new Set([...userIds, ...editorIds])];
    if (targetUserIds.length) {
      const found = await query<Array<RowDataPacket & { id: string; role: Role }>>(`SELECT id, role FROM users WHERE id IN (${targetUserIds.map(() => '?').join(',')}) AND status = 'active'`, targetUserIds);
      if (found.length !== targetUserIds.length) throw badRequest('权限人员中包含不存在或已停用的账号');
      const roleMap = new Map(found.map((row) => [row.id, row.role]));
      if (editorIds.some((id) => roleMap.get(id) !== 'author')) throw badRequest('编辑人员只能选择出题人；管理员默认拥有全部权限');
    }
  }
  await withTransaction(async (conn) => {
    await conn.query(`UPDATE question_banks SET permission_mode = ?, view_all = ?, include_child_departments = ?, updated_at = NOW(3) WHERE id = ?`,
      [input.permissionMode, input.viewAll ? 1 : 0, input.includeChildDepartments !== false ? 1 : 0, bankId]);
    await conn.query(`DELETE FROM bank_view_departments WHERE bank_id = ?`, [bankId]);
    await conn.query(`DELETE FROM bank_view_users WHERE bank_id = ?`, [bankId]);
    await conn.query(`DELETE FROM bank_authors WHERE bank_id = ?`, [bankId]);
    if (input.permissionMode === 'override') {
      for (const id of departmentIds) await conn.query(`INSERT INTO bank_view_departments (bank_id, department_id, created_at) VALUES (?, ?, NOW(3))`, [bankId, id]);
      for (const id of userIds) await conn.query(`INSERT INTO bank_view_users (bank_id, user_id, created_at) VALUES (?, ?, NOW(3))`, [bankId, id]);
      for (const id of editorIds) await conn.query(`INSERT INTO bank_authors (bank_id, user_id, created_at) VALUES (?, ?, NOW(3))`, [bankId, id]);
    }
  });
  return getAccessConfig(bankId);
}
