/**
 * 导入模块 —— 数据访问层（SQL 集中在此，参数化查询防注入）。
 */
import type { RowDataPacket } from 'mysql2/promise';
import { query, runQuery, type SqlExecutor } from '../../db/pool.js';

/** `import_batches` 表原始行。 */
export interface BatchRow extends RowDataPacket {
  id: string;
  bank_id: string;
  file_name: string;
  total_rows: number;
  success_count: number;
  fail_count: number;
  errors_json: unknown;
  operator_id: string;
  created_at: string;
}

/** 新增导入批次。 */
export async function insertBatch(
  row: {
    id: string;
    bankId: string;
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
    `INSERT INTO import_batches
       (id, bank_id, file_name, total_rows, success_count, fail_count, errors_json, operator_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      row.id,
      row.bankId,
      row.fileName,
      row.totalRows,
      row.successCount,
      row.failCount,
      JSON.stringify(row.errors ?? []),
      row.operatorId,
      row.createdAt,
    ],
  );
}

/** 分页查询导入批次（可按 bankId 过滤，按创建时间倒序）。 */
export async function listBatches(
  filter: { bankId?: string },
  paging: { pageSize: number; offset: number },
): Promise<BatchRow[]> {
  const conds: string[] = [];
  const params: string[] = [];
  if (filter.bankId && filter.bankId.trim() !== '') {
    conds.push('bank_id = ?');
    params.push(filter.bankId.trim());
  }
  const where = conds.length > 0 ? `WHERE ${conds.join(' AND ')}` : '';
  return query<BatchRow[]>(
    `SELECT id, bank_id, file_name, total_rows, success_count, fail_count, errors_json, operator_id, created_at
       FROM import_batches ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
    [...params, paging.pageSize, paging.offset],
  );
}

/** 统计导入批次数。 */
export async function countBatches(filter: { bankId?: string }): Promise<number> {
  const conds: string[] = [];
  const params: string[] = [];
  if (filter.bankId && filter.bankId.trim() !== '') {
    conds.push('bank_id = ?');
    params.push(filter.bankId.trim());
  }
  const where = conds.length > 0 ? `WHERE ${conds.join(' AND ')}` : '';
  const rows = await query<RowDataPacket[]>(`SELECT COUNT(*) AS c FROM import_batches ${where}`, params);
  return Number(rows[0]?.c ?? 0);
}
