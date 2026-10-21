import type { PoolConnection, RowDataPacket } from 'mysql2/promise';
import { query, runQuery, withTransaction } from '../../db/pool.js';
import { conflict, notFound } from '../../utils/errors.js';
import { parseJsonColumn } from '../../utils/json.js';
import { fromDbDateSafe } from '../../utils/datetime.js';
import type { CourseInput, CourseProgressInput, courseProgressImportSchema } from './courses.schema.js';
import type { z } from 'zod';

interface ProgressRow extends RowDataPacket { user_id: string; course_id: string; lesson_id: string; position_seconds: number; duration_seconds: number; completed: number; revision: number; client_id: string; client_sequence: number; updated_at: string; selected_at: string | null }
function lessonDto(row: ProgressRow) {
  return { position: Number(row.position_seconds), duration: Number(row.duration_seconds), completed: !!row.completed, revision: Number(row.revision), clientId: row.client_id, sequence: Number(row.client_sequence), updatedAt: new Date(fromDbDateSafe(row.updated_at)).getTime() };
}
async function checkLesson(conn: PoolConnection, courseId: string, lessonId: string): Promise<void> {
  const courses = await runQuery<RowDataPacket[]>(conn, "SELECT content_json FROM courses WHERE id = ? AND deleted_at IS NULL AND status = 'published' FOR UPDATE", [courseId]);
  const content = courses[0] && parseJsonColumn<CourseInput>(courses[0].content_json, {} as CourseInput);
  if (!content?.chapters?.some(chapter => chapter.lessons.some(lesson => lesson.id === lessonId))) throw notFound('课程或小节不存在，或课程已下架');
}
export async function list(userId: string) {
  const rows = await query<(ProgressRow & { content_json: unknown })[]>(`SELECT p.*, c.content_json FROM course_progress p JOIN courses c ON c.id = p.course_id
    WHERE p.user_id = ? AND c.deleted_at IS NULL AND c.status = 'published' ORDER BY p.selected_at, p.updated_at, p.lesson_id`, [userId]);
  const courses: Record<string, { lastLessonId?: string; lessons: Record<string, ReturnType<typeof lessonDto>> }> = Object.create(null);
  const valid = new Map<string, Set<string>>();
  for (const row of rows) {
    if (!valid.has(row.course_id)) valid.set(row.course_id, new Set(parseJsonColumn<CourseInput>(row.content_json, {} as CourseInput).chapters?.flatMap(chapter => chapter.lessons.map(lesson => lesson.id)) ?? []));
    if (!valid.get(row.course_id)!.has(row.lesson_id)) continue;
    const course = courses[row.course_id] ??= { lessons: Object.create(null) }; course.lessons[row.lesson_id] = lessonDto(row);
    if (row.selected_at) course.lastLessonId = row.lesson_id;
  }
  return { version: 1 as const, courses };
}
export async function select(userId: string, courseId: string, lessonId: string): Promise<void> {
  await withTransaction(async conn => {
    await checkLesson(conn, courseId, lessonId);
    // Selection never resets a saved position or changes its write revision.
    await runQuery(conn, `INSERT INTO course_progress (user_id, course_id, lesson_id, selected_at, updated_at) VALUES (?, ?, ?, NOW(6), NOW(3))
      ON DUPLICATE KEY UPDATE selected_at = NOW(6)`, [userId, courseId, lessonId]);
  });
}
export async function save(userId: string, courseId: string, lessonId: string, input: CourseProgressInput) {
  return withTransaction(async conn => {
    await checkLesson(conn, courseId, lessonId);
    const rows = await runQuery<ProgressRow[]>(conn, 'SELECT * FROM course_progress WHERE user_id = ? AND course_id = ? AND lesson_id = ? FOR UPDATE', [userId, courseId, lessonId]);
    const current = rows[0];
    if (current?.client_id === input.clientId && input.sequence <= Number(current.client_sequence)) return lessonDto(current);
    if ((current ? Number(current.revision) : 0) !== input.revision && current?.client_id !== input.clientId) throw conflict('观看记录已在其他设备更新，请重新同步后继续');
    const revision = (current ? Number(current.revision) : 0) + 1;
    await runQuery(conn, `INSERT INTO course_progress (user_id, course_id, lesson_id, position_seconds, duration_seconds, completed, revision, client_id, client_sequence, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(3)) ON DUPLICATE KEY UPDATE position_seconds = VALUES(position_seconds), duration_seconds = VALUES(duration_seconds),
      completed = VALUES(completed), revision = VALUES(revision), client_id = VALUES(client_id), client_sequence = VALUES(client_sequence), updated_at = NOW(3)`,
    [userId, courseId, lessonId, input.position, input.duration, !!current?.completed || input.completed, revision, input.clientId, input.sequence]);
    const saved = await runQuery<ProgressRow[]>(conn, 'SELECT * FROM course_progress WHERE user_id = ? AND course_id = ? AND lesson_id = ?', [userId, courseId, lessonId]);
    return lessonDto(saved[0]);
  });
}
export async function importLegacy(userId: string, lessons: z.infer<typeof courseProgressImportSchema>['lessons']) {
  // Each course is validated independently; obsolete local lessons are skipped rather than resurrected.
  const ordered = [...lessons].sort((a, b) => a.courseId.localeCompare(b.courseId) || a.lessonId.localeCompare(b.lessonId));
  await withTransaction(async conn => {
    const existing = await runQuery<RowDataPacket[]>(conn, 'SELECT DISTINCT course_id FROM course_progress WHERE user_id = ?', [userId]);
    const existingCourses = new Set(existing.map(row => row.course_id));
    for (const item of ordered) {
      try { await checkLesson(conn, item.courseId, item.lessonId); } catch (error) { if ((error as { httpStatus?: number }).httpStatus === 404) continue; throw error; }
      await runQuery(conn, `INSERT IGNORE INTO course_progress (user_id, course_id, lesson_id, position_seconds, duration_seconds, completed, revision, selected_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, 1, ?, NOW(3))`, [userId, item.courseId, item.lessonId, item.position, item.duration, item.completed, item.selected && !existingCourses.has(item.courseId) ? new Date() : null]);
    }
  });
  return list(userId);
}
