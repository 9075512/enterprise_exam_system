/**
 * 考试模块 —— 数据访问层（SQL 集中在此，参数化查询防注入）。
 */
import type { RowDataPacket } from 'mysql2/promise';
import { query, runQuery, type SqlExecutor } from '../../db/pool.js';
import { RECORD_SOURCE } from '../../db/recordSource.js';
import type { ExamRow } from './exams.mapper.js';

export type { ExamRow } from './exams.mapper.js';

const COLUMNS =
  'id, name, paper_id, department_ids, audience_mode, audience_rules, start_time, end_time, duration_minutes, pass_score, max_attempts, shuffle_enabled, shuffle_options, allow_retake, allow_appeal, capture_settings, exam_mode, created_by, created_at';

/** 全部考试（按开始时间倒序）。 */
export async function list(): Promise<ExamRow[]> {
  return query<ExamRow[]>(`SELECT ${COLUMNS} FROM exams ORDER BY start_time DESC`);
}

/** 按 id 查询。 */
export async function findById(id: string, exec?: SqlExecutor, lock = false): Promise<ExamRow | null> {
  const rows = await runQuery<ExamRow[]>(exec, `SELECT ${COLUMNS} FROM exams WHERE id = ? LIMIT 1${lock ? ' FOR UPDATE' : ''}`, [id]);
  return rows[0] ?? null;
}

/**
 * 考生可见考试：参与科室命中「本人科室或任一祖先科室」（多级科室树级联）。
 * v1.6③：考生科室的祖先链任一命中考试所选科室即视为参与。
 * ancestorIds 为空时返回空集（无科室考生看不到任何考试）。
 */
export async function listForAncestors(ancestorIds: string[]): Promise<ExamRow[]> {
  if (ancestorIds.length === 0) return [];
  const ors = ancestorIds.map(() => `JSON_CONTAINS(department_ids, JSON_QUOTE(?))`).join(' OR ');
  return query<ExamRow[]>(
    `SELECT ${COLUMNS} FROM exams WHERE (${ors}) ORDER BY start_time DESC`,
    ancestorIds,
  );
}

/** 冻结考试按人员表判断；旧 dynamic 考试继续按科室祖先链判断。 */
export async function listForUser(userId: string, ancestorIds: string[]): Promise<ExamRow[]> {
  const dynamic = ancestorIds.length
    ? `OR (e.audience_mode = 'dynamic' AND (${ancestorIds.map(() => `JSON_CONTAINS(e.department_ids, JSON_QUOTE(?))`).join(' OR ')}))`
    : '';
  return query<ExamRow[]>(
    `SELECT ${COLUMNS.split(', ').map((c) => `e.${c}`).join(', ')} FROM exams e
     WHERE (e.audience_mode = 'frozen' AND EXISTS (
       SELECT 1 FROM exam_participants ep WHERE ep.exam_id = e.id AND ep.user_id = ?
     )) ${dynamic}
     ORDER BY e.start_time DESC`,
    [userId, ...ancestorIds],
  );
}

/** 统计引用该 exams 的记录数（删除前校验）。 */
export async function countRecords(examId: string, exec?: SqlExecutor): Promise<number> {
  const rows = await runQuery<RowDataPacket[]>(exec, `SELECT COUNT(*) AS c FROM ${RECORD_SOURCE} WHERE exam_id = ?`, [examId]);
  return Number(rows[0]?.c ?? 0);
}

