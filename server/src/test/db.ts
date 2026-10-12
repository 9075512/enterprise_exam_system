/**
 * 测试数据库准备：在测试库（enterprise_exam_system_test）内重建 11 张表并灌入种子。
 * 严格保护：仅允许操作以 `_test` 结尾的库，绝不触碰 enterprise_exam_system / exam_system。
 */
import mysql from 'mysql2/promise';
import { env } from '../config/env.js';
import { DDL_STATEMENTS } from '../db/schema.js';
import { seed } from '../db/seed.js';

/** 测试库名。 */
export const TEST_DB = env.DB_NAME_TEST;

/** 重建测试库：DROP → CREATE → 建表 → 幂等种子。 */
export async function prepareTestDb(): Promise<void> {
  if (!TEST_DB.endsWith('_test')) {
    throw new Error(`安全保护：测试库名必须以 _test 结尾，当前为「${TEST_DB}」`);
  }

  const conn = await mysql.createConnection({
    host: env.DB_HOST,
    port: env.DB_PORT,
    user: env.DB_USER,
    password: env.DB_PASSWORD,
    charset: 'utf8mb4',
    timezone: 'Z',
    dateStrings: true,
  });

  try {
    await conn.query(`DROP DATABASE IF EXISTS \`${TEST_DB}\``);
    await conn.query(
      `CREATE DATABASE IF NOT EXISTS \`${TEST_DB}\` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
    );
    await conn.changeUser({ database: TEST_DB });
    for (const stmt of DDL_STATEMENTS) {
      await conn.query(stmt);
    }
    await conn.beginTransaction();
    try {
      await seed(conn);
      await conn.commit();
    } catch (err) {
      await conn.rollback();
      throw err;
    }
  } finally {
    await conn.end();
  }
}
