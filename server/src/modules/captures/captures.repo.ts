import type { RowDataPacket } from 'mysql2/promise';
import { runQuery, type SqlExecutor } from '../../db/pool.js';
import type { CaptureConfig } from '../../types/domain.js';

export interface CaptureRow extends RowDataPacket {
  id: string; record_id: string; capture_id: string; kind: string; storage_key: string;
  size: number; received_at: string; expires_at: string; deleted_at: string | null;
  removed_at: string | null; removed_by: string | null; removed_by_name: string | null;
}
export async function session(id: string, exec?: SqlExecutor) {
  const rows = await runQuery<RowDataPacket[]>(exec, 'SELECT * FROM exam_capture_sessions WHERE record_id = ?', [id]);
  return rows[0];
}
export async function createSession(record: { id: string; examId: string; userId: string; attemptNo: number }, config: CaptureConfig, exec: SqlExecutor) {
  await runQuery(exec, 'INSERT INTO exam_capture_sessions (record_id, exam_id, user_id, attempt_no, config) VALUES (?, ?, ?, ?, ?)',
    [record.id, record.examId, record.userId, record.attemptNo, JSON.stringify(config)]);
}
export async function findRetry(recordId: string, captureId: string, exec?: SqlExecutor) {
  const rows = await runQuery<CaptureRow[]>(exec, 'SELECT * FROM exam_captures WHERE record_id = ? AND capture_id = ?', [recordId, captureId]);
  return rows[0];
}
export async function insert(row: { id: string; recordId: string; captureId: string; kind: string; storageKey: string; size: number; receivedAt: string; expiresAt: string }, exec: SqlExecutor) {
  await runQuery(exec, `INSERT INTO exam_captures (id, record_id, capture_id, kind, storage_key, size, received_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [row.id, row.recordId, row.captureId, row.kind, row.storageKey, row.size, row.receivedAt, row.expiresAt]);
}
export async function page(recordId: string, page: number, pageSize: number) {
  const counts = await runQuery<RowDataPacket[]>(undefined, 'SELECT COUNT(*) AS total FROM exam_captures WHERE record_id = ?', [recordId]);
  const rows = await runQuery<CaptureRow[]>(undefined, 'SELECT * FROM exam_captures WHERE record_id = ? ORDER BY received_at DESC, id DESC LIMIT ? OFFSET ?', [recordId, pageSize, (page - 1) * pageSize]);
  return { rows, total: Number(counts[0].total) };
}
export async function image(id: string, recordId: string) {
  const rows = await runQuery<CaptureRow[]>(undefined, 'SELECT * FROM exam_captures WHERE id = ? AND record_id = ?', [id, recordId]);
  return rows[0];
}
export async function addEvent(recordId: string, event: { eventId: string; status: string; reason: string }, exec: SqlExecutor) {
  // Replayed events must not roll the current camera status backwards.
  const existing = await runQuery<RowDataPacket[]>(exec, 'SELECT id FROM exam_camera_events WHERE record_id = ? AND event_id = ?', [recordId, event.eventId]);
  if (existing.length) return;
  await runQuery(exec, 'INSERT INTO exam_camera_events (id, record_id, event_id, status, reason, received_at) VALUES (UUID(), ?, ?, ?, ?, UTC_TIMESTAMP(3))', [recordId, event.eventId, event.status, event.reason]);
  await runQuery(exec, 'UPDATE exam_capture_sessions SET camera_status = ?, status_at = UTC_TIMESTAMP(3) WHERE record_id = ?', [event.status, recordId]);
}
export async function summaries(examId: string) {
  return runQuery<RowDataPacket[]>(undefined, `SELECT s.record_id, s.config, s.camera_status, s.status_at,
    COUNT(c.id) AS capture_count, MAX(c.received_at) AS last_capture_at
    FROM exam_capture_sessions s LEFT JOIN exam_captures c ON c.record_id = s.record_id
    WHERE s.exam_id = ? GROUP BY s.record_id`, [examId]);
}
export async function events(recordId: string, page: number, pageSize: number) {
  const counts = await runQuery<RowDataPacket[]>(undefined, 'SELECT COUNT(*) AS total FROM exam_camera_events WHERE record_id = ?', [recordId]);
  const rows = await runQuery<RowDataPacket[]>(undefined, 'SELECT status, reason, received_at FROM exam_camera_events WHERE record_id = ? ORDER BY received_at DESC, id DESC LIMIT ? OFFSET ?', [recordId, pageSize, (page - 1) * pageSize]);
  return { rows, total: Number(counts[0].total) };
}
export async function expired() {
  return runQuery<CaptureRow[]>(undefined, 'SELECT * FROM exam_captures WHERE deleted_at IS NULL AND (removed_at IS NOT NULL OR expires_at <= UTC_TIMESTAMP(3)) ORDER BY expires_at LIMIT 200');
}
export async function lockPhotos(recordId: string, ids: string[], exec: SqlExecutor) {
  return runQuery<CaptureRow[]>(exec, `SELECT * FROM exam_captures WHERE record_id = ? AND id IN (${ids.map(() => '?').join(',')}) ORDER BY id FOR UPDATE`, [recordId, ...ids]);
}
export async function removePhoto(id: string, actorId: string, actorName: string, exec: SqlExecutor) {
  await runQuery(exec, 'UPDATE exam_captures SET removed_at = UTC_TIMESTAMP(3), removed_by = ?, removed_by_name = ? WHERE id = ? AND removed_at IS NULL', [actorId, actorName, id]);
}
export async function markDeleted(id: string) {
  await runQuery(undefined, 'UPDATE exam_captures SET deleted_at = UTC_TIMESTAMP(3) WHERE id = ?', [id]);
}
