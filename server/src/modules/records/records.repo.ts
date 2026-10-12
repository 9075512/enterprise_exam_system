/**
 * 考试记录模块 —— 数据访问层（SQL 集中在此，参数化查询防注入）。
 */
import type { RowDataPacket } from 'mysql2/promise';
import { query, runQuery, type SqlExecutor } from '../../db/pool.js';
import type { ExamRecordDetailRow, ExamRecordRow } from './records.mapper.js';

export type { ExamRecordRow } from './records.mapper.js';

const COLUMNS =
  'id, exam_id, user_id, attempt_no, department_id, paper_snapshot, status, answers, started_at, submitted_at, auto_submitted, score, cheat_events';

/**
 * 关联 `exams`（用于按考试名称筛选）时的记录列，全部显式加 `r.` 前缀，
 * 避免与 exams.id / exams.name 等同名列歧义。
 */
const RECORD_COLUMNS_R =
  'r.id, r.exam_id, r.user_id, r.attempt_no, r.department_id, r.paper_snapshot, r.status, r.answers, ' +
  'r.started_at, r.submitted_at, r.auto_submitted, r.score, r.cheat_events';

/**
 * 转义 LIKE 模式中的特殊字符：先转义反斜杠，再转义 `%` 与 `_`，
 * 使它们按字面量参与匹配（配合 SQL `ESCAPE '\\'`）。
 */
function escapeLike(raw: string): string {
  return raw.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
}

/** 按 id 查询记录。 */
export async function findById(id: string, exec?: SqlExecutor): Promise<ExamRecordRow | null> {
  const rows = await runQuery<ExamRecordRow[]>(exec, `SELECT ${COLUMNS} FROM exam_records WHERE id = ? LIMIT 1`, [id]);
  return rows[0] ?? null;
}

/**
 * 按 id 查询记录详情（附带展示字段：考试名称 / 及格线 / 姓名 / 科室名）。
 * 科室名优先取记录上的 department_id，为空时回退到考生当前所属科室。
 */
export async function findDetailById(id: string, exec?: SqlExecutor): Promise<ExamRecordDetailRow | null> {
  const rows = await runQuery<ExamRecordDetailRow[]>(
    exec,
    `SELECT r.id, r.exam_id, r.user_id, r.attempt_no, r.department_id, r.paper_snapshot, r.status, r.answers,
            r.started_at, r.submitted_at, r.auto_submitted, r.score, r.cheat_events,
            e.name AS exam_name, e.pass_score AS pass_score,
            u.name AS user_name, COALESCE(d.name, du.name, '') AS department_name
       FROM exam_records r
       LEFT JOIN exams e ON e.id = r.exam_id
       LEFT JOIN users u ON u.id = r.user_id
       LEFT JOIN departments d ON d.id = r.department_id
       LEFT JOIN departments du ON du.id = u.department_id
      WHERE r.id = ? LIMIT 1`,
    [id],
  );
  return rows[0] ?? null;
}

/** 按（考试, 用户）取 attempt_no 最大的一条记录（即最近一次作答）。 */
export async function findLatestByExamAndUser(
  examId: string,
  userId: string,
  exec?: SqlExecutor,
): Promise<ExamRecordRow | null> {
  const rows = await runQuery<ExamRecordRow[]>(
    exec,
    `SELECT ${COLUMNS} FROM exam_records WHERE exam_id = ? AND user_id = ? ORDER BY attempt_no DESC LIMIT 1`,
    [examId, userId],
  );
  return rows[0] ?? null;
}

/** 按（考试, 用户, 次数）精确查询记录（并发插入冲突时回读）。 */
export async function findByExamUserAttempt(
  examId: string,
  userId: string,
  attemptNo: number,
  exec?: SqlExecutor,
): Promise<ExamRecordRow | null> {
  const rows = await runQuery<ExamRecordRow[]>(
    exec,
    `SELECT ${COLUMNS} FROM exam_records WHERE exam_id = ? AND user_id = ? AND attempt_no = ? LIMIT 1`,
    [examId, userId, attemptNo],
  );
  return rows[0] ?? null;
}

/** 按（考试, 用户）取进行中的记录（续考幂等用，理论至多一条）。 */
export async function findInProgressByExamAndUser(
  examId: string,
  userId: string,
  exec?: SqlExecutor,
): Promise<ExamRecordRow | null> {
  const rows = await runQuery<ExamRecordRow[]>(
    exec,
    `SELECT ${COLUMNS} FROM exam_records
       WHERE exam_id = ? AND user_id = ? AND status = 'in_progress'
       ORDER BY attempt_no DESC LIMIT 1`,
    [examId, userId],
  );
  return rows[0] ?? null;
}

/** 某用户在某场考试下「已交卷」的次数（答题次数上限校验用）。 */
export async function countSubmittedByExamAndUser(
  examId: string,
  userId: string,
  exec?: SqlExecutor,
): Promise<number> {
  const rows = await runQuery<RowDataPacket[]>(
    exec,
    `SELECT COUNT(*) AS c FROM exam_records WHERE exam_id = ? AND user_id = ? AND status = 'submitted'`,
    [examId, userId],
  );
  return Number(rows[0]?.c ?? 0);
}

