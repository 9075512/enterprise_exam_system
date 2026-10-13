/**
 * 用户导入批次 —— 数据访问层。
 */
import type { RowDataPacket } from 'mysql2/promise';
import { query, runQuery, type SqlExecutor } from '../../db/pool.js';

/** `user_import_batches` 表原始行。 */
export interface UserBatchRow extends RowDataPacket {
  id: string;
  file_name: string;
  total_rows: number;
  success_count: number;
  fail_count: number;
  errors_json: unknown;
  operator_id: string;
  created_at: string;
}

/** 新增用户导入批次。 */
export async function insertBatch(
  row: {
    id: string;
    fileName: string;
    totalRows: number;
    successCount: number;
    failCount: number;
    errors: unknown;
    operatorId: string;
    createdAt: string;
  },
  exec?: SqlExecutor,
): Promise<void> {
  await runQuery(
    exec,
    `INSERT INTO user_import_batches
       (id, file_name, total_rows, success_count, fail_count, errors_json, operator_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [row.id, row.fileName, row.totalRows, row.successCount, row.failCount, JSON.stringify(row.errors ?? []), row.operatorId, row.createdAt],
  );
}

/** 分页查询用户导入批次。 */
export async function listBatches(paging: { pageSize: number; offset: number }): Promise<UserBatchRow[]> {
  return query<UserBatchRow[]>(
    `SELECT id, file_name, total_rows, success_count, fail_count, errors_json, operator_id, created_at
       FROM user_import_batches ORDER BY created_at DESC LIMIT ? OFFSET ?`,
    [paging.pageSize, paging.offset],
  );
}

/** 统计用户导入批次数。 */
export async function countBatches(): Promise<number> {
  const rows = await query<RowDataPacket[]>(`SELECT COUNT(*) AS c FROM user_import_batches`);
  return Number(rows[0]?.c ?? 0);
}
