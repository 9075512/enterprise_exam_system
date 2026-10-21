import type { ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { query, withTransaction, runQuery } from '../../db/pool.js';
import { badRequest, conflict, notFound } from '../../utils/errors.js';
import { genId } from '../../utils/id.js';
import { fromDbDateSafe } from '../../utils/datetime.js';
import { parseJsonColumn } from '../../utils/json.js';
import * as audit from '../audit/audit.service.js';
import type { CourseInput, CourseListQuery, ManagedCourse } from './courses.schema.js';
import { lockCatalog, resolveCategory } from './courseCategories.service.js';

interface CourseRow extends RowDataPacket { id: string; status: ManagedCourse['status']; revision: number; content_json: unknown; created_at: string; updated_at: string }
function dto(row: CourseRow): ManagedCourse {
  return { ...parseJsonColumn<CourseInput>(row.content_json, {} as CourseInput), id: row.id, status: row.status, revision: Number(row.revision), createdAt: fromDbDateSafe(row.created_at), updatedAt: fromDbDateSafe(row.updated_at) };
}
function assertPublishable(course: CourseInput): void {
  if (!course.cover || !course.description || !course.category || !course.instructor) throw badRequest('上架前请完善封面、简介、分类和讲师');
  if (!course.chapters.length || course.chapters.some(chapter => !chapter.lessons.length)) throw badRequest('上架前每个章节至少需要一个小节');
  if (course.chapters.some(chapter => chapter.lessons.some(lesson => !lesson.src))) throw badRequest('上架前请为所有小节配置视频');
}
export async function find(id: string, manage = false): Promise<ManagedCourse> {
  const rows = await query<CourseRow[]>(`SELECT * FROM courses WHERE id = ? AND deleted_at IS NULL${manage ? '' : " AND status = 'published'"}`, [id]);
  if (!rows[0]) throw notFound('课程不存在或已下架');
  return dto(rows[0]);
}
export async function learnerList(): Promise<ManagedCourse[]> {
  const rows = await query<CourseRow[]>("SELECT * FROM courses WHERE deleted_at IS NULL AND status = 'published' ORDER BY sort_order, created_at DESC, id");
  return rows.map(dto);
}
export async function list(input: CourseListQuery) {
  const where = ['deleted_at IS NULL'];
  const params: (string | number)[] = [];
  if (input.q) { where.push("(title LIKE ? ESCAPE '!' OR JSON_UNQUOTE(JSON_EXTRACT(content_json, '$.category')) LIKE ? ESCAPE '!')"); const term = `%${input.q.replace(/[!%_]/g, char => `!${char}`)}%`; params.push(term, term); }
  if (input.status) { where.push('status = ?'); params.push(input.status); }
  const clause = where.join(' AND ');
  const counts = await query<RowDataPacket[]>(`SELECT COUNT(*) AS total FROM courses WHERE ${clause}`, params);
  const total = Number(counts[0].total);
  const page = Math.min(input.page, Math.max(1, Math.ceil(total / input.pageSize)));
  const rows = await query<CourseRow[]>(`SELECT * FROM courses WHERE ${clause} ORDER BY sort_order, created_at DESC, id LIMIT ? OFFSET ?`, [...params, input.pageSize, (page - 1) * input.pageSize]);
  const stats = await query<RowDataPacket[]>('SELECT status, COUNT(*) AS total FROM courses WHERE deleted_at IS NULL GROUP BY status');
  return { list: rows.map(dto), total, page, pageSize: input.pageSize, stats: { draft: 0, published: 0, archived: 0, ...Object.fromEntries(stats.map(row => [row.status, Number(row.total)])) } };
}
export async function create(input: CourseInput, actorId: string): Promise<ManagedCourse> {
  const id = genId('course-');
  await withTransaction(async conn => {
    await lockCatalog(conn); const course = await resolveCategory(input, conn);
    await runQuery(conn, "INSERT INTO courses (id, title, status, sort_order, content_json, revision, created_by, updated_by, created_at, updated_at) VALUES (?, ?, 'draft', ?, ?, 1, ?, ?, NOW(3), NOW(3))", [id, course.title, course.sortOrder, JSON.stringify(course), actorId, actorId]);
  });
  await audit.record({ actorId, action: 'course.create', targetType: 'course', targetId: id, targetName: input.title });
  return find(id, true);
}
export async function update(id: string, revision: number, input: CourseInput, actorId: string): Promise<ManagedCourse> {
  const result = await withTransaction(async conn => {
    await lockCatalog(conn); input = await resolveCategory(input, conn);
    const rows = await runQuery<CourseRow[]>(conn, 'SELECT * FROM courses WHERE id = ? AND deleted_at IS NULL FOR UPDATE', [id]);
    if (!rows[0]) throw notFound('课程不存在或已删除');
    const current = dto(rows[0]);
    if (current.revision !== revision) throw conflict('课程已被其他管理员修改，请保留当前内容并重新加载后编辑');
    if (current.status === 'published') throw conflict('请先下架课程，再编辑内容');
    // 更换视频即新学习内容，避免沿用旧视频的完成标记和播放位置。
    const oldSources = new Map(current.chapters.flatMap(chapter => chapter.lessons.map(lesson => [lesson.id, lesson.src] as const)));
    const course: CourseInput = { ...input, chapters: input.chapters.map(chapter => ({ ...chapter, lessons: chapter.lessons.map(lesson => oldSources.has(lesson.id) && oldSources.get(lesson.id) !== lesson.src ? { ...lesson, id: genId('lesson-') } : lesson) })) };
    await runQuery(conn, 'UPDATE courses SET title = ?, sort_order = ?, content_json = ?, revision = revision + 1, updated_by = ?, updated_at = NOW(3) WHERE id = ?', [course.title, course.sortOrder, JSON.stringify(course), actorId, id]);
    return { ...current, ...course, revision: current.revision + 1 };
  });
  await audit.record({ actorId, action: 'course.update', targetType: 'course', targetId: id, targetName: result.title });
  return find(id, true);
}
export async function setStatus(id: string, revision: number, status: ManagedCourse['status'], actorId: string): Promise<ManagedCourse> {
  const result = await withTransaction(async conn => {
    await lockCatalog(conn);
    const rows = await runQuery<CourseRow[]>(conn, 'SELECT * FROM courses WHERE id = ? AND deleted_at IS NULL FOR UPDATE', [id]);
    if (!rows[0]) throw notFound('课程不存在或已删除');
    const current = dto(rows[0]);
    if (current.revision !== revision) throw conflict('课程已变化，请刷新后重试');
    if (status === 'draft') throw badRequest('已保存课程仅支持上架或下架');
    if (status === 'published') { await resolveCategory(current, conn); assertPublishable(current); }
    await runQuery(conn, 'UPDATE courses SET status = ?, revision = revision + 1, updated_by = ?, updated_at = NOW(3) WHERE id = ?', [status, actorId, id]);
    return current;
  });
  await audit.record({ actorId, action: 'course.status', targetType: 'course', targetId: id, targetName: result.title, detail: { status } });
  return find(id, true);
}
export async function remove(id: string, revision: number, actorId: string): Promise<void> {
  const current = await withTransaction(async conn => {
    const rows = await runQuery<CourseRow[]>(conn, 'SELECT * FROM courses WHERE id = ? AND deleted_at IS NULL FOR UPDATE', [id]);
    if (!rows[0]) throw notFound('课程不存在或已删除');
    const course = dto(rows[0]);
    if (course.revision !== revision) throw conflict('课程已变化，请刷新后重试');
    if (course.status === 'published') throw conflict('请先下架课程，再删除');
    await runQuery(conn, 'UPDATE courses SET deleted_at = NOW(3), revision = revision + 1, updated_by = ?, updated_at = NOW(3) WHERE id = ?', [actorId, id]);
    return course;
  });
  await audit.record({ actorId, action: 'course.delete', targetType: 'course', targetId: id, targetName: current.title });
}
