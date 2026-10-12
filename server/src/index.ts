/**
 * 服务启动入口：校验数据库连通性 → 监听端口 → 注册优雅退出。
 */
import { app } from './app.js';
import { env } from './config/env.js';
import { ping, closePool } from './db/pool.js';

async function bootstrap(): Promise<void> {
  // 启动自检：探测 MySQL 连通性（失败不阻断启动，仅告警，便于前端联调时排查）
  try {
    await ping();
    console.log(`[server] MySQL 连接池已就绪（${env.DB_HOST}:${env.DB_PORT}/${env.DB_NAME}）`);
  } catch (err) {
    console.error('[server] 警告：无法连接 MySQL，请检查 server/.env 与数据库是否已初始化（npm run db:init）');
    console.error(err);
  }

  const server = app.listen(env.PORT, () => {
    console.log(`[server] 已启动：http://localhost:${env.PORT}（env=${env.NODE_ENV}）`);
    console.log(`[server] 健康检查：GET http://localhost:${env.PORT}/api/health`);
  });

  // 优雅退出：停止接收新连接 → 关闭连接池
  const shutdown = async (signal: string): Promise<void> => {
    console.log(`\n[server] 收到 ${signal}，正在优雅退出…`);
    server.close(async () => {
      try {
        await closePool();
      } finally {
        console.log('[server] 已退出');
        process.exit(0);
      }
    });
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

bootstrap().catch((err) => {
  console.error('[server] 启动失败：', err);
  process.exit(1);
});
