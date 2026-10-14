/**
 * 系统维护 —— 数据访问层（v1.7④ T5）。
 *
 * 职责：核心表行数统计、历史成绩归档（复制入归档表后自业务表移除）。
 * 归档表 `exam_records_archive` **无外键**，可长期独立保留。
 */
import type { RowDataPacket } from 'mysql2/promise';
import { query, runQuery, type SqlExecutor } from '../../db/pool.js';

/** 统计某表行数（表名来自代码内固定白名单，不接受外部输入）。 */
export async function countTable(table: string): Promise<number> {
  const rows = await query<RowDataPacket[]>(`SELECT COUNT(*) AS c FROM \`${table}\``);
  return Number(rows[0]?.c ?? 0);
}

/** 归档表当前行数。 */
export async function countArchive(): Promise<number> {
  return countTable('exam_records_archive');
}

/**
 * 待归档记录 id：**已出成绩**（status='submitted'）、考试结束早于 cutoff、且不存在成绩复核申请。
 * - 待阅卷（pending_review）记录不参与归档：阅卷完成后可由后续归档批次处理；
 * - 有复核申请的记录必须留在业务表（`score_appeals.record_id` 外键约束 + 合规留痕）。
 */
export async function listArchivableIds(cutoff: string, limit: number): Promise<string[]> {
  const rows = await query<RowDataPacket[]>(
    `SELECT r.id
       FROM exam_records r
       JOIN exams e ON e.id = r.exam_id
      WHERE r.status = 'submitted'
        AND e.end_time < ?
        AND NOT EXISTS (SELECT 1 FROM score_appeals a WHERE a.record_id = r.id)
      ORDER BY r.submitted_at ASC
      LIMIT ?`,
    [cutoff, limit],
  );
  return rows.map((r) => String(r.id));
}

/** 因存在成绩复核申请而被跳过的记录数（同一时间窗口径）。 */
export async function countSkippedByAppeal(cutoff: string): Promise<number> {
  const rows = await query<RowDataPacket[]>(
    `SELECT COUNT(*) AS c
       FROM exam_records r
       JOIN exams e ON e.id = r.exam_id
      WHERE r.status = 'submitted'
        AND e.end_time < ?
        AND EXISTS (SELECT 1 FROM score_appeals a WHERE a.record_id = r.id)`,
    [cutoff],
  );
  return Number(rows[0]?.c ?? 0);
}

/** 把指定记录整行复制进归档表（原 id 保持不变）。 */
export async function insertArchive(ids: string[], archivedAt: string, exec?: SqlExecutor): Promise<void> {
  if (ids.length === 0) return;
  const placeholders = ids.map(() => '?').join(', ');
  await runQuery(
    exec,
    `INSERT INTO exam_records_archive
       (id, exam_id, user_id, attempt_no, department_id, paper_snapshot, status, answers,
        started_at, submitted_at, auto_submitted, score, subjective_scores, cheat_events, review_notes, archived_at)
     SELECT r.id, r.exam_id, r.user_id, r.attempt_no, r.department_id, r.paper_snapshot, r.status, r.answers,
            r.started_at, r.submitted_at, r.auto_submitted, r.score, r.subjective_scores, r.cheat_events, r.review_notes, ?
       FROM exam_records r
      WHERE r.id IN (${placeholders})`,
    [archivedAt, ...ids],
  );
}

/** 自业务表移除已归档记录。 */
export async function deleteRecords(ids: string[], exec?: SqlExecutor): Promise<void> {
  if (ids.length === 0) return;
  const placeholders = ids.map(() => '?').join(', ');
  await runQuery(exec, `DELETE FROM exam_records WHERE id IN (${placeholders})`, ids);
}