/** 新增考试。 */
export async function insert(
  row: {
    id: string;
    name: string;
    paperId: string;
    departmentIds: string[];
    audienceRules: Record<string, unknown>;
    startTime: string;
    endTime: string;
    durationMinutes: number;
    passScore: number;
    maxAttempts: number;
    shuffleEnabled: boolean | null;
    shuffleOptions: boolean | null;
    allowRetake: boolean | null;
    allowAppeal: boolean | null;
    captureSettings?: unknown;
    examMode: 'open' | 'closed';
    createdBy: string;
    createdAt: string;
  },
  exec?: SqlExecutor,
): Promise<void> {
  await runQuery(
    exec,
    `INSERT INTO exams
       (id, name, paper_id, department_ids, audience_mode, audience_rules, start_time, end_time, duration_minutes, pass_score, max_attempts, shuffle_enabled, shuffle_options, allow_retake, allow_appeal, capture_settings, exam_mode, created_by, created_at)
     VALUES (?, ?, ?, ?, 'frozen', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      row.id,
      row.name,
      row.paperId,
      JSON.stringify(row.departmentIds),
      JSON.stringify(row.audienceRules),
      row.startTime,
      row.endTime,
      row.durationMinutes,
      row.passScore,
      row.maxAttempts,
      row.shuffleEnabled === null ? null : row.shuffleEnabled ? 1 : 0,
      row.shuffleOptions === null ? null : row.shuffleOptions ? 1 : 0,
      row.allowRetake === null ? null : row.allowRetake ? 1 : 0,
      row.allowAppeal === null ? null : row.allowAppeal ? 1 : 0,
      JSON.stringify(row.captureSettings ?? null),
      row.examMode,
      row.createdBy,
      row.createdAt,
    ],
  );
}

/** 更新考试。 */
export async function update(
  id: string,
  row: {
    name: string;
    paperId: string;
    departmentIds: string[];
    audienceRules: Record<string, unknown>;
    startTime: string;
    endTime: string;
    durationMinutes: number;
    passScore: number;
    maxAttempts: number;
    shuffleEnabled: boolean | null;
    shuffleOptions: boolean | null;
    allowRetake: boolean | null;
    allowAppeal: boolean | null;
    captureSettings?: unknown;
    examMode: 'open' | 'closed';
  },
  exec?: SqlExecutor,
): Promise<void> {
  await runQuery(
    exec,
    `UPDATE exams
       SET name = ?, paper_id = ?, department_ids = ?, audience_mode = 'frozen', audience_rules = ?, start_time = ?, end_time = ?, duration_minutes = ?, pass_score = ?, max_attempts = ?, shuffle_enabled = ?, shuffle_options = ?, allow_retake = ?, allow_appeal = ?, capture_settings = ?, exam_mode = ?
     WHERE id = ?`,
    [
      row.name,
      row.paperId,
      JSON.stringify(row.departmentIds),
      JSON.stringify(row.audienceRules),
      row.startTime,
      row.endTime,
      row.durationMinutes,
      row.passScore,
      row.maxAttempts,
      row.shuffleEnabled === null ? null : row.shuffleEnabled ? 1 : 0,
      row.shuffleOptions === null ? null : row.shuffleOptions ? 1 : 0,
      row.allowRetake === null ? null : row.allowRetake ? 1 : 0,
      row.allowAppeal === null ? null : row.allowAppeal ? 1 : 0,
      JSON.stringify(row.captureSettings ?? null),
      row.examMode,
      id,
    ],
  );
}

/** 删除考试。 */
export async function remove(id: string, exec?: SqlExecutor): Promise<void> {
  await runQuery(exec, `DELETE FROM exams WHERE id = ?`, [id]);
}

export async function listAuthors(examId: string, exec?: SqlExecutor): Promise<Array<{ id: string; name: string }>> {
  const rows = await runQuery<RowDataPacket[]>(exec, 'SELECT u.id, u.name FROM exam_authors ea JOIN users u ON u.id = ea.user_id WHERE ea.exam_id = ? ORDER BY u.id', [examId]);
  return rows.map(r => ({ id: String(r.id), name: String(r.name) }));
}
export async function replaceAuthors(examId: string, authorIds: string[], exec: SqlExecutor): Promise<void> {
  await runQuery(exec, 'DELETE FROM exam_authors WHERE exam_id = ?', [examId]);
  for (const id of new Set(authorIds)) await runQuery(exec, 'INSERT INTO exam_authors (exam_id, user_id) VALUES (?, ?)', [examId, id]);
}
