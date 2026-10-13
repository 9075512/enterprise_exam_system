/**
 * 补考 —— 数据访问层。
 * `exam_retakes` 按 (exam_id, user_id) 唯一：一名考生对一场考试至多一条补考申请。
 */
import type { RowDataPacket } from 'mysql2/promise';
import { query, runQuery, type SqlExecutor } from '../../db/pool.js';
import type { RetakeStatus } from '../../types/domain.js';

/** 补考申请原始行（含 JOIN 出的回显字段）。 */
export interface RetakeRow extends RowDataPacket {
  id: string;
  exam_id: string;
  user_id: string;
  status: RetakeStatus;
  reason: string;
  applied_at: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
  exam_name: string;
  user_name: string;
  username: string;
  department_name: string | null;
}

const RETAKES_SELECT = `
  SELECT r.id, r.exam_id, r.user_id, r.status, r.reason, r.applied_at,
         r.reviewed_by, r.reviewed_at, r.created_at,
         e.name AS exam_name, u.name AS user_name, u.username AS username,
         d.name AS department_name
    FROM exam_retakes r
    JOIN exams e ON e.id = r.exam_id
    JOIN users u ON u.id = r.user_id
    LEFT JOIN departments d ON d.id = u.department_id`;

/** 新增补考申请。 */
export async function insert(
  row: {
    id: string;
    examId: string;
    userId: string;
    status: RetakeStatus;
    reason: string;
    appliedAt: string;
    createdAt: string;
  },
  exec?: SqlExecutor,
): Promise<void> {
  await runQuery(
    exec,
    `INSERT INTO exam_retakes (id, exam_id, user_id, status, reason, applied_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [row.id, row.examId, row.userId, row.status, row.reason, row.appliedAt, row.createdAt],
  );
}

/** 按 id 查询（含回显字段）。 */
export async function findById(id: string): Promise<RetakeRow | null> {
  const rows = await query<RetakeRow[]>(`${RETAKES_SELECT} WHERE r.id = ? LIMIT 1`, [id]);
  return rows[0] ?? null;
}

/** 按 考试×考生 查询（唯一键）。 */
export async function findByExamAndUser(examId: string, userId: string): Promise<RetakeRow | null> {
  const rows = await query<RetakeRow[]>(
    `${RETAKES_SELECT} WHERE r.exam_id = ? AND r.user_id = ? LIMIT 1`,
    [examId, userId],
  );
  return rows[0] ?? null;
}

/** 是否存在该考试×考生的「待审批/已通过」申请。 */
export async function hasActiveByExamAndUser(examId: string, userId: string): Promise<boolean> {
  const rows = await query<RowDataPacket[]>(
    `SELECT COUNT(*) AS c FROM exam_retakes
      WHERE exam_id = ? AND user_id = ? AND status IN ('pending','approved')`,
    [examId, userId],
  );
  return Number(rows[0]?.c ?? 0) > 0;
}

/** 是否存在该考试×考生的「已通过」申请（决定是否多授一次答题机会）。 */
export async function hasApprovedByExamAndUser(examId: string, userId: string): Promise<boolean> {
  const rows = await query<RowDataPacket[]>(
    `SELECT COUNT(*) AS c FROM exam_retakes WHERE exam_id = ? AND user_id = ? AND status = 'approved'`,
    [examId, userId],
  );
  return Number(rows[0]?.c ?? 0) > 0;
}

/** 更新审批状态（approve/reject）。 */
export async function updateStatus(
  id: string,
  status: RetakeStatus,
  reviewedBy: string | null,
  reviewedAt: string | null,
  reason: string,
): Promise<void> {
  await runQuery(
    undefined,
    `UPDATE exam_retakes SET status = ?, reviewed_by = ?, reviewed_at = ?, reason = ? WHERE id = ?`,
    [status, reviewedBy, reviewedAt, reason, id],
  );
}

/** 被拒后重新申请：重置为 pending，清空审批痕迹。 */
export async function reapply(id: string, reason: string, appliedAt: string): Promise<void> {
  await runQuery(
    undefined,
    `UPDATE exam_retakes SET status = 'pending', reason = ?, reviewed_by = NULL, reviewed_at = NULL, applied_at = ? WHERE id = ?`,
    [reason, appliedAt, id],
  );
}

/** 分页查询（可按状态过滤；admin 审批列表用）。 */
export async function list(
  filter: { status?: RetakeStatus },
  paging: { pageSize: number; offset: number },
): Promise<RetakeRow[]> {
  const conds: string[] = [];
  const params: Array<string | number | boolean | Date | null> = [];
  if (filter.status) {
    conds.push('r.status = ?');
    params.push(filter.status);
  }
  const where = conds.length > 0 ? `WHERE ${conds.join(' AND ')}` : '';
  return query<RetakeRow[]>(
    `${RETAKES_SELECT} ${where} ORDER BY r.applied_at DESC LIMIT ? OFFSET ?`,
    [...params, paging.pageSize, paging.offset],
  );
}

/** 统计（可按状态过滤）。 */
export async function count(filter: { status?: RetakeStatus }): Promise<number> {
  const conds: string[] = [];
  const params: Array<string | number | boolean | Date | null> = [];
  if (filter.status) {
    conds.push('status = ?');
    params.push(filter.status);
  }
  const where = conds.length > 0 ? `WHERE ${conds.join(' AND ')}` : '';
  const rows = await query<RowDataPacket[]>(`SELECT COUNT(*) AS c FROM exam_retakes ${where}`, params);
  return Number(rows[0]?.c ?? 0);
}

/** 分页查询某考生的申请。 */
export async function listByUser(
  userId: string,
  paging: { pageSize: number; offset: number },
): Promise<RetakeRow[]> {
  return query<RetakeRow[]>(
    `${RETAKES_SELECT} WHERE r.user_id = ? ORDER BY r.applied_at DESC LIMIT ? OFFSET ?`,
    [userId, paging.pageSize, paging.offset],
  );
}

/** 某考生全部申请的「考试→状态」映射（exam list 补考按钮回显用）。 */
export async function listExamStatusByUser(
  userId: string,
): Promise<Array<{ exam_id: string; status: RetakeStatus }>> {
  const rows = await query<Array<RowDataPacket & { exam_id: string; status: RetakeStatus }>>(
    `SELECT exam_id, status FROM exam_retakes WHERE user_id = ?`,
    [userId],
  );
  return rows.map((r) => ({ exam_id: r.exam_id, status: r.status }));
}

/** 统计某考生申请数。 */
export async function countByUser(userId: string): Promise<number> {
  const rows = await query<RowDataPacket[]>(
    `SELECT COUNT(*) AS c FROM exam_retakes WHERE user_id = ?`,
    [userId],
  );
  return Number(rows[0]?.c ?? 0);
}
