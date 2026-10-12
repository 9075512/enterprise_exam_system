/**
 * PRACTICE_ONLY 进程隔离验证（方案乙）。
 *
 * 目标：以 `PRACTICE_ONLY=true` 装配应用时，进程内**不存在**考试域路由（物理不可达），
 * 而练题路由与健康检查正常。这是架构 §1.2 方案乙 + §4.9 的核心红线。
 *
 * 实现说明：env 为进程级单例（导入即求值）。为让本文件以 PRACTICE_ONLY=true 装配，
 * 这里**不在顶部静态导入任何会连带加载 config/env 的模块**，而是在 beforeAll 中先设置
 * 环境变量、再动态 import 应用工厂，确保 env 读到 PRACTICE_ONLY=true。
 * 结束后恢复原值，避免污染同进程后续测试文件。
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';

let app: Express;
let closePool: () => Promise<void>;
let prevPracticeOnly: string | undefined;

beforeAll(async () => {
  prevPracticeOnly = process.env.PRACTICE_ONLY;
  process.env.PRACTICE_ONLY = 'true';
  // 动态导入：此刻 env 首次求值，PRACTICE_ONLY=true 生效
  const [{ createApp }, pool] = await Promise.all([import('../app.js'), import('../db/pool.js')]);
  closePool = pool.closePool;
  app = createApp();
});

afterAll(async () => {
  await closePool?.();
  if (prevPracticeOnly === undefined) delete process.env.PRACTICE_ONLY;
  else process.env.PRACTICE_ONLY = prevPracticeOnly;
});

describe('PRACTICE_ONLY 进程隔离', () => {
  it('考试域路由在进程内不存在：全部 404（非 401/403）', async () => {
    const examDomainPaths = [
      '/api/users',
      '/api/departments',
      '/api/banks',
      '/api/questions',
      '/api/papers',
      '/api/exams',
      '/api/records/my',
      '/api/reports/exams/exam-demo',
      '/api/settings',
      '/api/auth/login',
    ];
    for (const path of examDomainPaths) {
      const res = await request(app).get(path);
      expect(res.status, path).toBe(404);
      expect(res.body.code, path).toBe(1004);
    }
  });

  it('练题路由已注册：未登录 /api/practice/banks → 401 / 1002（存在且受保护）', async () => {
    const res = await request(app).get('/api/practice/banks');
    expect(res.status).toBe(401);
    expect(res.body.code).toBe(1002);
  });

  it('练题登录 / 验证码接口公开可达', async () => {
    const cap = await request(app).get('/api/practice/auth/captcha');
    expect(cap.body.code).toBe(0);
  });

  it('健康检查正常', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.code).toBe(0);
    expect(res.body.data).toMatchObject({ status: 'up' });
  });
});
