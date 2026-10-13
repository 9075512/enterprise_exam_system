/**
 * 报表模块 —— 数据访问层。
 * 复用 exams / departments 的既有查询，避免重复 SQL（委托导出）。
 *
 * 关键：同一考生对同一场考试可能作答多次，报表聚合必须「每人只取 attempt_no 最大的
 * 那条已交卷记录」参与统计，否则多次作答会被重复计数。以下 SQL 通过 JOIN 子查询取
 * 每位考生的 max(attempt_no) 实现去重（summary / bands / departments / wrongRate 共用同一数据源）。
 */
import { query } from '../../db/pool.js';
import type { RowDataPacket } from 'mysql2/promise';
import type { ExamRecordDetailRow, ExamRecordRow } from '../records/records.mapper.js';

export { findById as findExam } from '../exams/exams.repo.js';
export { findById as findDepartment } from '../departments/departments.repo.js';
export { list as listDepartments } from '../departments/departments.repo.js';

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

/** 及格率趋势行（每场考试一行，聚合已交卷的最新一次作答）。 */
export interface ExamTrendRow extends RowDataPacket {
  exam_id: string;
  exam_name: string;
  start_time: string;
  total: number | string;
  avg_score: number | string;
  pass_count: number | string;
}

/** 看板筛选条件（已由 service 层归一化：科室 id 集合 / 考试开始时间范围）。 */
export interface DashboardWhere {
  /** 科室范围（含子科室）；空数组 = 不过滤 */
  departmentIds?: string[];
  /** 起始时刻（含，DB 可写格式） */
  from?: string;
  /** 截止时刻（含，DB 可写格式） */
  to?: string;
}

/** 构造看板筛选 SQL 片段（考试开始时间范围 + 记录科室范围）。 */
function buildDashboardCond(
  f: DashboardWhere,
  alias: { exam: string; record: string },
): { cond: string; params: Array<string> } {
  const conds: string[] = [];
  const params: string[] = [];
  if (f.departmentIds && f.departmentIds.length > 0) {
    conds.push(`${alias.record}.department_id IN (${f.departmentIds.map(() => '?').join(', ')})`);
    params.push(...f.departmentIds);
  }
  if (f.from) {
    conds.push(`${alias.exam}.start_time >= ?`);
    params.push(f.from);
  }
  if (f.to) {
    conds.push(`${alias.exam}.start_time <= ?`);
    params.push(f.to);
  }
  return { cond: conds.length > 0 ? `AND ${conds.join(' AND ')}` : '', params };
}

/**
 * 全部考试的及格率趋势：每人取最新一次已交卷，按考试聚合人数/平均分/及格人数。
 * MySQL 布尔比较 `r.score >= e.pass_score` 返回 1/0，SUM 即及格人数。
 * v1.7② 支持按科室（含子树）与考试开始时间范围筛选。
 */
export async function listExamTrend(filter: DashboardWhere = {}): Promise<ExamTrendRow[]> {
  const { cond, params } = buildDashboardCond(filter, { exam: 'e', record: 'r' });
  return query<ExamTrendRow[]>(
    `SELECT e.id AS exam_id, e.name AS exam_name, e.start_time,
            COUNT(m.user_id) AS total,
            COALESCE(AVG(r.score), 0) AS avg_score,
            COALESCE(SUM(r.score >= e.pass_score), 0) AS pass_count
       FROM exams e
       JOIN exam_records r ON r.exam_id = e.id AND r.status = 'submitted'
       JOIN ( SELECT exam_id, user_id, MAX(attempt_no) AS max_attempt
                FROM exam_records WHERE status = 'submitted' GROUP BY exam_id, user_id ) m
         ON m.exam_id = r.exam_id AND m.user_id = r.user_id AND m.max_attempt = r.attempt_no
      WHERE 1 = 1 ${cond}
      GROUP BY e.id, e.name, e.start_time
      ORDER BY e.start_time ASC`,
    params,
  );
}

/** 错题归因数据源行（仅需快照与答案，用于按科目统计错题）。 */
export interface LatestRecordRow extends RowDataPacket {
  exam_id: string;
  paper_snapshot: unknown;
  answers: unknown;
}

/**
 * 全部考试「每位考生最近一次已交卷」的记录（跨考试科目/知识点错题归因数据源）。
 * v1.7② 支持按科室（含子树）与考试开始时间范围筛选。
 */
export async function listLatestSubmittedAll(filter: DashboardWhere = {}): Promise<LatestRecordRow[]> {
  const { cond, params } = buildDashboardCond(filter, { exam: 'e', record: 'r' });
  return query<LatestRecordRow[]>(
    `SELECT r.exam_id, r.paper_snapshot, r.answers
       FROM exam_records r
       JOIN exams e ON e.id = r.exam_id
       JOIN ( SELECT exam_id, user_id, MAX(attempt_no) AS max_attempt
                FROM exam_records WHERE status = 'submitted' GROUP BY exam_id, user_id ) m
         ON m.exam_id = r.exam_id AND m.user_id = r.user_id AND m.max_attempt = r.attempt_no
      WHERE r.status = 'submitted' ${cond}`,
    params,
  );
}
