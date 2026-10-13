/**
 * 考试模块 —— 数据访问层（SQL 集中在此，参数化查询防注入）。
 */
import type { RowDataPacket } from 'mysql2/promise';
import { query, runQuery, type SqlExecutor } from '../../db/pool.js';
import type { ExamRow } from './exams.mapper.js';

export type { ExamRow } from './exams.mapper.js';

const COLUMNS =
  'id, name, paper_id, department_ids, start_time, end_time, duration_minutes, pass_score, max_attempts, shuffle_enabled, shuffle_options, allow_retake, created_by, created_at';

/** 全部考试（按开始时间倒序）。 */
export async function list(): Promise<ExamRow[]> {
  return query<ExamRow[]>(`SELECT ${COLUMNS} FROM exams ORDER BY start_time DESC`);
}

/** 按 id 查询。 */
export async function findById(id: string, exec?: SqlExecutor): Promise<ExamRow | null> {
  const rows = await runQuery<ExamRow[]>(exec, `SELECT ${COLUMNS} FROM exams WHERE id = ? LIMIT 1`, [id]);
  return rows[0] ?? null;
}

/** 考生可见考试：参与科室命中本人科室（JSON_CONTAINS 科室隔离）。 */
export async function listForDepartment(departmentId: string): Promise<ExamRow[]> {
  return query<ExamRow[]>(
    `SELECT ${COLUMNS} FROM exams
       WHERE JSON_CONTAINS(department_ids, JSON_QUOTE(?))
       ORDER BY start_time DESC`,
    [departmentId],
  );
}

/** 统计引用该 exams 的记录数（删除前校验）。 */
export async function countRecords(examId: string): Promise<number> {
  const rows = await query<RowDataPacket[]>(`SELECT COUNT(*) AS c FROM exam_records WHERE exam_id = ?`, [examId]);
  return Number(rows[0]?.c ?? 0);
}

/** 新增考试。 */
export async function insert(
  row: {
    id: string;
    name: string;
    paperId: string;
    departmentIds: string[];
    startTime: string;
    endTime: string;
    durationMinutes: number;
    passScore: number;
    maxAttempts: number;
    shuffleEnabled: boolean | null;
    shuffleOptions: boolean | null;
    allowRetake: boolean | null;
    createdBy: string;
    createdAt: string;
  },
  exec?: SqlExecutor,
): Promise<void> {
  await runQuery(
    exec,
    `INSERT INTO exams
       (id, name, paper_id, department_ids, start_time, end_time, duration_minutes, pass_score, max_attempts, shuffle_enabled, shuffle_options, allow_retake, created_by, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      row.id,
      row.name,
      row.paperId,
      JSON.stringify(row.departmentIds),
      row.startTime,
      row.endTime,
      row.durationMinutes,
      row.passScore,
      row.maxAttempts,
      row.shuffleEnabled === null ? null : row.shuffleEnabled ? 1 : 0,
      row.shuffleOptions === null ? null : row.shuffleOptions ? 1 : 0,
      row.allowRetake === null ? null : row.allowRetake ? 1 : 0,
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
    startTime: string;
    endTime: string;
    durationMinutes: number;
    passScore: number;
    maxAttempts: number;
    shuffleEnabled: boolean | null;
    shuffleOptions: boolean | null;
    allowRetake: boolean | null;
  },
  exec?: SqlExecutor,
): Promise<void> {
  await runQuery(
    exec,
    `UPDATE exams
       SET name = ?, paper_id = ?, department_ids = ?, start_time = ?, end_time = ?, duration_minutes = ?, pass_score = ?, max_attempts = ?, shuffle_enabled = ?, shuffle_options = ?, allow_retake = ?
     WHERE id = ?`,
    [
      row.name,
      row.paperId,
      JSON.stringify(row.departmentIds),
      row.startTime,
      row.endTime,
      row.durationMinutes,
      row.passScore,
      row.maxAttempts,
      row.shuffleEnabled === null ? null : row.shuffleEnabled ? 1 : 0,
      row.shuffleOptions === null ? null : row.shuffleOptions ? 1 : 0,
      row.allowRetake === null ? null : row.allowRetake ? 1 : 0,
      id,
    ],
  );
}

/** 删除考试。 */
export async function remove(id: string, exec?: SqlExecutor): Promise<void> {
  await runQuery(exec, `DELETE FROM exams WHERE id = ?`, [id]);
}
