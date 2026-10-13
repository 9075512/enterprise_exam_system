/**
 * 限流计数存储（v1.4）：固定窗口 + DB 原子 UPSERT，替代进程内存 Map。
 *
 * 多实例共享同一张 `rate_limit_buckets` 表；窗口过期自动重置计数。
 * 时间比较基于 `DATETIME(3)` 字符串（格式统一 YYYY-MM-DD HH:mm:ss.SSS），字典序即时间序。
 */
import type { RowDataPacket } from 'mysql2/promise';
import { query, runQuery } from '../db/pool.js';
import { toDbDate } from './datetime.js';

/**
 * 消费一次配额，返回是否放行。
 * @param bucketKey 限流键（sha1 摘要）
 * @param limit     窗口内上限
 * @param windowMs  窗口长度（毫秒）
 */
export async function consume(bucketKey: string, limit: number, windowMs: number): Promise<boolean> {
  const now = new Date();
  const nowStr = toDbDate(now);
  const expiredBefore = toDbDate(new Date(now.getTime() - windowMs));

  // 原子 UPSERT：窗口未过期 → count+1；已过期 → 重置为 1 并刷新窗口起点。
  await runQuery(
    undefined,
    `INSERT INTO rate_limit_buckets (bucket_key, count, window_start, updated_at)
     VALUES (?, 1, ?, ?)
     ON DUPLICATE KEY UPDATE
       count = IF(window_start <= ?, 1, count + 1),
       window_start = IF(window_start <= ?, ?, window_start),
       updated_at = ?`,
    [bucketKey, nowStr, nowStr, expiredBefore, expiredBefore, nowStr, nowStr],
  );

  const rows = await query<RowDataPacket[]>(
    `SELECT count FROM rate_limit_buckets WHERE bucket_key = ?`,
    [bucketKey],
  );
  const count = Number(rows[0]?.count ?? 0);
  return count <= limit;
}
