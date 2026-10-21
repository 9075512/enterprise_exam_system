import { randomUUID } from 'node:crypto';
import type { SqlExecutor } from './pool.js';
import { parseJsonColumn } from '../utils/json.js';

/** Adds maintained category identities to legacy courses without changing their content or status. */
export async function migrateCourseCatalog(conn: SqlExecutor): Promise<void> {
  const [rows] = await conn.query('SELECT id, content_json FROM courses WHERE deleted_at IS NULL');
  for (const row of rows as { id: string; content_json: unknown }[]) {
    const content = parseJsonColumn<{ category?: string; categoryId?: string }>(row.content_json, {});
    const name = content.category?.trim();
    if (!name || content.categoryId) continue;
    await conn.query('INSERT IGNORE INTO course_categories (id, name, created_at, updated_at) VALUES (?, ?, NOW(3), NOW(3))', ['category-' + randomUUID(), name]);
    const [categories] = await conn.query('SELECT id, name FROM course_categories WHERE name = ?', [name]);
    const category = (categories as { id: string; name: string }[])[0];
    if (!category) throw new Error('历史课程分类迁移失败');
    await conn.query("UPDATE courses SET content_json = JSON_SET(content_json, '$.categoryId', ?, '$.category', ?) WHERE id = ?", [category.id, category.name, row.id]);
  }
}
