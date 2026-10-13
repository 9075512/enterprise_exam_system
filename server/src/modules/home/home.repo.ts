/**
 * 考试端首页聚合 —— 数据访问层（v2.0②，v2.0⑥ 增科室配置）。
 *
 * 只读考试域表（exam_records ∪ exam_records_archive 派生源 + exams），
 * 供 `home.service.getSummary` 一次性算出统计 / 趋势，避免前端多次并发拉取后再本地汇总；
 * v2.0⑥ 增 `home_dept_configs` 读写（考生首页个性化配置）。
 */
import type { ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { query } from '../../db/pool.js';
import { RECORD_SOURCE } from '../../db/recordSource.js';

/** 已交卷成绩聚合行。 */
export interface HomeScoreAggRow extends RowDataPacket {
  submitted: number | string | null;
  passed: number | string | null;
  avg_score: number | string | null;
}

/** 最近成绩行（含考试名与及格线）。 */
export interface HomeTrendRow extends RowDataPacket {
  id: string;
  exam_id: string;
  exam_name: string | null;
  score: number | string | null;
  pass_score: number | string | null;
  submitted_at: string | null;
}

/**
 * 某考生已交卷成绩聚合（已交卷次数 / 及格次数 / 平均分）。
 * 口径与考生「我的成绩」一致：仅统计 status = 'submitted'（已出成绩）。
 */
export async function aggregateSubmitted(userId: string): Promise<HomeScoreAggRow> {
  const rows = await query<HomeScoreAggRow[]>(
    `SELECT COUNT(*) AS submitted,
            SUM(CASE WHEN r.score >= COALESCE(e.pass_score, 0) THEN 1 ELSE 0 END) AS passed,
            AVG(r.score) AS avg_score
       FROM ${RECORD_SOURCE}
       LEFT JOIN exams e ON e.id = r.exam_id
      WHERE r.user_id = ? AND r.status = 'submitted'`,
    [userId],
  );
  return rows[0] ?? ({ submitted: 0, passed: 0, avg_score: null } as HomeScoreAggRow);
}

/** 最近 N 条已交卷成绩（按交卷时间倒序）。 */
export async function listRecentScores(userId: string, limit: number): Promise<HomeTrendRow[]> {
  return query<HomeTrendRow[]>(
    `SELECT r.id, r.exam_id, e.name AS exam_name, r.score, e.pass_score, r.submitted_at
       FROM ${RECORD_SOURCE}
       LEFT JOIN exams e ON e.id = r.exam_id
      WHERE r.user_id = ? AND r.status = 'submitted'
      ORDER BY r.submitted_at DESC
      LIMIT ?`,
    [userId, limit],
  );
}

/* ============================================================
 * v2.0⑥ 考生首页个性化配置（home_dept_configs）
 * ============================================================ */

/** `home_dept_configs` 表原始行。 */
export interface HomeDeptConfigRow extends RowDataPacket {
  department_id: string;
  /** JSON 字符串：[{ key, enabled, text? }] */
  shortcuts: string | unknown;
  /** JSON 字符串：题库 id 数组 */
  recommended_banks: string | unknown;
  updated_by: string | null;
  updated_at: string | null;
}

/** 取某科室（或全局默认行）的配置；不存在返回 null。 */
export async function getDeptConfig(departmentId: string): Promise<HomeDeptConfigRow | null> {
  const rows = await query<HomeDeptConfigRow[]>(
    `SELECT department_id, shortcuts, recommended_banks, updated_by, updated_at
       FROM home_dept_configs WHERE department_id = ?`,
    [departmentId],
  );
  return rows[0] ?? null;
}

/** 列出全部已配置行（含全局默认行），按更新时间倒序。 */
export async function listDeptConfigs(): Promise<HomeDeptConfigRow[]> {
  return query<HomeDeptConfigRow[]>(
    `SELECT department_id, shortcuts, recommended_banks, updated_by, updated_at
       FROM home_dept_configs ORDER BY updated_at DESC`,
  );
}

/** 新增或覆盖某科室配置（department_id 为主键 → ON DUPLICATE KEY UPDATE）。 */
export async function upsertDeptConfig(
  departmentId: string,
  shortcuts: unknown,
  recommendedBankIds: string[],
  updatedBy: string,
  now: string,
): Promise<void> {
  await query<ResultSetHeader>(
    `INSERT INTO home_dept_configs (department_id, shortcuts, recommended_banks, updated_by, updated_at)
     VALUES (?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE shortcuts = VALUES(shortcuts),
                             recommended_banks = VALUES(recommended_banks),
                             updated_by = VALUES(updated_by),
                             updated_at = VALUES(updated_at)`,
    [departmentId, JSON.stringify(shortcuts), JSON.stringify(recommendedBankIds), updatedBy, now],
  );
}

/** 删除某科室配置（回到全局默认）；返回是否命中。 */
export async function deleteDeptConfig(departmentId: string): Promise<number> {
  const res = await query<ResultSetHeader>(`DELETE FROM home_dept_configs WHERE department_id = ?`, [departmentId]);
  return Number(res.affectedRows ?? 0);
}

/** 批量取用户名（配置页展示「最后修改人」）。 */
export async function listUserNames(ids: string[]): Promise<Array<{ id: string; name: string }>> {
  const unique = [...new Set(ids.filter((v) => v !== ''))];
  if (unique.length === 0) return [];
  const placeholders = unique.map(() => '?').join(',');
  const rows = await query<RowDataPacket[]>(
    `SELECT id, name FROM users WHERE id IN (${placeholders})`,
    unique,
  );
  return rows.map((r) => ({ id: String(r.id), name: String(r.name) }));
}
