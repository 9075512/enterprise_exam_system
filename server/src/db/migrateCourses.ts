// 课程模块的独立增量迁移：仅创建两张新表，不运行历史种子或重建现有数据。
import { DDL_STATEMENTS } from './schema.js';
import { pool, closePool } from './pool.js';

try {
  const statements = DDL_STATEMENTS.filter(sql => /CREATE TABLE IF NOT EXISTS (courses|course_media)\s*\(/.test(sql));
  if (statements.length !== 2) throw new Error('课程表定义不完整');
  for (const sql of statements) await pool.query(sql);
  console.log('课程模块迁移完成：courses、course_media（幂等，不更改既有数据与权限）');
} finally { await closePool(); }
