import type { RowDataPacket } from 'mysql2/promise';
import { runQuery, type SqlExecutor } from './pool.js';

/** NULL preserves the audience of pre-upgrade courses. Never backfill binding rules. */
export async function migrateCourseAudience(conn: SqlExecutor): Promise<void> {
  const rows = await runQuery<RowDataPacket[]>(conn, `SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'courses' AND COLUMN_NAME = 'audience_json'`);
  if (!rows.length) await conn.query('ALTER TABLE courses ADD COLUMN audience_json JSON NULL AFTER content_json');
}
