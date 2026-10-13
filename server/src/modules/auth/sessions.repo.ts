/**
 * 登录会话 / 设备 —— 数据访问层（v1.7③ T2）。
 * `user_sessions.id` = JWT 的 `jti`；支持查看我的登录设备、单点下线、全部下线。
 */
import type { RowDataPacket } from 'mysql2/promise';
import { query } from '../../db/pool.js';

/** `user_sessions` 表原始行。 */
export interface SessionRow extends RowDataPacket {
  id: string;
  user_id: string;
  ip: string;
  user_agent: string;
  created_at: string;
  last_seen_at: string;
  revoked_at: string | null;
  expires_at: string;
}

/** 新建会话。 */
export async function insert(row: {
  id: string;
  userId: string;
  ip: string;
  userAgent: string;
  createdAt: string;
  expiresAt: string;
}): Promise<void> {
  await query<RowDataPacket[]>(
    `INSERT INTO user_sessions (id, user_id, ip, user_agent, created_at, last_seen_at, revoked_at, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, NULL, ?)`,
    [row.id, row.userId, row.ip, row.userAgent.slice(0, 255), row.createdAt, row.createdAt, row.expiresAt],
  );
}

/** 按 jti 查询会话（未撤销）。 */
export async function findActive(id: string): Promise<SessionRow | null> {
  const rows = await query<SessionRow[]>(
    `SELECT * FROM user_sessions WHERE id = ? AND revoked_at IS NULL LIMIT 1`,
    [id],
  );
  return rows[0] ?? null;
}

/** 刷新最后活跃时间。 */
export async function touch(id: string, now: string): Promise<void> {
  await query<RowDataPacket[]>(`UPDATE user_sessions SET last_seen_at = ? WHERE id = ?`, [now, id]);
}

/** 某用户的全部有效会话（未撤销且未过期），按最后活跃倒序。 */
export async function listActiveByUser(userId: string, now: string): Promise<SessionRow[]> {
  return query<SessionRow[]>(
    `SELECT * FROM user_sessions
      WHERE user_id = ? AND revoked_at IS NULL AND expires_at > ?
      ORDER BY last_seen_at DESC`,
    [userId, now],
  );
}

/** 撤销单个会话（本人 / 管理员）。 */
export async function revoke(id: string, now: string): Promise<number> {
  const rows = await query<RowDataPacket[]>(
    `UPDATE user_sessions SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL`,
    [now, id],
  );
  return Number((rows as unknown as { affectedRows?: number }).affectedRows ?? 0);
}

/** 撤销某用户的全部会话（可排除当前会话）。 */
export async function revokeAllByUser(userId: string, now: string, exceptId?: string): Promise<number> {
  const sql = exceptId
    ? `UPDATE user_sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL AND id <> ?`
    : `UPDATE user_sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL`;
  const params = exceptId ? [now, userId, exceptId] : [now, userId];
  const rows = await query<RowDataPacket[]>(sql, params);
  return Number((rows as unknown as { affectedRows?: number }).affectedRows ?? 0);
}

/** 清理过期会话（可选维护动作）。 */
export async function deleteExpired(now: string): Promise<number> {
  const rows = await query<RowDataPacket[]>(`DELETE FROM user_sessions WHERE expires_at < ?`, [now]);
  return Number((rows as unknown as { affectedRows?: number }).affectedRows ?? 0);
}
