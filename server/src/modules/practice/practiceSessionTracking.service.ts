import type { ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { query, runQuery, type SqlExecutor } from '../../db/pool.js';
import { nowDb } from '../../utils/datetime.js';
import { forbidden, notFound } from '../../utils/errors.js';
import { genId } from '../../utils/id.js';

export async function start(userId: string, bankId: string | null, mode: string, questionCount: number): Promise<string> {
  const id = genId('ps-'); const now = nowDb();
  await query<ResultSetHeader>(`INSERT INTO practice_sessions
    (id, user_id, bank_id, mode, question_count, answered_count, correct_count, status, started_at, last_seen_at)
    VALUES (?, ?, ?, ?, ?, 0, 0, 'active', ?, ?)`, [id, userId, bankId || null, mode, questionCount, now, now]);
  return id;
}

export async function touch(id: string, userId: string): Promise<void> {
  const result = await query<ResultSetHeader>(`UPDATE practice_sessions SET last_seen_at = ? WHERE id = ? AND user_id = ? AND status = 'active'`, [nowDb(), id, userId]);
  if (!result.affectedRows) {
    const rows = await query<Array<RowDataPacket & { user_id: string }>>(`SELECT user_id FROM practice_sessions WHERE id = ?`, [id]);
    if (!rows[0]) throw notFound('练题会话不存在');
    if (rows[0].user_id !== userId) throw forbidden('无权操作该练题会话');
  }
}

export async function answer(id: string | undefined, userId: string, questionId: string, submittedAnswer: number[], correct: boolean, exec?: SqlExecutor): Promise<void> {
  if (!id) return;
  const now = nowDb();
  const inserted = await runQuery<ResultSetHeader>(exec, `INSERT IGNORE INTO practice_session_answers
    (session_id, question_id, answer, is_correct, answered_at)
    SELECT id, ?, ?, ?, ? FROM practice_sessions WHERE id = ? AND user_id = ? AND status = 'active'`,
    [questionId, JSON.stringify(submittedAnswer), correct ? 1 : 0, now, id, userId]);
  if (inserted.affectedRows) {
    await runQuery<ResultSetHeader>(exec, `UPDATE practice_sessions SET answered_count = answered_count + 1,
      correct_count = correct_count + ?, last_seen_at = ? WHERE id = ?`, [correct ? 1 : 0, now, id]);
  } else {
    await runQuery<ResultSetHeader>(exec, `UPDATE practice_sessions SET last_seen_at = ? WHERE id = ? AND user_id = ? AND status = 'active'`, [now, id, userId]);
  }
}

export async function finish(id: string, userId: string, status: 'completed' | 'exited'): Promise<void> {
  const now = nowDb();
  const result = await query<ResultSetHeader>(`UPDATE practice_sessions SET status = ?, last_seen_at = ?, ended_at = ?
    WHERE id = ? AND user_id = ? AND status = 'active'`, [status, now, now, id, userId]);
  if (!result.affectedRows) {
    const rows = await query<Array<RowDataPacket & { user_id: string }>>(`SELECT user_id FROM practice_sessions WHERE id = ?`, [id]);
    if (!rows[0]) throw notFound('练题会话不存在');
    if (rows[0].user_id !== userId) throw forbidden('无权操作该练题会话');
  }
}
