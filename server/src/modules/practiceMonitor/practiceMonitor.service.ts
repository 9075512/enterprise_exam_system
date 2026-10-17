import type { RowDataPacket } from 'mysql2/promise';
import { query } from '../../db/pool.js';
import type { PracticeMonitorSummaryDto, PracticeSessionDto, PracticeSessionStatus } from '../../types/domain.js';
import { fromDbDateSafe } from '../../utils/datetime.js';

interface SessionRow extends RowDataPacket {
  id: string; user_id: string; user_name: string; department_name: string; bank_id: string | null; bank_name: string | null;
  mode: string; question_count: number; answered_count: number; correct_count: number; effective_status: PracticeSessionStatus;
  started_at: string; last_seen_at: string; ended_at: string | null;
}

const sessionColumns = `ps.id, ps.user_id, u.name AS user_name, COALESCE(d.name, '') AS department_name,
  ps.bank_id, COALESCE(b.name, '') AS bank_name, ps.mode, ps.question_count, ps.answered_count, ps.correct_count,
  CASE WHEN ps.status = 'active' AND ps.last_seen_at < DATE_SUB(UTC_TIMESTAMP(3), INTERVAL 90 SECOND)
       THEN 'offline' ELSE ps.status END AS effective_status,
  ps.started_at, ps.last_seen_at, ps.ended_at`;

function mapSession(row: SessionRow): PracticeSessionDto {
  return { id: row.id, userId: row.user_id, userName: row.user_name, departmentName: row.department_name,
    bankId: row.bank_id ?? '', bankName: row.bank_name ?? '', mode: row.mode, questionCount: Number(row.question_count),
    answeredCount: Number(row.answered_count), correctCount: Number(row.correct_count), status: row.effective_status,
    startedAt: fromDbDateSafe(row.started_at), lastSeenAt: fromDbDateSafe(row.last_seen_at),
    endedAt: row.ended_at ? fromDbDateSafe(row.ended_at) : null };
}

export async function overview(): Promise<PracticeMonitorSummaryDto> {
  const rows = await query<Array<RowDataPacket & { active_users: number; session_total: number; daily_active: number; answer_total: number; correct_total: number }>>(
    `SELECT COUNT(DISTINCT CASE WHEN status = 'active' AND last_seen_at >= DATE_SUB(UTC_TIMESTAMP(3), INTERVAL 90 SECOND) THEN user_id END) AS active_users,
      COUNT(*) AS session_total, COUNT(DISTINCT CASE WHEN started_at >= UTC_DATE() THEN user_id END) AS daily_active,
      COALESCE(SUM(answered_count), 0) AS answer_total, COALESCE(SUM(correct_count), 0) AS correct_total FROM practice_sessions`,
  );
  const wrong = await query<Array<RowDataPacket & { total: number; consolidating: number }>>(
    `SELECT COUNT(*) AS total, COALESCE(SUM(CASE WHEN correct_streak > 0 THEN 1 ELSE 0 END), 0) AS consolidating FROM practice_wrong_book`,
  );
  const row = rows[0]!; const answers = Number(row.answer_total ?? 0); const wrongTotal = Number(wrong[0]?.total ?? 0);
  return { activeUsers: Number(row.active_users ?? 0), sessionTotal: Number(row.session_total ?? 0), dailyActiveUsers: Number(row.daily_active ?? 0),
    answerTotal: answers, averageCorrectRate: answers ? Math.round(Number(row.correct_total ?? 0) / answers * 1000) / 10 : 0,
    wrongConsolidationRate: wrongTotal ? Math.round(Number(wrong[0]?.consolidating ?? 0) / wrongTotal * 1000) / 10 : 0,
    generatedAt: new Date().toISOString() };
}

export async function sessions(filter: { userId?: string; departmentId?: string; bankId?: string; status?: PracticeSessionStatus; startAt?: string; endAt?: string }): Promise<PracticeSessionDto[]> {
  const conditions: string[] = []; const params: string[] = [];
  if (filter.userId) { conditions.push('ps.user_id = ?'); params.push(filter.userId); }
  if (filter.departmentId) { conditions.push('u.department_id = ?'); params.push(filter.departmentId); }
  if (filter.bankId) { conditions.push('ps.bank_id = ?'); params.push(filter.bankId); }
  if (filter.startAt) { conditions.push('ps.started_at >= ?'); params.push(filter.startAt); }
  if (filter.endAt) { conditions.push('ps.started_at <= ?'); params.push(filter.endAt); }
  if (filter.status === 'offline') conditions.push(`ps.status = 'active' AND ps.last_seen_at < DATE_SUB(UTC_TIMESTAMP(3), INTERVAL 90 SECOND)`);
  else if (filter.status === 'active') conditions.push(`ps.status = 'active' AND ps.last_seen_at >= DATE_SUB(UTC_TIMESTAMP(3), INTERVAL 90 SECOND)`);
  else if (filter.status) { conditions.push('ps.status = ?'); params.push(filter.status); }
  const rows = await query<SessionRow[]>(`SELECT ${sessionColumns} FROM practice_sessions ps JOIN users u ON u.id = ps.user_id
    LEFT JOIN departments d ON d.id = u.department_id LEFT JOIN question_banks b ON b.id = ps.bank_id
    ${conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''} ORDER BY ps.started_at DESC LIMIT 1000`, params);
  return rows.map(mapSession);
}

export async function logs(filter: { sessionId?: string; userId?: string; departmentId?: string; bankId?: string; startAt?: string; endAt?: string }): Promise<Array<Record<string, unknown>>> {
  const conditions: string[] = []; const params: string[] = [];
  if (filter.sessionId) { conditions.push('a.session_id = ?'); params.push(filter.sessionId); }
  if (filter.userId) { conditions.push('s.user_id = ?'); params.push(filter.userId); }
  if (filter.departmentId) { conditions.push('u.department_id = ?'); params.push(filter.departmentId); }
  if (filter.bankId) { conditions.push('q.bank_id = ?'); params.push(filter.bankId); }
  if (filter.startAt) { conditions.push('a.answered_at >= ?'); params.push(filter.startAt); }
  if (filter.endAt) { conditions.push('a.answered_at <= ?'); params.push(filter.endAt); }
  const rows = await query<Array<RowDataPacket & { session_id: string; user_id: string; user_name: string; question_id: string; stem: string; bank_id: string; bank_name: string; answer: unknown; is_correct: number; answered_at: string }>>(
    `SELECT a.session_id, s.user_id, u.name AS user_name, a.question_id, q.stem, q.bank_id, b.name AS bank_name,
      a.answer, a.is_correct, a.answered_at FROM practice_session_answers a JOIN practice_sessions s ON s.id = a.session_id
      JOIN users u ON u.id = s.user_id JOIN questions q ON q.id = a.question_id JOIN question_banks b ON b.id = q.bank_id
      ${conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''} ORDER BY a.answered_at DESC LIMIT 5000`, params);
  return rows.map((r) => ({ sessionId: r.session_id, userId: r.user_id, userName: r.user_name, questionId: r.question_id,
    stem: r.stem, bankId: r.bank_id, bankName: r.bank_name, answer: typeof r.answer === 'string' ? JSON.parse(r.answer) : r.answer,
    correct: Boolean(r.is_correct), answeredAt: fromDbDateSafe(r.answered_at) }));
}
