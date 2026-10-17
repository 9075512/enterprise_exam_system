import type { ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { query } from '../../db/pool.js';
import type { QuestionFeedbackDto, QuestionFeedbackStatus, Role } from '../../types/domain.js';
import { fromDbDateSafe, nowDb } from '../../utils/datetime.js';
import { forbidden, notFound } from '../../utils/errors.js';
import { genId } from '../../utils/id.js';
import * as bankAuth from '../banks/bankAuth.js';
import * as auditService from '../audit/audit.service.js';

interface FeedbackRow extends RowDataPacket {
  id: string; question_id: string; user_id: string; user_name: string; source: 'exam' | 'practice';
  source_ref_id: string | null; category: string; content: string; status: QuestionFeedbackStatus;
  reply: string; handled_by: string | null; handled_at: string | null; created_at: string; updated_at: string;
  bank_id: string;
}

function dto(row: FeedbackRow): QuestionFeedbackDto {
  return { id: row.id, questionId: row.question_id, userId: row.user_id, userName: row.user_name,
    source: row.source, sourceRefId: row.source_ref_id, category: row.category, content: row.content,
    status: row.status, reply: row.reply, handledBy: row.handled_by,
    handledAt: row.handled_at ? fromDbDateSafe(row.handled_at) : null,
    createdAt: fromDbDateSafe(row.created_at), updatedAt: fromDbDateSafe(row.updated_at) };
}

async function find(id: string): Promise<FeedbackRow | null> {
  const rows = await query<FeedbackRow[]>(`SELECT f.*, u.name AS user_name, q.bank_id FROM question_feedback f
    JOIN users u ON u.id = f.user_id JOIN questions q ON q.id = f.question_id WHERE f.id = ? LIMIT 1`, [id]);
  return rows[0] ?? null;
}

export async function create(input: { questionId: string; source: 'exam' | 'practice'; sourceRefId?: string | null; category: string; content: string }, userId: string): Promise<QuestionFeedbackDto> {
  const q = await query<Array<RowDataPacket & { id: string }>>(`SELECT id FROM questions WHERE id = ? LIMIT 1`, [input.questionId]);
  if (!q[0]) throw notFound('试题不存在');
  if (input.source === 'practice') {
    const source = await query<RowDataPacket[]>(`SELECT psa.id FROM practice_session_answers psa
      JOIN practice_sessions ps ON ps.id = psa.session_id
      WHERE ps.id = ? AND ps.user_id = ? AND psa.question_id = ? LIMIT 1`, [input.sourceRefId ?? '', userId, input.questionId]);
    if (!source[0]) throw forbidden('只能反馈本人练题结果中的试题');
  } else {
    const source = await query<Array<RowDataPacket & { paper_snapshot: unknown }>>(`SELECT paper_snapshot FROM exam_records WHERE id = ? AND user_id = ?
      UNION ALL SELECT paper_snapshot FROM exam_records_archive WHERE id = ? AND user_id = ? LIMIT 1`, [input.sourceRefId ?? '', userId, input.sourceRefId ?? '', userId]);
    const snapshot = source[0]?.paper_snapshot;
    const parsed = typeof snapshot === 'string' ? JSON.parse(snapshot) as { questions?: Array<{ questionId: string }> } : snapshot as { questions?: Array<{ questionId: string }> } | undefined;
    if (!parsed?.questions?.some((item) => item.questionId === input.questionId)) throw forbidden('只能反馈本人考试成绩中的试题');
  }
  const id = genId('qfb-'); const now = nowDb();
  await query<ResultSetHeader>(`INSERT INTO question_feedback
    (id, question_id, user_id, source, source_ref_id, category, content, status, reply, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', '', ?, ?)`,
    [id, input.questionId, userId, input.source, input.sourceRefId ?? null, input.category.trim(), input.content.trim(), now, now]);
  return dto((await find(id))!);
}

export async function list(filter: { status?: QuestionFeedbackStatus; mine?: boolean }, user: { id: string; role: Role }): Promise<QuestionFeedbackDto[]> {
  const conditions: string[] = []; const params: string[] = [];
  if (filter.status) { conditions.push('f.status = ?'); params.push(filter.status); }
  if (user.role === 'examinee' || filter.mine) { conditions.push('f.user_id = ?'); params.push(user.id); }
  const rows = await query<FeedbackRow[]>(`SELECT f.*, u.name AS user_name, q.bank_id FROM question_feedback f
    JOIN users u ON u.id = f.user_id JOIN questions q ON q.id = f.question_id
    ${conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''} ORDER BY f.created_at DESC`, params);
  if (user.role !== 'author') return rows.map(dto);
  const allowed: FeedbackRow[] = [];
  for (const row of rows) {
    try { await bankAuth.assertBankAccess(row.bank_id, user); allowed.push(row); } catch { /* 无题库权限不泄露 */ }
  }
  return allowed.map(dto);
}

export async function update(id: string, input: { status: QuestionFeedbackStatus; reply?: string }, user: { id: string; role: Role }): Promise<QuestionFeedbackDto> {
  const current = await find(id);
  if (!current) throw notFound('反馈不存在');
  if (user.role === 'examinee') throw forbidden('无权处理题目反馈');
  await bankAuth.assertBankAccess(current.bank_id, user);
  const now = nowDb();
  await query<ResultSetHeader>(`UPDATE question_feedback SET status = ?, reply = ?, handled_by = ?, handled_at = ?, updated_at = ? WHERE id = ?`,
    [input.status, input.reply?.trim() ?? current.reply, user.id, now, now, id]);
  await auditService.record({ actorId: user.id, action: 'question-feedback.update', targetType: 'question_feedback', targetId: id,
    detail: { fromStatus: current.status, toStatus: input.status, replied: input.reply !== undefined } });
  return dto((await find(id))!);
}
