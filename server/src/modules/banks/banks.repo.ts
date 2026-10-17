/**
 * 题库模块 —— 数据访问层（SQL 集中在此，参数化查询防注入）。
 */
import type { ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { query, runQuery, type SqlExecutor } from '../../db/pool.js';

/** `question_banks` 表原始行。 */
export interface BankRow extends RowDataPacket {
  id: string;
  name: string;
  description: string;
  category: string;
  allow_practice: number | boolean;
  parent_id: string | null;
  sort_order: number | string;
  status: 'active' | 'disabled';
  permission_mode: 'inherit' | 'override';
  view_all: number | boolean;
  include_child_departments: number | boolean;
  created_by: string;
  created_at: string;
  updated_at: string;
}

/** 带派生统计的行（列表/详情用）。 */
export interface BankRowWithCount extends BankRow {
  question_count: number | string;
  child_count: number | string;
}

const COLUMNS = `b.id, b.name, b.description, b.category, b.allow_practice,
  b.parent_id, b.sort_order, b.status, b.permission_mode, b.view_all,
  b.include_child_departments, b.created_by, b.created_at, b.updated_at`;

/** 列表（含派生 questionCount，可按关键字过滤）。 */
export async function list(filter: { keyword?: string } = {}): Promise<BankRowWithCount[]> {
  const conditions: string[] = [];
  const params: string[] = [];
  if (filter.keyword && filter.keyword.trim() !== '') {
    conditions.push('(b.name LIKE ? OR b.description LIKE ?)');
    const like = `%${filter.keyword.trim()}%`;
    params.push(like, like);
  }
  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  return query<BankRowWithCount[]>(
    `SELECT ${COLUMNS}, COUNT(DISTINCT q.id) AS question_count,
            (SELECT COUNT(*) FROM question_banks c WHERE c.parent_id = b.id) AS child_count
       FROM question_banks b
       LEFT JOIN questions q ON q.bank_id = b.id
       ${where}
       GROUP BY b.id
       ORDER BY b.sort_order ASC, b.name ASC, b.created_at ASC`,
    params,
  );
}

/** 按 id 查询（含 questionCount）。 */
export async function findById(id: string): Promise<BankRowWithCount | null> {
  const rows = await query<BankRowWithCount[]>(
    `SELECT ${COLUMNS}, COUNT(DISTINCT q.id) AS question_count,
            (SELECT COUNT(*) FROM question_banks c WHERE c.parent_id = b.id) AS child_count
       FROM question_banks b
       LEFT JOIN questions q ON q.bank_id = b.id
       WHERE b.id = ?
       GROUP BY b.id
       LIMIT 1`,
    [id],
  );
  return rows[0] ?? null;
}

/** 题库内试题数。 */
export async function countQuestions(bankId: string, exec?: SqlExecutor): Promise<number> {
  const rows = await runQuery<RowDataPacket[]>(
    exec,
    `SELECT COUNT(*) AS c FROM questions WHERE bank_id = ?`,
    [bankId],
  );
  return Number(rows[0]?.c ?? 0);
}

/** 被任一试卷引用的「题目数」与「试卷数」（用于删除前的影响面提示）。 */
export async function countReferences(
  bankId: string,
): Promise<{ referencedQuestionCount: number; referencedPaperCount: number }> {
  const rows = await query<RowDataPacket[]>(
    `SELECT COUNT(DISTINCT question_id) AS qc, COUNT(DISTINCT paper_id) AS pc
       FROM paper_questions
       WHERE question_id IN (SELECT id FROM questions WHERE bank_id = ?)`,
    [bankId],
  );
  return {
    referencedQuestionCount: Number(rows[0]?.qc ?? 0),
    referencedPaperCount: Number(rows[0]?.pc ?? 0),
  };
}

/** 新增题库。 */
export async function insert(
  row: {
    id: string;
    name: string;
    description: string;
    category: string;
    allowPractice: boolean;
    parentId?: string | null;
    sortOrder?: number;
    status?: 'active' | 'disabled';
    permissionMode?: 'inherit' | 'override';
    viewAll?: boolean;
    createdBy: string;
    createdAt: string;
  },
  exec?: SqlExecutor,
): Promise<void> {
  await runQuery(
    exec,
    `INSERT INTO question_banks
      (id, name, description, category, allow_practice, parent_id, sort_order, status,
       permission_mode, view_all, include_child_departments, created_by, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)`,
    [row.id, row.name, row.description, row.category, row.allowPractice ? 1 : 0,
      row.parentId ?? null, row.sortOrder ?? 0, row.status ?? 'active', row.permissionMode ?? 'inherit',
      row.viewAll ? 1 : 0,
      row.createdBy, row.createdAt, row.createdAt],
  );
}

/** 更新题库。 */
export async function update(
  id: string,
  row: { name: string; description: string; allowPractice: boolean; parentId: string | null; sortOrder: number; status: 'active' | 'disabled' },
  exec?: SqlExecutor,
): Promise<void> {
  await runQuery(
    exec,
    `UPDATE question_banks SET name = ?, description = ?, allow_practice = ?, parent_id = ?,
      sort_order = ?, status = ?, updated_at = NOW(3) WHERE id = ?`,
    [row.name, row.description, row.allowPractice ? 1 : 0, row.parentId, row.sortOrder, row.status, id],
  );
}

/** 同一父级下名称查重（parentId=null 时显式 IS NULL）。 */
export async function findSiblingByName(name: string, parentId: string | null): Promise<BankRow | null> {
  const rows = await query<BankRow[]>(
    `SELECT ${COLUMNS} FROM question_banks b WHERE b.name = ? AND ${parentId ? 'b.parent_id = ?' : 'b.parent_id IS NULL'} LIMIT 1`,
    parentId ? [name, parentId] : [name],
  );
  return rows[0] ?? null;
}

/** 批量设置「对外开放练题」开关（仅改 allow_practice 一列）。 */
export async function updatePracticeFlag(
  ids: string[],
  allowPractice: boolean,
  exec?: SqlExecutor,
): Promise<number> {
  if (ids.length === 0) return 0;
  const placeholders = ids.map(() => '?').join(',');
  const result = await runQuery<ResultSetHeader>(
    exec,
    `UPDATE question_banks SET allow_practice = ? WHERE id IN (${placeholders})`,
    [allowPractice ? 1 : 0, ...ids],
  );
  return result.affectedRows;
}

/** 删除题库。 */
export async function remove(id: string, exec?: SqlExecutor): Promise<void> {
  await runQuery(exec, `DELETE FROM question_banks WHERE id = ?`, [id]);
}

/** 级联删除题库下全部试题（事务内使用）。 */
export async function deleteQuestionsByBank(bankId: string, exec?: SqlExecutor): Promise<void> {
  await runQuery(exec, `DELETE FROM questions WHERE bank_id = ?`, [bankId]);
}

/** 迁移试题到目标题库（仅限属于源题库的题目，返回实际迁移条数）。 */
export async function migrateQuestions(
  sourceBankId: string,
  targetBankId: string,
  questionIds: string[],
  exec?: SqlExecutor,
): Promise<number> {
  const placeholders = questionIds.map(() => '?').join(',');
  const result = await runQuery(
    exec,
    `UPDATE questions
        SET bank_id = ?, subject_id = ?, subject = (SELECT name FROM question_banks WHERE id = ?)
      WHERE id IN (${placeholders}) AND bank_id = ?`,
    [targetBankId, targetBankId, targetBankId, ...questionIds, sourceBankId],
  );
  return Number((result as { affectedRows?: number }).affectedRows ?? 0);
}
