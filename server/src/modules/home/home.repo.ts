/**
 * 考试端首页聚合 —— 数据访问层。
 *
 * 只读考试域表（exam_records ∪ exam_records_archive 派生源 + exams），
 * 供 `home.service.getSummary` 一次性算出统计 / 趋势，避免前端多次并发拉取后再本地汇总；
 */
import type { RowDataPacket } from 'mysql2/promise';
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
