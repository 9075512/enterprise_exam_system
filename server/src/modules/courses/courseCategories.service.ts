import type { RowDataPacket, PoolConnection } from 'mysql2/promise';
import { query, runQuery, withTransaction } from '../../db/pool.js';
import { badRequest, conflict, notFound } from '../../utils/errors.js';
import { genId } from '../../utils/id.js';
import * as audit from '../audit/audit.service.js';
import type { CourseCategoryInput, CourseInput } from './courses.schema.js';

export async function lockCatalog(conn: PoolConnection): Promise<void> {
  await runQuery(conn, 'SELECT id FROM course_categories ORDER BY id FOR UPDATE');
}
export async function resolveCategory(input: CourseInput, conn: PoolConnection): Promise<CourseInput> {
  if (!input.categoryId && !input.category) return { ...input, categoryId: '', category: '' };
  const rows = await runQuery<RowDataPacket[]>(conn, `SELECT id, name FROM course_categories WHERE ${input.categoryId ? 'id' : 'name'} = ?`, [input.categoryId || input.category]);
  if (!rows[0]) throw badRequest('课程分类不存在，请刷新分类列表后重新选择');
  return { ...input, categoryId: String(rows[0].id), category: String(rows[0].name) };
}
export async function list() {
  const rows = await query<RowDataPacket[]>(`SELECT cc.*, COUNT(c.id) AS course_count FROM course_categories cc
    LEFT JOIN courses c ON c.deleted_at IS NULL AND JSON_UNQUOTE(JSON_EXTRACT(c.content_json, '$.categoryId')) = cc.id
    GROUP BY cc.id ORDER BY cc.sort_order, cc.name, cc.id`);
  return rows.map(row => ({ id: String(row.id), name: String(row.name), sortOrder: Number(row.sort_order), revision: Number(row.revision), courseCount: Number(row.course_count) }));
}
async function duplicateSafe<T>(operation: () => Promise<T>): Promise<T> {
  try { return await operation(); } catch (error) { if ((error as { code?: string }).code === 'ER_DUP_ENTRY') throw conflict('分类名称已存在'); throw error; }
}
export async function create(input: CourseCategoryInput, actorId: string) {
  const id = genId('category-');
  await duplicateSafe(() => withTransaction(async conn => {
    await lockCatalog(conn);
    await runQuery(conn, 'INSERT INTO course_categories (id, name, sort_order, created_at, updated_at) VALUES (?, ?, ?, NOW(3), NOW(3))', [id, input.name, input.sortOrder]);
  }));
  await audit.record({ actorId, action: 'course-category.create', targetType: 'course', targetId: id, targetName: input.name });
  return (await list()).find(item => item.id === id)!;
}
export async function update(id: string, revision: number, input: CourseCategoryInput, actorId: string) {
  await duplicateSafe(() => withTransaction(async conn => {
    await lockCatalog(conn);
    const rows = await runQuery<RowDataPacket[]>(conn, 'SELECT * FROM course_categories WHERE id = ?', [id]);
    if (!rows[0]) throw notFound('分类不存在');
    if (Number(rows[0].revision) !== revision) throw conflict('分类已被修改，请刷新后重试');
    await runQuery(conn, 'UPDATE course_categories SET name = ?, sort_order = ?, revision = revision + 1, updated_at = NOW(3) WHERE id = ?', [input.name, input.sortOrder, id]);
    if (rows[0].name !== input.name) await runQuery(conn, `UPDATE courses SET content_json = JSON_SET(content_json, '$.category', ?), revision = revision + 1, updated_by = ?, updated_at = NOW(3)
      WHERE deleted_at IS NULL AND JSON_UNQUOTE(JSON_EXTRACT(content_json, '$.categoryId')) = ?`, [input.name, actorId, id]);
  }));
  await audit.record({ actorId, action: 'course-category.update', targetType: 'course', targetId: id, targetName: input.name });
  return (await list()).find(item => item.id === id)!;
}
export async function remove(id: string, revision: number, actorId: string) {
  const name = await withTransaction(async conn => {
    await lockCatalog(conn);
    const rows = await runQuery<RowDataPacket[]>(conn, 'SELECT * FROM course_categories WHERE id = ?', [id]);
    if (!rows[0]) throw notFound('分类不存在');
    if (Number(rows[0].revision) !== revision) throw conflict('分类已被修改，请刷新后重试');
    const used = await runQuery<RowDataPacket[]>(conn, "SELECT id FROM courses WHERE deleted_at IS NULL AND JSON_UNQUOTE(JSON_EXTRACT(content_json, '$.categoryId')) = ? LIMIT 1", [id]);
    if (used.length) throw conflict('该分类正在被课程使用，请先调整课程分类后再删除');
    await runQuery(conn, 'DELETE FROM course_categories WHERE id = ?', [id]);
    return String(rows[0].name);
  });
  await audit.record({ actorId, action: 'course-category.delete', targetType: 'course', targetId: id, targetName: name });
}
