/**
 * 登录日志 —— 数据访问层（v1.7③ T2）。
 * 自包含无外键：账号删除后日志仍可追溯。
 */
import type { RowDataPacket } from 'mysql2/promise';
import { query } from '../../db/pool.js';

/** `login_logs` 表原始行。 */
export interface LoginLogRow extends RowDataPacket {
  id: string;
  username: string;
  user_id: string | null;
  role: string;
  ip: string;
  user_agent: string;
  success: number;
  reason: string;
  source: string;
  created_at: string;
}

/** 列表过滤条件（时间已归一为 DB 字符串）。 */
export interface LoginLogFilter {
  username?: string;
  success?: boolean;
  source?: string;
  from?: string;
  to?: string;
}

/** 组装 WHERE 子句。 */
function buildWhere(filter: LoginLogFilter): { where: string; params: string[] } {
  const conditions: string[] = [];
  const params: string[] = [];
  if (filter.username && filter.username.trim() !== '') {
    conditions.push('username LIKE ?');
    params.push(`%${filter.username.trim()}%`);
  }
  if (filter.success !== undefined) {
    conditions.push('success = ?');
    params.push(filter.success ? '1' : '0');
  }
  if (filter.source && filter.source.trim() !== '') {
    conditions.push('source = ?');
    params.push(filter.source.trim());
  }
  if (filter.from) {
    conditions.push('created_at >= ?');
    params.push(filter.from);
  }
  if (filter.to) {
    conditions.push('created_at <= ?');
    params.push(filter.to);
  }
  return { where: conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '', params };
}

/** 插入一条登录日志。 */
export async function insert(row: {
  id: string;
  username: string;
  userId: string | null;
  role: string;
  ip: string;
  userAgent: string;
  success: boolean;
  reason: string;
  source: string;
  createdAt: string;
}): Promise<void> {
  await query<RowDataPacket[]>(
    `INSERT INTO login_logs (id, username, user_id, role, ip, user_agent, success, reason, source, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      row.id,
      row.username,
      row.userId,
      row.role,
      row.ip.slice(0, 64),
      row.userAgent.slice(0, 255),
      row.success ? 1 : 0,
      row.reason.slice(0, 64),
      row.source,
      row.createdAt,
    ],
  );
}

/** 分页列表。 */
export async function list(
  filter: LoginLogFilter,
  paging: { limit: number; offset: number },
): Promise<LoginLogRow[]> {
  const { where, params } = buildWhere(filter);
  return query<LoginLogRow[]>(
    `SELECT * FROM login_logs ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
    [...params, paging.limit, paging.offset] as unknown as string[],
  );
}

/** 总数。 */
export async function count(filter: LoginLogFilter): Promise<number> {
  const { where, params } = buildWhere(filter);
  const rows = await query<RowDataPacket[]>(`SELECT COUNT(*) AS c FROM login_logs ${where}`, params);
  return Number(rows[0]?.c ?? 0);
}
