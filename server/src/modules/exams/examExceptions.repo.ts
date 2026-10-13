/**
 * 特殊考试安排 —— 数据访问层（v1.7①）。
 * `exam_exceptions` 按 (exam_id, user_id) 唯一：一场考试一名考生至多一条安排。
 */
import type { RowDataPacket } from 'mysql2/promise';
import { query, runQuery, type SqlExecutor } from '../../db/pool.js';

/** 特殊安排原始行（含 JOIN 出的考生信息）。 */
export interface ExamExceptionRow extends RowDataPacket {
  id: string;
  exam_id: string;
  user_id: string;
  extra_minutes: number | string;
  extra_attempts: number | string;
  exempt: number | boolean;
  note: string;
  created_at: string;
  user_name: string;
  username: string;
  department_name: string | null;
}

const SELECT_SQL = `
  SELECT x.id, x.exam_id, x.user_id, x.extra_minutes, x.extra_attempts, x.exempt, x.note, x.created_at,
         u.name AS user_name, u.username AS username, d.name AS department_name
    FROM exam_exceptions x
    JOIN users u ON u.id = x.user_id
    LEFT JOIN departments d ON d.id = u.department_id`;

/** 某场考试的全部特殊安排。 */
export async function listByExam(examId: string): Promise<ExamExceptionRow[]> {
  return query<ExamExceptionRow[]>(
    `${SELECT_SQL} WHERE x.exam_id = ? ORDER BY u.name ASC`,
    [examId],
  );
}

/** 某考生的全部特殊安排（考试 id → 安排 映射用）。 */
export async function listByUser(userId: string): Promise<ExamExceptionRow[]> {
  return query<ExamExceptionRow[]>(
    `${SELECT_SQL} WHERE x.user_id = ?`,
    [userId],
  );
}

/** 按 考试×考生 精确查询。 */
export async function findByExamAndUser(
  examId: string,
  userId: string,
  exec?: SqlExecutor,
): Promise<ExamExceptionRow | null> {
  const rows = await runQuery<ExamExceptionRow[]>(
    exec,
    `SELECT x.id, x.exam_id, x.user_id, x.extra_minutes, x.extra_attempts, x.exempt, x.note, x.created_at,
            u.name AS user_name, u.username AS username, d.name AS department_name
       FROM exam_exceptions x
       JOIN users u ON u.id = x.user_id
       LEFT JOIN departments d ON d.id = u.department_id
      WHERE x.exam_id = ? AND x.user_id = ? LIMIT 1`,
    [examId, userId],
  );
  return rows[0] ?? null;
}

/** 新增特殊安排。 */
export async function insert(
  row: {
    id: string;
    examId: string;
    userId: string;
    extraMinutes: number;
    extraAttempts: number;
    exempt: boolean;
    note: string;
    createdBy: string;
    createdAt: string;
  },
  exec?: SqlExecutor,
): Promise<void> {
  await runQuery(
    exec,
    `INSERT INTO exam_exceptions
       (id, exam_id, user_id, extra_minutes, extra_attempts, exempt, note, created_by, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      row.id,
      row.examId,
      row.userId,
      row.extraMinutes,
      row.extraAttempts,
      row.exempt ? 1 : 0,
      row.note,
      row.createdBy,
      row.createdAt,
    ],
  );
}

/** 更新特殊安排（按 考试×考生）。 */
export async function updateByExamAndUser(
  examId: string,
  userId: string,
  row: { extraMinutes: number; extraAttempts: number; exempt: boolean; note: string },
  exec?: SqlExecutor,
): Promise<void> {
  await runQuery(
    exec,
    `UPDATE exam_exceptions SET extra_minutes = ?, extra_attempts = ?, exempt = ?, note = ?
      WHERE exam_id = ? AND user_id = ?`,
    [row.extraMinutes, row.extraAttempts, row.exempt ? 1 : 0, row.note, examId, userId],
  );
}

/** 删除特殊安排（按 考试×考生）。 */
export async function removeByExamAndUser(examId: string, userId: string, exec?: SqlExecutor): Promise<void> {
  await runQuery(exec, `DELETE FROM exam_exceptions WHERE exam_id = ? AND user_id = ?`, [examId, userId]);
}
