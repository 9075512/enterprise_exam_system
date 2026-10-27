import type { SqlExecutor } from './pool.js';
import { runQuery } from './pool.js';
import { CAPTURE_DDL } from '../modules/captures/captures.ddl.js';

/** Idempotent and seed-free, also usable against an existing installation. */
export async function migrateCaptures(exec: SqlExecutor): Promise<void> {
  for (const ddl of CAPTURE_DDL) await runQuery(exec, ddl);
  const rows = await runQuery<Array<{ count: number }>>(exec, `SELECT COUNT(*) AS count FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'exams' AND COLUMN_NAME = 'capture_settings'`);
  if (!Number(rows[0].count)) await runQuery(exec, 'ALTER TABLE exams ADD COLUMN capture_settings JSON NULL');
  const columns = await runQuery<Array<{ COLUMN_NAME: string }>>(exec, `SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'exam_captures'`);
  const existing = new Set(columns.map(row => row.COLUMN_NAME));
  for (const [name, definition] of [['removed_at', 'DATETIME(3) NULL'], ['removed_by', 'VARCHAR(64) NULL'], ['removed_by_name', 'VARCHAR(100) NULL']] as const) {
    if (!existing.has(name)) await runQuery(exec, `ALTER TABLE exam_captures ADD COLUMN ${name} ${definition}`);
  }
}
