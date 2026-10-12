/**
 * MySQL 连接池封装（mysql2/promise）。
 * - 时间统一 UTC（timezone:'Z'）+ 原始字符串（dateStrings:true），避免驱动做本地时区解释；
 * - utf8mb4 字符集，连接数上限 10；
 * - 对外暴露 `pool`、`query<T>()`、`withTransaction<T>()`。
 */
import mysql from 'mysql2/promise';
import type { Pool, PoolConnection, RowDataPacket, ResultSetHeader } from 'mysql2/promise';
import { env } from '../config/env.js';

/** 全局连接池（进程级单例）。 */
export const pool: Pool = mysql.createPool({
  host: env.DB_HOST,
  port: env.DB_PORT,
  user: env.DB_USER,
  password: env.DB_PASSWORD,
  database: env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  charset: 'utf8mb4',
  timezone: 'Z',
  dateStrings: true,
  supportBigNumbers: true,
  bigNumberStrings: false,
  connectTimeout: 10000,
});

/** 查询参数类型（预编译占位符 `?` 的取值集合）。 */
export type QueryParams = ReadonlyArray<string | number | boolean | null | Date>;

/** 可执行 SQL 的最小接口：连接池或事务连接均可满足。 */
export interface SqlExecutor {
  query(sql: string, values?: unknown[]): Promise<[unknown, unknown]>;
}

/**
 * 在指定执行器（事务连接）或全局连接池上执行查询。
 * repo 层统一调用它，便于同一 SQL 既能在池上跑、也能在事务内跑。
 */
export async function runQuery<T = RowDataPacket>(
  exec: SqlExecutor | undefined,
  sql: string,
  params: QueryParams = [],
): Promise<T> {
  const target = exec ?? pool;
  const [rows] = await target.query(sql, params as unknown[]);
  return rows as T;
}

/**
 * 执行查询（自动区分 SELECT / 写操作）。
 * @param sql 使用 `?` 占位符的参数化 SQL，禁止字符串拼接用户输入。
 * @param params 占位符参数。
 */
export async function query<T extends RowDataPacket[] | ResultSetHeader>(
  sql: string,
  params: QueryParams = [],
): Promise<T> {
  const [rows] = await pool.query<T>(sql, params as unknown[]);
  return rows;
}

/**
 * 事务封装：自动 BEGIN / COMMIT / ROLLBACK 并释放连接。
 * @param fn 在事务连接上执行的业务函数，返回其结果。
 */
export async function withTransaction<T>(fn: (conn: PoolConnection) => Promise<T>): Promise<T> {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const result = await fn(conn);
    await conn.commit();
    return result;
  } catch (err) {
    try {
      await conn.rollback();
    } catch {
      /* 回滚失败时忽略，保留原始异常 */
    }
    throw err;
  } finally {
    conn.release();
  }
}

/** 校验连接池能否连通 MySQL（供健康检查 / 启动自检使用）。 */
export async function ping(): Promise<void> {
  const conn = await pool.getConnection();
  try {
    await conn.ping();
  } finally {
    conn.release();
  }
}

/** 关闭连接池（优雅退出时调用）。 */
export async function closePool(): Promise<void> {
  await pool.end();
}
