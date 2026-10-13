/**
 * 试题模块 —— 数据访问层（SQL 集中在此，参数化查询防注入）。
 */
import type { RowDataPacket } from 'mysql2/promise';
import { query, runQuery, type SqlExecutor } from '../../db/pool.js';
import type { QuestionRow } from './question.mapper.js';
import type { QuestionType, RubricBand } from '../../types/domain.js';

export type { QuestionRow } from './question.mapper.js';

const COLUMNS =
  'id, bank_id, type, stem, options, answer, default_score, analysis, subject, tags, rubric, created_by, created_at';

/** 试题筛选条件。 */
export interface QuestionFilter {
  /** 单题库（题库内列表） */
  bankId?: string;
  /** 多题库（组卷全局池 / 全局列表） */
  bankIds?: string[];
  type?: QuestionType;
  subject?: string;
  /** 按知识点标签过滤（v1.7②） */
  tag?: string;
  keyword?: string;
}

/** 构建 WHERE 子句与参数（值全部参数化）。 */
function buildWhere(f: QuestionFilter): { where: string; params: string[] } {
  const conds: string[] = [];
  const params: string[] = [];
  if (f.bankId) {
    conds.push('bank_id = ?');
    params.push(f.bankId);
  } else if (f.bankIds && f.bankIds.length > 0) {
    conds.push(`bank_id IN (${f.bankIds.map(() => '?').join(', ')})`);
    params.push(...f.bankIds);
  }
  if (f.type) {
    conds.push('type = ?');
    params.push(f.type);
  }
  if (f.subject && f.subject.trim() !== '') {
    conds.push('subject = ?');
    params.push(f.subject.trim());
  }
  if (f.tag && f.tag.trim() !== '') {
    conds.push('JSON_CONTAINS(tags, JSON_QUOTE(?))');
    params.push(f.tag.trim());
  }
  if (f.keyword && f.keyword.trim() !== '') {
    conds.push('stem LIKE ?');
    params.push(`%${f.keyword.trim()}%`);
  }
  return { where: conds.length > 0 ? `WHERE ${conds.join(' AND ')}` : '', params };
}

