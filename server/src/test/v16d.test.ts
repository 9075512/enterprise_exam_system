/**
 * v1.6④ 数据运营与审计 集成测试。
 * 1) 操作审计日志：用户/权限写操作落日志，可过滤查询。
 * 2) 数据看板：及格率趋势 + 科目错题归因。
 * 3) PDF 导出：成绩明细导出为 PDF（裸二进制 + 正确响应头）。
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../app.js';
import { prepareTestDb } from './db.js';
import { closePool } from '../db/pool.js';
import { signToken } from '../middleware/auth.js';

const bearer = (token: string): { Authorization: string } => ({ Authorization: `Bearer ${token}` });

const admin = signToken({ sub: 'user-admin', role: 'admin', departmentId: '' });
const zs = signToken({ sub: 'user-zhangsan', role: 'examinee', departmentId: 'dept-rd' });

/** 裸二进制响应解析器：把响应体收集为 Buffer。 */
function binaryParser(res: { on: (event: string, cb: (c?: Buffer) => void) => void }, cb: (err: null, body: Buffer) => void) {
  const chunks: Buffer[] = [];
  res.on('data', (c?: Buffer) => chunks.push(Buffer.from(c ?? [])));
  res.on('end', () => cb(null, Buffer.concat(chunks)));
}

/** 管理员创建一场考试，返回 examId。 */
async function createExam(name: string): Promise<string> {
  const res = await request(app)
    .post('/api/exams')
    .set(bearer(admin))
    .send({
      name,
      paperId: 'paper-demo',
      departmentIds: ['dept-rd'],
      startTime: new Date(Date.now() - 3600_000).toISOString(),
      endTime: new Date(Date.now() + 3600_000).toISOString(),
      durationMinutes: 30,
      passScore: 60,
      maxAttempts: 1,
    });
  expect(res.body.code).toBe(0);
  return res.body.data.id as string;
}

/** 考生开考并交卷一次。 */
async function startAndSubmit(examId: string, token: string): Promise<void> {
  const start = await request(app).post(`/api/exams/${examId}/start`).set(bearer(token));
  expect(start.body.code).toBe(0);
  const recordId = start.body.data.id as string;
  const submit = await request(app).post(`/api/records/${recordId}/submit`).set(bearer(token)).send({});
  expect(submit.body.code).toBe(0);
}

describe('v1.6④ 数据运营与审计', () => {
  beforeAll(async () => {
    await prepareTestDb();
  }, 30000);

  afterAll(async () => {
    await closePool();
  });

  describe('操作审计日志', () => {
    it('新建用户 → 落 user.create 日志（含操作者姓名）', async () => {
      const res = await request(app)
        .post('/api/users')
        .set(bearer(admin))
        .send({ username: 'audit_user', name: '审计测试用户', role: 'examinee', departmentId: 'dept-rd' });
      expect(res.body.code).toBe(0);

      const logs = await request(app).get('/api/audit-logs').query({ action: 'user.create' }).set(bearer(admin));
      expect(logs.body.code).toBe(0);
      const list = logs.body.data.list as Array<{ action: string; targetName: string; actorName: string }>;
      expect(list.length).toBeGreaterThan(0);
      expect(list[0].action).toBe('user.create');
      expect(list[0].targetName).toBe('审计测试用户');
      expect(list[0].actorName).toBe('系统管理员');
    });

    it('更新菜单权限 → 落 permission.update 日志', async () => {
      const res = await request(app)
        .put('/api/permissions/menus')
        .set(bearer(admin))
        .send({ grants: { admin: ['dashboard', 'settings', 'permissions'], author: ['banks', 'papers'], examinee: ['my-exams', 'my-scores'] } });
      expect(res.body.code).toBe(0);

      const logs = await request(app).get('/api/audit-logs').query({ targetType: 'permission' }).set(bearer(admin));
      expect(logs.body.code).toBe(0);
      const list = logs.body.data.list as Array<{ action: string }>;
      expect(list.some((l) => l.action === 'permission.update')).toBe(true);
    });

    it('无 Token 查询审计日志 → 401', async () => {
      const res = await request(app).get('/api/audit-logs');
      expect(res.status).toBe(401);
    });

    it('考生 Token 查询审计日志 → 403', async () => {
      const res = await request(app).get('/api/audit-logs').set(bearer(zs));
      expect(res.status).toBe(403);
    });
  });

  describe('数据看板（趋势 + 归因）', () => {
    let examId = '';

    it('交卷后看板返回及格率趋势与科目错题归因', async () => {
      examId = await createExam('看板测试考试');
      await startAndSubmit(examId, zs);

      const res = await request(app).get('/api/reports/dashboard').set(bearer(admin));
      expect(res.body.code).toBe(0);
      const data = res.body.data as {
        examTrend: Array<{ examId: string; total: number; passRate: number }>;
        subjectWrong: Array<{ subject: string; wrongCount: number; totalAnswered: number; wrongRate: number }>;
      };

      const trendPoint = data.examTrend.find((p) => p.examId === examId);
      expect(trendPoint).toBeDefined();
      expect(trendPoint!.total).toBe(1);
      expect(trendPoint!.passRate).toBe(0); // 空答案全部答错，及格率 0

      // 科目归因：paper-demo 含「安全知识」科目（空答案全错，错题率 1）
      const security = data.subjectWrong.find((s) => s.subject === '安全知识');
      expect(security).toBeDefined();
      expect(security!.wrongRate).toBe(1);
    });

    it('考生 Token 访问看板 → 403', async () => {
      const res = await request(app).get('/api/reports/dashboard').set(bearer(zs));
      expect(res.status).toBe(403);
    });
  });

  describe('PDF 导出', () => {
    let examId = '';

    it('导出成绩为 PDF：响应头 + %PDF 魔数', async () => {
      examId = await createExam('PDF 导出测试考试');
      await startAndSubmit(examId, zs);

      const res = await request(app)
        .get(`/api/reports/exams/${examId}/export-pdf`)
        .set(bearer(admin))
        .buffer(true)
        .parse(binaryParser as never);

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('application/pdf');
      expect(res.headers['content-disposition']).toContain('attachment;');
      const body = res.body as Buffer;
      expect(body.length).toBeGreaterThan(0);
      expect(body.subarray(0, 4).toString()).toBe('%PDF');
    });

    it('非法列 columns=foo → 400/1001', async () => {
      const res = await request(app)
        .get(`/api/reports/exams/${examId}/export-pdf`)
        .set(bearer(admin))
        .query({ columns: 'name,foo' });
      expect(res.status).toBe(400);
      expect(res.body.code).toBe(1001);
    });
  });
});
