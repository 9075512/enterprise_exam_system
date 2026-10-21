// 课程模块独立增量迁移，不运行历史种子或重建现有数据。
import { DDL_STATEMENTS } from './schema.js';
import { pool, closePool } from './pool.js';
import { migrateCourseCatalog } from './courseCatalogMigration.js';

try {
  const statements = DDL_STATEMENTS.filter(sql => /CREATE TABLE IF NOT EXISTS (courses|course_media|course_categories|course_progress)\s*\(/.test(sql));
  if (statements.length !== 4) throw new Error('课程表定义不完整');
  for (const sql of statements) await pool.query(sql);
  const conn = await pool.getConnection();
  try { await conn.beginTransaction(); await migrateCourseCatalog(conn); await conn.commit(); }
  catch (error) { await conn.rollback(); throw error; }
  finally { conn.release(); }
  console.log('课程模块迁移完成：课程、媒体、分类、观看记录；已迁入历史分类（幂等，不重建数据或改变权限）');
} finally { await closePool(); }
