/**
 * 用户模块 —— 数据访问层（SQL 集中在此，参数化查询防注入）。
 * users 表的全部 SQL 统一收敛于此，auth 模块通过 auth.repo 委托复用，避免重复实现。
 */
import type { RowDataPacket } from 'mysql2/promise';
import { query, type QueryParams } from '../../db/pool.js';
import type { UserRow } from './user.mapper.js';
import type { Role, UserStatus } from '../../types/domain.js';

export type { UserRow } from './user.mapper.js';

/**
 * 登录校验用的最小用户行（仅列级最小集）。
 * 刻意**不包含** `department_id` 等无关列，也不 JOIN departments，
 * 以便公网练题实例以最小权限 DB 账号（`GRANT SELECT (id,username,password_hash,name,role,status)`）也能校验登录。
 */
export interface LoginUserRow extends RowDataPacket {
  id: string;
  username: string;
  password_hash: string;
  name: string;
  role: Role;
  status: UserStatus;
}

/** 列表过滤条件。 */
export interface UserListFilter {
  role?: Role;
  keyword?: string;
}

const USER_COLUMNS =
  'u.id, u.username, u.password_hash, u.name, u.role, u.department_id, d.name AS department_name, u.email, u.status, u.created_at';
const USER_FROM = 'FROM users u LEFT JOIN departments d ON d.id = u.department_id';

/** 按 id 查询。 */
export async function findById(id: string): Promise<UserRow | null> {
  const rows = await query<UserRow[]>(`SELECT ${USER_COLUMNS} ${USER_FROM} WHERE u.id = ? LIMIT 1`, [id]);
  return rows[0] ?? null;
}

/** 按登录账号查询（登录校验与唯一性检查共用）。 */
export async function findByUsername(username: string): Promise<UserRow | null> {
  const rows = await query<UserRow[]>(
    `SELECT ${USER_COLUMNS} ${USER_FROM} WHERE u.username = ? LIMIT 1`,
    [username],
  );
  return rows[0] ?? null;
}

/**
 * 登录校验专用：仅取列级最小集（不含 department_id，不 JOIN departments）。
 * 供 `verifyCredentials` 复用，兼容练题实例的最小权限 DB 账号。
 */
export async function findForLogin(username: string): Promise<LoginUserRow | null> {
  const rows = await query<LoginUserRow[]>(
    `SELECT id, username, password_hash, name, role, status FROM users WHERE username = ? LIMIT 1`,
    [username],
  );
  return rows[0] ?? null;
}

/** 查询用户列表（可按角色 / 关键字过滤），按 created_at 升序。 */
export async function list(filter: UserListFilter = {}): Promise<UserRow[]> {
  const conditions: string[] = [];
  const params: Array<string> = [];
  if (filter.role) {
    conditions.push('u.role = ?');
    params.push(filter.role);
  }
  if (filter.keyword && filter.keyword.trim() !== '') {
    conditions.push('(u.username LIKE ? OR u.name LIKE ?)');
    const like = `%${filter.keyword.trim()}%`;
    params.push(like, like);
  }
  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  return query<UserRow[]>(
    `SELECT ${USER_COLUMNS} ${USER_FROM} ${where} ORDER BY u.created_at ASC`,
    params,
  );
}

/** 插入用户。 */
export async function insert(row: {
  id: string;
  username: string;
  passwordHash: string;
  name: string;
  role: Role;
  departmentId: string | null;
  email: string | null;
  status: UserStatus;
  createdAt: string;
}): Promise<void> {
  await query<RowDataPacket[]>(
    `INSERT INTO users (id, username, password_hash, name, role, department_id, email, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [row.id, row.username, row.passwordHash, row.name, row.role, row.departmentId, row.email, row.status, row.createdAt],
  );
}

/** 更新用户基础信息（不改密码）。 */
export async function update(
  id: string,
  row: { username: string; name: string; role: Role; departmentId: string | null; email: string | null; status: UserStatus },
): Promise<void> {
  await query<RowDataPacket[]>(
    `UPDATE users SET username = ?, name = ?, role = ?, department_id = ?, email = ?, status = ? WHERE id = ?`,
    [row.username, row.name, row.role, row.departmentId, row.email, row.status, id],
  );
}

/** 删除用户。 */
export async function remove(id: string): Promise<void> {
  await query<RowDataPacket[]>(`DELETE FROM users WHERE id = ?`, [id]);
}

/** 更新口令哈希（改密 / 重置密码共用）。 */
export async function updatePasswordHash(id: string, passwordHash: string): Promise<void> {
  await query<RowDataPacket[]>(`UPDATE users SET password_hash = ? WHERE id = ?`, [passwordHash, id]);
}

/** 统计某科室下的用户数（删除科室前校验）。 */
export async function countByDepartment(departmentId: string): Promise<number> {
  const rows = await query<RowDataPacket[]>(
    `SELECT COUNT(*) AS c FROM users WHERE department_id = ?`,
    [departmentId],
  );
  return Number(rows[0]?.c ?? 0);
}

/** 是否存在该用户的考试记录（删除用户前校验）。 */
export async function hasExamRecords(userId: string): Promise<boolean> {
  const rows = await query<RowDataPacket[]>(
    `SELECT COUNT(*) AS c FROM exam_records WHERE user_id = ?`,
    [userId],
  );
  return Number(rows[0]?.c ?? 0) > 0;
}

/** 按 id 列表批量取邮箱（邮件通知用；无邮箱返回 null）。 */
export async function findEmailsByIds(ids: string[]): Promise<Array<{ id: string; email: string | null }>> {
  if (ids.length === 0) return [];
  const placeholders = ids.map(() => '?').join(',');
  const rows = await query<Array<RowDataPacket & { id: string; email: string | null }>>(
    `SELECT id, email FROM users WHERE id IN (${placeholders})`,
    ids,
  );
  return rows.map((r) => ({ id: r.id, email: r.email ?? null }));
}

/** 取属于给定科室集合的用户 id（可按角色过滤；考试发布通知用）。 */
export async function findIdsByDepartments(departmentIds: string[], role?: Role): Promise<string[]> {
  if (departmentIds.length === 0) return [];
  const placeholders = departmentIds.map(() => '?').join(',');
  const roleCond = role ? ' AND role = ?' : '';
  const params: QueryParams = role ? [...departmentIds, role] : [...departmentIds];
  const rows = await query<RowDataPacket[]>(
    `SELECT id FROM users WHERE department_id IN (${placeholders})${roleCond}`,
    params,
  );
  return rows.map((r) => String(r.id));
}
