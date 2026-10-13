/**
 * 登录失败锁定 —— 数据访问层（v1.4）。
 * 按 username 唯一记录连续失败次数与锁定期限；成功登录后清零。
 */
import type { RowDataPacket } from 'mysql2/promise';
import { query, runQuery } from '../../db/pool.js';

/** `login_attempts` 表原始行。 */
export interface LoginAttemptRow extends RowDataPacket {
  username: string;
  fail_count: number;
  locked_until: string | null;
  updated_at: string;
}

/** 查询某账号的失败锁定记录。 */
export async function findByUsername(username: string): Promise<LoginAttemptRow | null> {
  const rows = await query<LoginAttemptRow[]>(
    `SELECT username, fail_count, locked_until, updated_at FROM login_attempts WHERE username = ?`,
    [username],
  );
  return rows[0] ?? null;
}

/** 失败 +1（UPSERT 原子递增，同时清除旧锁定期限，由调用方决定是否重新上锁）。 */
export async function recordFailure(username: string, now: string): Promise<void> {
  await runQuery(
    undefined,
    `INSERT INTO login_attempts (username, fail_count, locked_until, updated_at)
     VALUES (?, 1, NULL, ?)
     ON DUPLICATE KEY UPDATE fail_count = fail_count + 1, locked_until = NULL, updated_at = ?`,
    [username, now, now],
  );
}

/** 上锁：写入锁定期限。 */
export async function lock(username: string, until: string, now: string): Promise<void> {
  await runQuery(
    undefined,
    `INSERT INTO login_attempts (username, fail_count, locked_until, updated_at)
     VALUES (?, 1, ?, ?)
     ON DUPLICATE KEY UPDATE locked_until = ?, updated_at = ?`,
    [username, until, now, until, now],
  );
}

/** 成功登录后清零（删除记录，等效重置）。 */
export async function clear(username: string): Promise<void> {
  await runQuery(undefined, `DELETE FROM login_attempts WHERE username = ?`, [username]);
}
