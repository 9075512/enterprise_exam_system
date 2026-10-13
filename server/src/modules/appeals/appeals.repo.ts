/**
 * 成绩复核 —— 数据访问层（v1.7①）。
 * `score_appeals` 按 record_id 唯一：每条答卷至多一次复核申请。
 */
import type { RowDataPacket } from 'mysql2/promise';
import { query, runQuery, type SqlExecutor } from '../../db/pool.js';
import type { AppealStatus } from '../../types/domain.js';

/** 成绩复核原始行（含 JOIN 出的回显字段）。 */
export interface AppealRow extends RowDataPacket {
  id: string;
  record_id: string;
  exam_id: string;
  user_id: string;
  status: AppealStatus;
  reason: string;
  original_score: number | string;
  new_score: number | string | null;
  review_comment: string;
  applied_at: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
  exam_name: string;
  user_name: string;
  username: string;
  department_name: string | null;
}

const SELECT_SQL = `
  SELECT a.id, a.record_id, a.exam_id, a.user_id, a.status, a.reason, a.original_score, a.new_score,
         a.review_comment, a.applied_at, a.reviewed_by, a.reviewed_at, a.created_at,
         e.name AS exam_name, u.name AS user_name, u.username AS username, d.name AS department_name
    FROM score_appeals a
    JOIN exams e ON e.id = a.exam_id
    JOIN users u ON u.id = a.user_id
    LEFT JOIN departments d ON d.id = u.department_id`;

/** 新增复核申请。 */
export async function insert(
  row: {
    id: string;
    recordId: string;
    examId: string;
    userId: string;
    status: AppealStatus;
    reason: string;
    originalScore: number;
    appliedAt: string;
    createdAt: string;
  },
  exec?: SqlExecutor,
): Promise<void> {
  await runQuery(
    exec,
    `INSERT INTO score_appeals
       (id, record_id, exam_id, user_id, status, reason, original_score, applied_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [row.id, row.recordId, row.examId, row.userId, row.status, row.reason, row.originalScore, row.appliedAt, row.createdAt],
  );
}

/** 按 id 查询（含回显字段）。 */
export async function findById(id: string): Promise<AppealRow | null> {
  const rows = await query<AppealRow[]>(`${SELECT_SQL} WHERE a.id = ? LIMIT 1`, [id]);
  return rows[0] ?? null;
}

/** 按记录 id 查询（唯一键）。 */
export async function findByRecordId(recordId: string, exec?: SqlExecutor): Promise<AppealRow | null> {
  const rows = await runQuery<AppealRow[]>(exec, `${SELECT_SQL} WHERE a.record_id = ? LIMIT 1`, [recordId]);
  return rows[0] ?? null;
}

/** 复核通过：写新分数 + 复核意见 + 审批痕迹。 */
export async function updateApprove(
  id: string,
  data: { newScore: number; reviewComment: string; reviewedBy: string; reviewedAt: string },
  exec?: SqlExecutor,
): Promise<void> {
  await runQuery(
    exec,
    `UPDATE score_appeals SET status = 'approved', new_score = ?, review_comment = ?, reviewed_by = ?, reviewed_at = ? WHERE id = ?`,
    [data.newScore, data.reviewComment, data.reviewedBy, data.reviewedAt, id],
  );
}

/** 复核驳回。 */
export async function updateReject(
  id: string,
  data: { reviewComment: string; reviewedBy: string; reviewedAt: string },
  exec?: SqlExecutor,
): Promise<void> {
  await runQuery(
    exec,
    `UPDATE score_appeals SET status = 'rejected', review_comment = ?, reviewed_by = ?, reviewed_at = ? WHERE id = ?`,
    [data.reviewComment, data.reviewedBy, data.reviewedAt, id],
  );
}

/** 分页查询（可按状态过滤；admin 复核列表用）。 */
export async function list(
  filter: { status?: AppealStatus },
  paging: { pageSize: number; offset: number },
): Promise<AppealRow[]> {
  const conds: string[] = [];
  const params: Array<string | number> = [];
  if (filter.status) {
    conds.push('a.status = ?');
    params.push(filter.status);
  }
  const where = conds.length > 0 ? `WHERE ${conds.join(' AND ')}` : '';
  return query<AppealRow[]>(
    `${SELECT_SQL} ${where} ORDER BY a.applied_at DESC LIMIT ? OFFSET ?`,
    [...params, paging.pageSize, paging.offset],
  );
}

/** 统计（可按状态过滤）。 */
export async function count(filter: { status?: AppealStatus }): Promise<number> {
  const conds: string[] = [];
  const params: Array<string | number> = [];
  if (filter.status) {
    conds.push('status = ?');
    params.push(filter.status);
  }
  const where = conds.length > 0 ? `WHERE ${conds.join(' AND ')}` : '';
  const rows = await query<RowDataPacket[]>(`SELECT COUNT(*) AS c FROM score_appeals ${where}`, params);
  return Number(rows[0]?.c ?? 0);
}

/** 某考生的复核申请（分页）。 */
export async function listByUser(
  userId: string,
  paging: { pageSize: number; offset: number },
): Promise<AppealRow[]> {
  return query<AppealRow[]>(
    `${SELECT_SQL} WHERE a.user_id = ? ORDER BY a.applied_at DESC LIMIT ? OFFSET ?`,
    [userId, paging.pageSize, paging.offset],
  );
}

/** 某考生的复核申请数。 */
export async function countByUser(userId: string): Promise<number> {
  const rows = await query<RowDataPacket[]>(`SELECT COUNT(*) AS c FROM score_appeals WHERE user_id = ?`, [userId]);
  return Number(rows[0]?.c ?? 0);
}
