/**
 * 实时考试监控 —— 数据访问层（v1.7④ T3）。
 *
 * 取「某场考试每位考生的最新一次作答」（attempt_no 最大者），
 * 附带考生姓名/账号/科室名与特殊安排（加时分钟数），供监考大屏轮询。
 */
import type { RowDataPacket } from 'mysql2/promise';
import { query } from '../../db/pool.js';
import type { RecordStatus } from '../../types/domain.js';

/** 监考行原始数据（exam_records + users/departments/exam_exceptions）。 */
export interface MonitorRecordRow extends RowDataPacket {
  id: string;
  user_id: string;
  status: RecordStatus;
  attempt_no: number | string;
  started_at: string;
  submitted_at: string | null;
  auto_submitted: number | boolean;
  score: number | string;
  resume_allowed: number | boolean;
  cheat_events: unknown;
  extra_minutes: number | string | null;
  user_name: string | null;
  username: string | null;
  department_name: string | null;
}

/**
 * 某场考试每位考生的最新一次作答（一名考生至多一行）。
 * 采用派生表取 `MAX(attempt_no)`，避免相关子查询在数据量增大后退化为 N 次扫描。
 */
export async function listLatestByExam(examId: string): Promise<MonitorRecordRow[]> {
  return query<MonitorRecordRow[]>(
    `SELECT r.id, r.user_id, r.status, r.attempt_no, r.started_at, r.submitted_at, r.auto_submitted,
            r.score, r.resume_allowed, r.cheat_events, x.extra_minutes,
            u.name AS user_name, u.username AS username,
            COALESCE(d.name, du.name, '') AS department_name
       FROM exam_records r
       JOIN (
         SELECT user_id, MAX(attempt_no) AS mx
           FROM exam_records
          WHERE exam_id = ?
          GROUP BY user_id
       ) t ON t.user_id = r.user_id AND t.mx = r.attempt_no
       LEFT JOIN users u ON u.id = r.user_id
       LEFT JOIN departments d ON d.id = r.department_id
       LEFT JOIN departments du ON du.id = u.department_id
       LEFT JOIN exam_exceptions x ON x.exam_id = r.exam_id AND x.user_id = r.user_id
      WHERE r.exam_id = ?`,
    [examId, examId],
  );
}

/** 某场考试指定考生「进行中」的记录 id（强制交卷用）。 */
export async function findInProgressId(examId: string, userId: string): Promise<string | null> {
  const rows = await query<RowDataPacket[]>(
    `SELECT id FROM exam_records
      WHERE exam_id = ? AND user_id = ? AND status = 'in_progress'
      ORDER BY attempt_no DESC LIMIT 1`,
    [examId, userId],
  );
  return rows[0] ? String(rows[0].id) : null;
}
