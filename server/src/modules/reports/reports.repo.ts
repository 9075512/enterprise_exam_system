/**
 * 报表模块 —— 数据访问层。
 * 复用 exams / departments 的既有查询，避免重复 SQL（委托导出）。
 *
 * 关键：同一考生对同一场考试可能作答多次，报表聚合必须「每人只取 attempt_no 最大的
 * 那条已交卷记录」参与统计，否则多次作答会被重复计数。以下 SQL 通过 JOIN 子查询取
 * 每位考生的 max(attempt_no) 实现去重（summary / bands / departments / wrongRate 共用同一数据源）。
 */
import { query } from '../../db/pool.js';
import type { ExamRecordDetailRow, ExamRecordRow } from '../records/records.mapper.js';

export { findById as findExam } from '../exams/exams.repo.js';
export { findById as findDepartment } from '../departments/departments.repo.js';

/** exam_records 全列（带表别名 r）。 */
const RECORD_COLUMNS =
  'r.id, r.exam_id, r.user_id, r.attempt_no, r.department_id, r.paper_snapshot, r.status, r.answers, r.started_at, r.submitted_at, r.auto_submitted, r.score, r.cheat_events';

/**
 * 某场考试「每位考生最近一次已交卷」的记录集合（报表数据源）。
 * 先按 (exam_id, user_id) 分组取 max(attempt_no)，再 JOIN 回原表取完整行，保证一人一条。
 */
export async function listLatestSubmittedByExam(examId: string): Promise<ExamRecordRow[]> {
  return query<ExamRecordRow[]>(
    `SELECT ${RECORD_COLUMNS}
       FROM exam_records r
       JOIN (
         SELECT user_id, MAX(attempt_no) AS max_attempt
           FROM exam_records
          WHERE exam_id = ? AND status = 'submitted'
          GROUP BY user_id
       ) m ON m.user_id = r.user_id AND m.max_attempt = r.attempt_no
      WHERE r.exam_id = ? AND r.status = 'submitted'`,
    [examId, examId],
  );
}

/** 导出数据源行：在记录详情行之上附加登录账号与试卷名（均可能为空）。 */
export interface ScoreExportRawRow extends ExamRecordDetailRow {
  username: string | null;
  paper_name: string | null;
}

/**
 * 某场考试「每位考生最近一次已交卷」的记录（带 JOIN 的导出数据源）。
 * 去重口径与 `listLatestSubmittedByExam` 一致（每人一条 attempt_no 最大者），
 * 额外 JOIN users / departments / exams / papers 取得姓名、账号、科室名、及格线与试卷名。
 * 排序：得分降序、姓名升序（与报表展示一致，保证导出稳定）。
 */
export async function listLatestSubmittedWithUser(examId: string): Promise<ScoreExportRawRow[]> {
  return query<ScoreExportRawRow[]>(
    `SELECT r.id, r.exam_id, r.user_id, r.attempt_no, r.department_id, r.paper_snapshot, r.status,
            r.answers, r.started_at, r.submitted_at, r.auto_submitted, r.score, r.cheat_events,
            e.name AS exam_name, e.pass_score AS pass_score, p.name AS paper_name,
            u.name AS user_name, u.username AS username,
            COALESCE(d.name, du.name, '') AS department_name
       FROM exam_records r
       JOIN ( SELECT user_id, MAX(attempt_no) AS max_attempt
                FROM exam_records WHERE exam_id = ? AND status = 'submitted' GROUP BY user_id ) m
         ON m.user_id = r.user_id AND m.max_attempt = r.attempt_no
       LEFT JOIN exams e ON e.id = r.exam_id
       LEFT JOIN papers p ON p.id = e.paper_id
       LEFT JOIN users u ON u.id = r.user_id
       LEFT JOIN departments d ON d.id = r.department_id
       LEFT JOIN departments du ON du.id = u.department_id
      WHERE r.exam_id = ? AND r.status = 'submitted'
      ORDER BY r.score DESC, u.name ASC`,
    [examId, examId],
  );
}