/** 某用户的全部记录（用于考生端 examId→status 映射）。 */
export async function listByUser(userId: string, exec?: SqlExecutor): Promise<ExamRecordRow[]> {
  return runQuery<ExamRecordRow[]>(
    exec,
    `SELECT ${COLUMNS} FROM exam_records WHERE user_id = ?`,
    [userId],
  );
}

/**
 * 某用户已交卷记录（分页，按交卷时间倒序）。
 * keyword 非空时按考试名称模糊匹配（通配符按字面量处理）。
 */
export async function listMySubmitted(
  userId: string,
  paging: { pageSize: number; offset: number },
  keyword?: string,
): Promise<ExamRecordRow[]> {
  const keywordCond = keyword ? ` AND e.name LIKE ? ESCAPE '\\\\'` : '';
  const params = keyword
    ? [userId, `%${escapeLike(keyword)}%`, paging.pageSize, paging.offset]
    : [userId, paging.pageSize, paging.offset];
  return query<ExamRecordRow[]>(
    `SELECT ${RECORD_COLUMNS_R}
       FROM exam_records r
       LEFT JOIN exams e ON e.id = r.exam_id
      WHERE r.user_id = ? AND r.status = 'submitted'${keywordCond}
      ORDER BY r.submitted_at DESC
      LIMIT ? OFFSET ?`,
    params,
  );
}

/** 某用户已交卷记录数（与 listMySubmitted 使用同一筛选条件，保证 total 一致）。 */
export async function countMySubmitted(userId: string, keyword?: string): Promise<number> {
  const keywordCond = keyword ? ` AND e.name LIKE ? ESCAPE '\\\\'` : '';
  const params = keyword ? [userId, `%${escapeLike(keyword)}%`] : [userId];
  const rows = await query<RowDataPacket[]>(
    `SELECT COUNT(*) AS c
       FROM exam_records r
       LEFT JOIN exams e ON e.id = r.exam_id
      WHERE r.user_id = ? AND r.status = 'submitted'${keywordCond}`,
    params,
  );
  return Number(rows[0]?.c ?? 0);
}

/** 某场考试全部记录（分页，按开考时间倒序）。 */
export async function listByExam(
  examId: string,
  paging: { pageSize: number; offset: number },
): Promise<ExamRecordRow[]> {
  return query<ExamRecordRow[]>(
    `SELECT ${COLUMNS} FROM exam_records WHERE exam_id = ? ORDER BY started_at DESC LIMIT ? OFFSET ?`,
    [examId, paging.pageSize, paging.offset],
  );
}

/** 某场考试记录总数。 */
export async function countByExam(examId: string): Promise<number> {
  const rows = await query<RowDataPacket[]>(`SELECT COUNT(*) AS c FROM exam_records WHERE exam_id = ?`, [examId]);
  return Number(rows[0]?.c ?? 0);
}

/** 新增记录。 */
export async function insert(
  row: {
    id: string;
    examId: string;
    userId: string;
    attemptNo: number;
    departmentId: string | null;
    paperSnapshot: unknown;
    answers: unknown;
    startedAt: string;
    cheatEvents: unknown;
  },
  exec?: SqlExecutor,
): Promise<void> {
  await runQuery(
    exec,
    `INSERT INTO exam_records
       (id, exam_id, user_id, attempt_no, department_id, paper_snapshot, status, answers, started_at, submitted_at, auto_submitted, score, cheat_events)
     VALUES (?, ?, ?, ?, ?, ?, 'in_progress', ?, ?, NULL, 0, 0, ?)`,
    [
      row.id,
      row.examId,
      row.userId,
      row.attemptNo,
      row.departmentId,
      JSON.stringify(row.paperSnapshot),
      JSON.stringify(row.answers),
      row.startedAt,
      JSON.stringify(row.cheatEvents),
    ],
  );
}

/** 覆写答案 JSON（暂存）。 */
export async function updateAnswers(id: string, answers: unknown, exec?: SqlExecutor): Promise<void> {
  await runQuery(exec, `UPDATE exam_records SET answers = ? WHERE id = ?`, [JSON.stringify(answers), id]);
}

/** 覆写切屏事件 JSON（读改写回整列）。 */
export async function updateCheatEvents(id: string, events: unknown, exec?: SqlExecutor): Promise<void> {
  await runQuery(exec, `UPDATE exam_records SET cheat_events = ? WHERE id = ?`, [JSON.stringify(events), id]);
}

/** 交卷：写入状态、交卷时间、自动标记与分数。 */
export async function submit(
  id: string,
  data: { submittedAt: string; autoSubmitted: boolean; score: number },
  exec?: SqlExecutor,
): Promise<void> {
  await runQuery(
    exec,
    `UPDATE exam_records SET status = 'submitted', submitted_at = ?, auto_submitted = ?, score = ? WHERE id = ?`,
    [data.submittedAt, data.autoSubmitted ? 1 : 0, data.score, id],
  );
}
