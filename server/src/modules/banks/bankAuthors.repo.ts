/**
 * 题库-出题人授权 —— 数据访问层（v1.6③）。
 * `bank_authors` 表：bank_id ↔ user_id 多对多；author 仅能管理被授权题库。
 */
import type { RowDataPacket } from 'mysql2/promise';
import { query, runQuery, type SqlExecutor } from '../../db/pool.js';

/** 某题库授权出题人（含姓名，供展示）。 */
export interface BankAuthorRow extends RowDataPacket {
  bank_id: string;
  user_id: string;
  name: string;
}

/** 查询某个出题人被授权的题库 id 列表。 */
export async function listBankIdsByAuthor(userId: string): Promise<string[]> {
  const rows = await query<RowDataPacket[]>(`SELECT bank_id FROM bank_authors WHERE user_id = ?`, [userId]);
  return rows.map((r) => String(r.bank_id));
}

/** 判断某出题人是否被授权访问某题库。 */
export async function isAuthorized(bankId: string, userId: string): Promise<boolean> {
  const rows = await query<RowDataPacket[]>(
    `SELECT 1 AS x FROM bank_authors WHERE bank_id = ? AND user_id = ? LIMIT 1`,
    [bankId, userId],
  );
  return rows.length > 0;
}

/** 查询某题库的授权出题人 id 列表。 */
export async function listAuthorIdsByBank(bankId: string): Promise<string[]> {
  const rows = await query<RowDataPacket[]>(`SELECT user_id FROM bank_authors WHERE bank_id = ?`, [bankId]);
  return rows.map((r) => String(r.user_id));
}

/** 批量查询题库集合的授权出题人（返回 bank_id → [{user_id, name}]）。 */
export async function listAuthorsByBanks(bankIds: string[]): Promise<Map<string, BankAuthorRow[]>> {
  const result = new Map<string, BankAuthorRow[]>();
  if (bankIds.length === 0) return result;
  const placeholders = bankIds.map(() => '?').join(',');
  const rows = await query<BankAuthorRow[]>(
    `SELECT ba.bank_id, ba.user_id, u.name
       FROM bank_authors ba
       JOIN users u ON u.id = ba.user_id
       WHERE ba.bank_id IN (${placeholders})
       ORDER BY ba.created_at ASC`,
    bankIds,
  );
  for (const r of rows) {
    const arr = result.get(r.bank_id) ?? [];
    arr.push(r);
    result.set(r.bank_id, arr);
  }
  return result;
}

/** 覆盖设置某题库的授权出题人（先删后插）。 */
export async function setAuthors(bankId: string, userIds: string[], exec?: SqlExecutor): Promise<void> {
  await runQuery(exec, `DELETE FROM bank_authors WHERE bank_id = ?`, [bankId]);
  for (const userId of userIds) {
    await runQuery(exec, `INSERT INTO bank_authors (bank_id, user_id, created_at) VALUES (?, ?, NOW(3))`, [
      bankId,
      userId,
    ]);
  }
}

/** 追加一名授权出题人（幂等）。 */
export async function addAuthor(bankId: string, userId: string, exec?: SqlExecutor): Promise<void> {
  await runQuery(
    exec,
    `INSERT IGNORE INTO bank_authors (bank_id, user_id, created_at) VALUES (?, ?, NOW(3))`,
    [bankId, userId],
  );
}

/** 批量追加授权出题人（幂等；逐条 INSERT IGNORE，调用方已做去重）。 */
export async function addAuthors(bankId: string, userIds: string[], exec?: SqlExecutor): Promise<void> {
  for (const userId of userIds) {
    await addAuthor(bankId, userId, exec);
  }
}

/** 批量移除授权出题人（v1.7③ S2）。 */
export async function removeAuthors(
  bankId: string,
  userIds: string[],
  exec?: SqlExecutor,
): Promise<void> {
  if (userIds.length === 0) return;
  const placeholders = userIds.map(() => '?').join(',');
  await runQuery(exec, `DELETE FROM bank_authors WHERE bank_id = ? AND user_id IN (${placeholders})`, [
    bankId,
    ...userIds,
  ]);
}

/** 删除某题库的全部授权记录（删除题库时级联清理）。 */
export async function removeByBank(bankId: string, exec?: SqlExecutor): Promise<void> {
  await runQuery(exec, `DELETE FROM bank_authors WHERE bank_id = ?`, [bankId]);
}
