/**
 * 试卷模块 —— 数据访问层（SQL 集中在此，参数化查询防注入）。
 * 所有写操作支持传入事务连接（exec），供 service 在单事务内完成试卷落库。
 */
import type { RowDataPacket } from 'mysql2/promise';
import { query, runQuery, type SqlExecutor } from '../../db/pool.js';

/** `papers` 表原始行。 */
export interface PaperRow extends RowDataPacket {
  id: string;
  name: string;
  description: string;
  total_score: number | string;
  created_by: string;
  created_at: string;
}

/** `paper_questions` 原始行。 */
export interface PaperQuestionRow extends RowDataPacket {
  question_id: string;
  score: number | string;
  sort_order: number;
}

/** 试卷列表（按创建时间倒序）。 */
export async function list(): Promise<PaperRow[]> {
  return query<PaperRow[]>(
    `SELECT id, name, description, total_score, created_by, created_at
       FROM papers ORDER BY created_at DESC`,
  );
}

/** 按 id 查询试卷。 */
export async function findById(id: string, exec?: SqlExecutor): Promise<PaperRow | null> {
  const rows = await runQuery<PaperRow[]>(
    exec,
    `SELECT id, name, description, total_score, created_by, created_at FROM papers WHERE id = ? LIMIT 1`,
    [id],
  );
  return rows[0] ?? null;
}

/** 试卷题目列表（按 sort_order 升序）。 */
export async function listPaperQuestions(paperId: string, exec?: SqlExecutor): Promise<PaperQuestionRow[]> {
  return runQuery<PaperQuestionRow[]>(
    exec,
    `SELECT question_id, score, sort_order FROM paper_questions WHERE paper_id = ? ORDER BY sort_order ASC`,
    [paperId],
  );
}

/** 试卷来源题库 id 列表。 */
export async function listBankRefs(paperId: string, exec?: SqlExecutor): Promise<string[]> {
  const rows = await runQuery<RowDataPacket[]>(
    exec,
    `SELECT bank_id FROM paper_bank_refs WHERE paper_id = ? ORDER BY bank_id ASC`,
    [paperId],
  );
  return rows.map((r) => String(r.bank_id));
}

/** 批量查询题库 id → 名称。 */
export async function bankNamesByIds(bankIds: string[]): Promise<Array<{ id: string; name: string }>> {
  if (bankIds.length === 0) return [];
  const rows = await query<RowDataPacket[]>(
    `SELECT id, name FROM question_banks WHERE id IN (${bankIds.map(() => '?').join(', ')})`,
    bankIds,
  );
  return rows.map((r) => ({ id: String(r.id), name: String(r.name) }));
}

/** 统计引用该试卷的考试数（删除前校验）。 */
export async function countExamRefs(paperId: string): Promise<number> {
  const rows = await query<RowDataPacket[]>(
    `SELECT COUNT(*) AS c FROM exams WHERE paper_id = ?`,
    [paperId],
  );
  return Number(rows[0]?.c ?? 0);
}

/** 新增试卷。 */
export async function insert(
  row: { id: string; name: string; description: string; totalScore: number; createdBy: string; createdAt: string },
  exec?: SqlExecutor,
): Promise<void> {
  await runQuery(
    exec,
    `INSERT INTO papers (id, name, description, total_score, created_by, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [row.id, row.name, row.description, row.totalScore, row.createdBy, row.createdAt],
  );
}

/** 更新试卷基本信息。 */
export async function update(
  id: string,
  row: { name: string; description: string; totalScore: number },
  exec?: SqlExecutor,
): Promise<void> {
  await runQuery(
    exec,
    `UPDATE papers SET name = ?, description = ?, total_score = ? WHERE id = ?`,
    [row.name, row.description, row.totalScore, id],
  );
}

/** 删除试卷（paper_questions / paper_bank_refs 由外键 CASCADE 连带删除）。 */
export async function remove(id: string, exec?: SqlExecutor): Promise<void> {
  await runQuery(exec, `DELETE FROM papers WHERE id = ?`, [id]);
}

/** 清空试卷题目（保存时整体重写）。 */
export async function deletePaperQuestions(paperId: string, exec?: SqlExecutor): Promise<void> {
  await runQuery(exec, `DELETE FROM paper_questions WHERE paper_id = ?`, [paperId]);
}

/** 批量写入试卷题目（sort_order 按入参顺序 0..n-1）。 */
export async function insertPaperQuestions(
  paperId: string,
  items: Array<{ questionId: string; score: number }>,
  exec?: SqlExecutor,
): Promise<void> {
  for (let i = 0; i < items.length; i += 1) {
    await runQuery(
      exec,
      `INSERT INTO paper_questions (paper_id, question_id, score, sort_order) VALUES (?, ?, ?, ?)`,
      [paperId, items[i].questionId, items[i].score, i],
    );
  }
}

/** 清空试卷来源题库关联（保存时按当前 bankIds 整体重写）。 */
export async function deleteBankRefs(paperId: string, exec?: SqlExecutor): Promise<void> {
  await runQuery(exec, `DELETE FROM paper_bank_refs WHERE paper_id = ?`, [paperId]);
}

/** 批量写入试卷来源题库关联。 */
export async function insertBankRefs(paperId: string, bankIds: string[], exec?: SqlExecutor): Promise<void> {
  for (const bankId of bankIds) {
    await runQuery(exec, `INSERT INTO paper_bank_refs (paper_id, bank_id) VALUES (?, ?)`, [paperId, bankId]);
  }
}