/** 分页查询试题（按创建时间倒序）。 */
export async function listFiltered(
  f: QuestionFilter,
  paging: { pageSize: number; offset: number },
): Promise<QuestionRow[]> {
  const { where, params } = buildWhere(f);
  return query<QuestionRow[]>(
    `SELECT ${COLUMNS} FROM questions ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
    [...params, paging.pageSize, paging.offset],
  );
}

/** 统计符合条件的试题数。 */
export async function countFiltered(f: QuestionFilter): Promise<number> {
  const { where, params } = buildWhere(f);
  const rows = await query<RowDataPacket[]>(`SELECT COUNT(*) AS c FROM questions ${where}`, params);
  return Number(rows[0]?.c ?? 0);
}

/** 去重排序的科目列表。 */
export async function listSubjects(bankIds?: string[]): Promise<string[]> {
  const { where, params } = buildWhere({ bankIds });
  const rows = await query<RowDataPacket[]>(
    `SELECT DISTINCT subject FROM questions ${where} ORDER BY subject ASC`,
    params,
  );
  return rows.map((r) => String(r.subject));
}

/** 按 id 查询。 */
export async function findById(id: string, exec?: SqlExecutor): Promise<QuestionRow | null> {
  const rows = await runQuery<QuestionRow[]>(exec, `SELECT ${COLUMNS} FROM questions WHERE id = ? LIMIT 1`, [id]);
  return rows[0] ?? null;
}

/** 按 id 集合批量查询。 */
export async function findByIds(ids: string[]): Promise<QuestionRow[]> {
  if (ids.length === 0) return [];
  return query<QuestionRow[]>(
    `SELECT ${COLUMNS} FROM questions WHERE id IN (${ids.map(() => '?').join(', ')})`,
    ids,
  );
}

/** 统计指定题库集合内某题型的题数（抽题充足性判断）。 */
export async function countByType(bankIds: string[], type: QuestionType): Promise<number> {
  const { where, params } = buildWhere({ bankIds, type });
  const rows = await query<RowDataPacket[]>(`SELECT COUNT(*) AS c FROM questions ${where}`, params);
  return Number(rows[0]?.c ?? 0);
}

/** 追加「排除已抽中题目」条件（组卷多规则混抽时防重复，v1.7②）。 */
function withExcludes(
  where: string,
  params: string[],
  excludeIds?: string[],
): { where: string; params: string[] } {
  if (!excludeIds || excludeIds.length === 0) return { where, params };
  const clause = `id NOT IN (${excludeIds.map(() => '?').join(', ')})`;
  const nextWhere = where ? `${where} AND ${clause}` : `WHERE ${clause}`;
  return { where: nextWhere, params: [...params, ...excludeIds] };
}

/** 从题库集合内随机抽取指定题型的 count 条（ORDER BY RAND()）。 */
export async function drawByType(
  bankIds: string[],
  type: QuestionType,
  count: number,
  excludeIds?: string[],
): Promise<QuestionRow[]> {
  const base = buildWhere({ bankIds, type });
  const { where, params } = withExcludes(base.where, base.params, excludeIds);
  return query<QuestionRow[]>(
    `SELECT ${COLUMNS} FROM questions ${where} ORDER BY RAND() LIMIT ?`,
    [...params, count],
  );
}

/** 统计指定题库集合内某知识点标签的题数（v1.7②）。 */
export async function countByTag(bankIds: string[], tag: string): Promise<number> {
  const { where, params } = buildWhere({ bankIds, tag });
  const rows = await query<RowDataPacket[]>(`SELECT COUNT(*) AS c FROM questions ${where}`, params);
  return Number(rows[0]?.c ?? 0);
}

/** 从题库集合内按知识点标签随机抽题（v1.7②）。 */
export async function drawByTag(
  bankIds: string[],
  tag: string,
  count: number,
  excludeIds?: string[],
): Promise<QuestionRow[]> {
  const base = buildWhere({ bankIds, tag });
  const { where, params } = withExcludes(base.where, base.params, excludeIds);
  return query<QuestionRow[]>(
    `SELECT ${COLUMNS} FROM questions ${where} ORDER BY RAND() LIMIT ?`,
    [...params, count],
  );
}

/** 全部知识点标签（跨题库去重；应用层展开 JSON 数组并排序）。 */
export async function listTags(bankIds?: string[]): Promise<string[]> {
  const { where, params } = buildWhere({ bankIds });
  const rows = await query<RowDataPacket[]>(`SELECT tags FROM questions ${where}`, params);
  const set = new Set<string>();
  for (const row of rows) {
    const tags = Array.isArray(row.tags) ? row.tags : [];
    for (const t of tags) {
      const s = String(t).trim();
      if (s) set.add(s);
    }
  }
  return [...set].sort((a, b) => a.localeCompare(b, 'zh-CN'));
}

/** 新增试题。 */
export async function insert(
  row: {
    id: string;
    bankId: string;
    type: QuestionType;
    stem: string;
    options: string[];
    answer: number[] | string[];
    defaultScore: number;
    analysis: string;
    subject: string;
    tags: string[];
    rubric: RubricBand[];
    createdBy: string;
    createdAt: string;
  },
  exec?: SqlExecutor,
): Promise<void> {
  await runQuery(
    exec,
    `INSERT INTO questions
       (id, bank_id, type, stem, options, answer, default_score, analysis, subject, tags, rubric, created_by, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      row.id,
      row.bankId,
      row.type,
      row.stem,
      JSON.stringify(row.options),
      JSON.stringify(row.answer),
      row.defaultScore,
      row.analysis,
      row.subject,
      JSON.stringify(row.tags),
      JSON.stringify(row.rubric),
      row.createdBy,
      row.createdAt,
    ],
  );
}

/** 更新试题（含归属题库）。 */
export async function update(
  id: string,
  row: {
    bankId: string;
    type: QuestionType;
    stem: string;
    options: string[];
    answer: number[] | string[];
    defaultScore: number;
    analysis: string;
    subject: string;
    tags: string[];
    rubric: RubricBand[];
  },
  exec?: SqlExecutor,
): Promise<void> {
  await runQuery(
    exec,
    `UPDATE questions
       SET bank_id = ?, type = ?, stem = ?, options = ?, answer = ?, default_score = ?, analysis = ?, subject = ?, tags = ?, rubric = ?
     WHERE id = ?`,
    [
      row.bankId,
      row.type,
      row.stem,
      JSON.stringify(row.options),
      JSON.stringify(row.answer),
      row.defaultScore,
      row.analysis,
      row.subject,
      JSON.stringify(row.tags),
      JSON.stringify(row.rubric),
      id,
    ],
  );
}

/** 删除试题。 */
export async function remove(id: string, exec?: SqlExecutor): Promise<void> {
  await runQuery(exec, `DELETE FROM questions WHERE id = ?`, [id]);
}
