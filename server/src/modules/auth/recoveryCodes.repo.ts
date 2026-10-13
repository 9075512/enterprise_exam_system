/**
 * 两步验证恢复码 —— 数据访问层（v1.8② U2）。
 * 仅保存 bcrypt 哈希；明文在启用 / 重新生成时一次性下发。
 * 无外键（自包含），账号删除后残留行不影响业务，可由维护任务清理。
 */
import type { RowDataPacket } from 'mysql2/promise';
import { query, runQuery, type SqlExecutor } from '../../db/pool.js';

/** `user_recovery_codes` 表原始行。 */
export interface RecoveryCodeRow extends RowDataPacket {
  id: string;
  user_id: string;
  code_hash: string;
  used_at: string | null;
  created_at: string;
}

/** 清空某用户的全部恢复码（启用 / 重新生成 / 管理员重置前调用）。 */
export async function deleteByUser(userId: string, exec?: SqlExecutor): Promise<void> {
  await runQuery(exec, `DELETE FROM user_recovery_codes WHERE user_id = ?`, [userId]);
}

/** 批量写入恢复码哈希。 */
export async function insertMany(
  userId: string,
  items: Array<{ id: string; codeHash: string }>,
  createdAt: string,
  exec?: SqlExecutor,
): Promise<void> {
  for (const it of items) {
    // eslint-disable-next-line no-await-in-loop -- 逐条写入，保证与 exec 事务语义一致
    await runQuery(
      exec,
      `INSERT INTO user_recovery_codes (id, user_id, code_hash, used_at, created_at) VALUES (?, ?, ?, NULL, ?)`,
      [it.id, userId, it.codeHash, createdAt],
    );
  }
}

/** 某用户未使用的恢复码（用于匹配登录输入的恢复码）。 */
export async function listUnused(userId: string): Promise<Array<{ id: string; codeHash: string }>> {
  const rows = await query<RecoveryCodeRow[]>(
    `SELECT id, code_hash FROM user_recovery_codes WHERE user_id = ? AND used_at IS NULL`,
    [userId],
  );
  return rows.map((r) => ({ id: r.id, codeHash: r.code_hash }));
}

/** 剩余可用的恢复码数量。 */
export async function countUnused(userId: string): Promise<number> {
  const rows = await query<RowDataPacket[]>(
    `SELECT COUNT(*) AS c FROM user_recovery_codes WHERE user_id = ? AND used_at IS NULL`,
    [userId],
  );
  return Number(rows[0]?.c ?? 0);
}

/** 标记恢复码已用（一次性）。仅当尚未使用时才更新，返回是否命中。 */
export async function markUsed(id: string, usedAt: string): Promise<boolean> {
  const rows = await query<RowDataPacket[]>(
    `UPDATE user_recovery_codes SET used_at = ? WHERE id = ? AND used_at IS NULL`,
    [usedAt, id],
  );
  return Number((rows as unknown as { affectedRows?: number }).affectedRows ?? 0) > 0;
}
