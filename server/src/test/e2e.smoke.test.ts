/**
 * e2e 冒烟测试：验证「重建测试库 → 应用可启动 → 登录/鉴权/兜底路由」整链路可用。
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../app.js';
import { prepareTestDb } from './db.js';
import { closePool } from '../db/pool.js';

describe('e2e 冒烟（健康检查 / 登录 / 鉴权 / 兜底）', () => {
  beforeAll(async () => {
    await prepareTestDb();
  }, 30000);

  afterAll(async () => {
    await closePool();
  });

  it('GET /api/health → up', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ code: 0, data: { status: 'up' } });
  });

  it('登录成功签发 JWT 并返回用户信息', async () => {
    const res = await request(app).post('/api/auth/login').send({ username: 'admin', password: 'admin123' });
    expect(res.body.code).toBe(0);
    expect(typeof res.body.data.token).toBe('string');
    expect(res.body.data.user).toMatchObject({ username: 'admin', role: 'admin', departmentId: '', departmentName: '' });
  });

  it('密码错误 → 401 / 1002', async () => {
    const res = await request(app).post('/api/auth/login').send({ username: 'admin', password: 'wrong-password' });
    expect(res.status).toBe(401);
    expect(res.body.code).toBe(1002);
  });

  it('登录返回 departmentName（有科室用户返回科室名，无科室返回空串）', async () => {
    const withDept = await request(app).post('/api/auth/login').send({ username: 'zhangsan', password: '123456' });
    expect(withDept.body.code).toBe(0);
    expect(withDept.body.data.user).toMatchObject({ username: 'zhangsan', departmentId: 'dept-rd', departmentName: '研发部' });

    const withoutDept = await request(app).post('/api/auth/login').send({ username: 'author', password: 'author123' });
    expect(withoutDept.body.code).toBe(0);
    expect(withoutDept.body.data.user).toMatchObject({ username: 'author', departmentId: '', departmentName: '' });
  });

  it('携带登录令牌访问 /api/auth/me 返回当前用户', async () => {
    const login = await request(app).post('/api/auth/login').send({ username: 'zhangsan', password: '123456' });
    const token = login.body.data.token as string;
    const res = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`);
    expect(res.body.code).toBe(0);
    expect(res.body.data).toMatchObject({
      username: 'zhangsan',
      role: 'examinee',
      departmentId: 'dept-rd',
      departmentName: '研发部',
    });
  });

  it('未知路由 → 404 / 1004', async () => {
    const res = await request(app).get('/api/this-route-does-not-exist');
    expect(res.status).toBe(404);
    expect(res.body.code).toBe(1004);
  });
});
