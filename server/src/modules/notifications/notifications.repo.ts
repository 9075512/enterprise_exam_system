/**
 * 站内信 —— 数据访问层。
 */
import type { RowDataPacket } from 'mysql2/promise';
import { query, runQuery, type SqlExecutor } from '../../db/pool.js';

/** `notifications` 表原始行。 */
export interface NotificationRow extends RowDataPacket {
  id: string;
  user_id: string;
  type: string;
  title: string;
  content: string;
  is_read: number | boolean;
  created_at: string;
}

/** 批量插入站内信。 */
export async function insertMany(
  rows: Array<{ id: string; userId: string; type: string; title: string; content: string; createdAt: string }>,
  exec?: SqlExecutor,
): Promise<void> {
  if (rows.length === 0) return;
  const placeholders = rows.map(() => '(?, ?, ?, ?, ?, ?, ?)').join(', ');
  const params: Array<string | number | boolean | Date | null> = [];
  for (const r of rows) {
    params.push(r.id, r.userId, r.type, r.title, r.content, 0, r.createdAt);
  }
  await runQuery(
    exec,
    `INSERT INTO notifications (id, user_id, type, title, content, is_read, created_at) VALUES ${placeholders}`,
    params,
  );
}

/** 分页查询某用户站内信（按创建时间倒序）。 */
export async function listByUser(
  userId: string,
  paging: { pageSize: number; offset: number },
): Promise<NotificationRow[]> {
  return query<NotificationRow[]>(
    `SELECT id, user_id, type, title, content, is_read, created_at
       FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?`,
    [userId, paging.pageSize, paging.offset],
  );
}

/** 统计某用户站内信总数。 */
export async function countByUser(userId: string): Promise<number> {
  const rows = await query<RowDataPacket[]>(
    `SELECT COUNT(*) AS c FROM notifications WHERE user_id = ?`,
    [userId],
  );
  return Number(rows[0]?.c ?? 0);
}

/** 统计某用户未读数。 */
export async function countUnread(userId: string): Promise<number> {
  const rows = await query<RowDataPacket[]>(
    `SELECT COUNT(*) AS c FROM notifications WHERE user_id = ? AND is_read = 0`,
    [userId],
  );
  return Number(rows[0]?.c ?? 0);
}

/** 标记单条已读（仅本人）。 */
export async function markRead(id: string, userId: string): Promise<void> {
  await runQuery(undefined, `UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?`, [id, userId]);
}

/** 全部标记已读（仅本人）。 */
export async function markAllRead(userId: string): Promise<void> {
  await runQuery(undefined, `UPDATE notifications SET is_read = 1 WHERE user_id = ? AND is_read = 0`, [userId]);
}
