import { pool, closePool } from '../db/pool.js';
import { migrateCaptures } from '../db/capturesMigration.js';

try {
  await migrateCaptures(pool);
  console.log('考试抓拍数据库升级完成（保留现有考试与答卷）');
} catch (error) {
  console.error('考试抓拍数据库升级失败', error);
  process.exitCode = 1;
} finally { await closePool(); }
