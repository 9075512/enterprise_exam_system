/**
 * 试题模块 —— 数据访问层（SQL 集中在此，参数化查询防注入）。
 */
import type { RowDataPacket } from 'mysql2/promise';
import { query, runQuery, type SqlExecutor } from '../../db/pool.js';
import type { QuestionRow } from './question.mapper.js';
import type { QuestionType, QuestionDifficulty, RubricBand } from '../../types/domain.js';

export type { QuestionRow } from './question.mapper.js';

const COLUMNS =
  'id, bank_id, type, stem, options, answer, default_score, analysis, subject, subject_id, status, difficulty, tags, rubric, created_by, created_at';

/** 试题筛选条件。 */
export interface QuestionFilter {
  /** 单题库（题库内列表） */
  bankId?: string;
  /** 多题库（组卷全局池 / 全局列表） */
  bankIds?: string[];
  type?: QuestionType;
  subject?: string;
  subjectId?: string;
  subjectIds?: string[];
  status?: 'active' | 'disabled';
  /** 按题目难度过滤（v3.2） */
  difficulty?: QuestionDifficulty;
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
  if (f.subjectId) {
    conds.push('subject_id = ?');
    params.push(f.subjectId);
  }
  if (f.subjectIds) {
    if (f.subjectIds.length === 0) conds.push('1 = 0');
    else {
      conds.push(`subject_id IN (${f.subjectIds.map(() => '?').join(',')})`);
      params.push(...f.subjectIds);
    }
  }
  if (f.status) {
    conds.push('status = ?');
    params.push(f.status);
  }
  if (f.difficulty) {
    conds.push('difficulty = ?');
    params.push(f.difficulty);
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

/** 科目即题库名称；只返回当前题库集合中已有试题的题库。 */
export async function listSubjects(bankIds?: string[]): Promise<string[]> {
  const { where, params } = buildWhere({ bankIds });
  const rows = await query<RowDataPacket[]>(
    `SELECT DISTINCT b.name AS subject
       FROM questions q
       JOIN question_banks b ON b.id = q.bank_id
       ${where.replaceAll('bank_id', 'q.bank_id')}
       ORDER BY b.name ASC`,
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
export async function findByIds(ids: string[], exec?: SqlExecutor): Promise<QuestionRow[]> {
  if (ids.length === 0) return [];
  return runQuery<QuestionRow[]>(exec,
    `SELECT ${COLUMNS} FROM questions WHERE id IN (${ids.map(() => '?').join(', ')})`,
    ids,
  );
}

/** 某题库全部试题（不分页，按创建时间升序）——题库复制用（v1.7④ S4）。 */
export async function listAllByBank(bankId: string, exec?: SqlExecutor): Promise<QuestionRow[]> {
  return runQuery<QuestionRow[]>(
    exec,
    `SELECT ${COLUMNS} FROM questions WHERE bank_id = ? ORDER BY created_at ASC`,
    [bankId],
  );
}

/** 统计指定题库集合内某题型的题数（抽题充足性判断）。 */
export async function countByType(bankIds: string[], type: QuestionType): Promise<number> {
  const { where, params } = buildWhere({ bankIds, type, status: 'active' });
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
  const base = buildWhere({ bankIds, type, status: 'active' });
  const { where, params } = withExcludes(base.where, base.params, excludeIds);
  return query<QuestionRow[]>(
    `SELECT ${COLUMNS} FROM questions ${where} ORDER BY RAND() LIMIT ?`,
    [...params, count],
  );
}

/** 统计指定题库集合内某知识点标签的题数（v1.7②）。 */
export async function countByTag(bankIds: string[], tag: string): Promise<number> {
  const { where, params } = buildWhere({ bankIds, tag, status: 'active' });
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
  const base = buildWhere({ bankIds, tag, status: 'active' });
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

/* ============================ 题目健康度聚合（v3.3） ============================ */

/**
 * 批量查询题目作答正确率（0-100，保留 1 位小数）。
 * 数据源 `practice_answers`（「首次作答为准」明细）；**仅返回有作答记录的题目**，
 * 调用方对未命中题目按 `null`（从未作答）处理。
 * 题目数受分页约束（唯一一次 IN 批量查询），不存在全表捞出后应用层过滤。
 */
export async function correctRateByQuestionIds(ids: string[]): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  const unique = [...new Set(ids)];
  if (unique.length === 0) return map;
  const rows = await query<RowDataPacket[]>(
    `SELECT question_id, COUNT(*) AS total, SUM(is_correct) AS correct
       FROM practice_answers
      WHERE question_id IN (${unique.map(() => '?').join(', ')})
      GROUP BY question_id`,
    unique,
  );
  for (const r of rows) {
    const total = Number(r.total ?? 0);
    if (total <= 0) continue;
    map.set(String(r.question_id), Math.round((Number(r.correct ?? 0) / total) * 1000) / 10);
  }
  return map;
}

/** 单题库题目结构统计（题型分布 + 待完善口径拆分），两次聚合查询合并返回。 */
export async function statsByBank(bankId: string): Promise<{
  total: number;
  byType: Record<QuestionType, number>;
  incomplete: number;
  missingAnalysis: number;
  missingTags: number;
}> {
  const [typeRows, aggRows] = await Promise.all([
    query<RowDataPacket[]>(
      `SELECT type, COUNT(*) AS c FROM questions WHERE bank_id = ? GROUP BY type`,
      [bankId],
    ),
    query<RowDataPacket[]>(
      `SELECT
         COUNT(*) AS total,
         SUM(CASE WHEN analysis IS NULL OR analysis = '' THEN 1 ELSE 0 END) AS missing_analysis,
         SUM(CASE WHEN tags IS NULL OR JSON_LENGTH(tags) = 0 THEN 1 ELSE 0 END) AS missing_tags,
         SUM(CASE WHEN (analysis IS NULL OR analysis = '')
                   OR (tags IS NULL OR JSON_LENGTH(tags) = 0) THEN 1 ELSE 0 END) AS incomplete
       FROM questions WHERE bank_id = ?`,
      [bankId],
    ),
  ]);
  const byType: Record<QuestionType, number> = { single: 0, multiple: 0, judge: 0, fill: 0, short: 0 };
  for (const r of typeRows) {
    const t = String(r.type) as QuestionType;
    if (t in byType) byType[t] = Number(r.c ?? 0);
  }
  const agg = aggRows[0] ?? {};
  return {
    total: Number(agg.total ?? 0),
    byType,
    incomplete: Number(agg.incomplete ?? 0),
    missingAnalysis: Number(agg.missing_analysis ?? 0),
    missingTags: Number(agg.missing_tags ?? 0),
  };
}

/**
 * 单题库练题作答正确率（加权：所有作答记录中正确占比）。
 * @returns `avg` 百分比（保留 1 位小数，无作答 → null）；`answeredCount` 有作答记录的题数。
 */
export async function practiceStatsByBank(
  bankId: string,
): Promise<{ avg: number | null; answeredCount: number }> {
  const rows = await query<RowDataPacket[]>(
    `SELECT COUNT(*) AS total, SUM(pa.is_correct) AS correct, COUNT(DISTINCT pa.question_id) AS answered
       FROM practice_answers pa
       JOIN questions q ON q.id = pa.question_id
      WHERE q.bank_id = ?`,
    [bankId],
  );
  const row = rows[0] ?? {};
  const total = Number(row.total ?? 0);
  return {
    avg: total > 0 ? Math.round((Number(row.correct ?? 0) / total) * 1000) / 10 : null,
    answeredCount: Number(row.answered ?? 0),
  };
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
    subjectId: string | null;
    status?: 'active' | 'disabled';
    difficulty: QuestionDifficulty | null;
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
       (id, bank_id, type, stem, options, answer, default_score, analysis, subject, subject_id, status, difficulty, tags, rubric, created_by, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
      row.subjectId,
      row.status ?? 'active',
      row.difficulty,
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
    subjectId: string | null;
    status?: 'active' | 'disabled';
    difficulty: QuestionDifficulty | null;
    tags: string[];
    rubric: RubricBand[];
  },
  exec?: SqlExecutor,
): Promise<void> {
  await runQuery(
    exec,
    `UPDATE questions
       SET bank_id = ?, type = ?, stem = ?, options = ?, answer = ?, default_score = ?, analysis = ?, subject = ?, subject_id = ?, status = ?, difficulty = ?, tags = ?, rubric = ?
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
      row.subjectId,
      row.status ?? 'active',
      row.difficulty,
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
