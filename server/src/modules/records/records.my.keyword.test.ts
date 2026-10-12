/**
 * 集成测试：GET /api/records/my 的「按考试名称关键字筛选」服务端支持。
 * - 命中关键字 → 只返回匹配记录，total 同步变小；
 * - keyword 含 % / _ → 按字面量匹配（未被当作通配符）；
 * - 不传 / 传空白 keyword → 等价不过滤，分页正常。
 * 通过 supertest 驱动 Express，数据落在测试库 enterprise_exam_system_test。
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../../app.js';
import { prepareTestDb } from '../../test/db.js';
import { closePool } from '../../db/pool.js';
import { signToken } from '../../middleware/auth.js';

/** 构造 Bearer 请求头。 */
const bearer = (token: string): { Authorization: string } => ({ Authorization: `Bearer ${token}` });

const admin = signToken({ sub: 'user-admin', role: 'admin', departmentId: '' });
const zs = signToken({ sub: 'user-zhangsan', role: 'examinee', departmentId: 'dept-rd' });

/** 管理员创建一场进行中的考试，返回 examId。 */
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
    });
  expect(res.body.code).toBe(0);
  return res.body.data.id as string;
}

/** 张三开考并交卷，返回记录 id。 */
async function startAndSubmit(examId: string): Promise<string> {
  const start = await request(app).post(`/api/exams/${examId}/start`).set(bearer(zs));
  expect(start.body.code).toBe(0);
  const recordId = start.body.data.id as string;
  const submit = await request(app).post(`/api/records/${recordId}/submit`).set(bearer(zs)).send({});
  expect(submit.body.code).toBe(0);
  return recordId;
}

/** 带关键字查询「我的成绩」。 */
async function queryMy(keyword?: string, extra: Record<string, number> = {}) {
  const req = request(app).get('/api/records/my').set(bearer(zs));
  if (keyword !== undefined) req.query({ keyword });
  if (extra.page !== undefined) req.query({ page: extra.page });
  if (extra.pageSize !== undefined) req.query({ pageSize: extra.pageSize });
  const res = await req;
  expect(res.body.code).toBe(0);
  return res.body.data as { list: Array<{ id: string }>; total: number; page: number; pageSize: number };
}

describe('GET /api/records/my 按考试名称关键字筛选', () => {
  // 已交卷记录：examId → recordId
  const submitted: Record<string, string> = {};

  beforeAll(async () => {
    await prepareTestDb();
    // 三场含关键字（「安全」×2、「文化」×1）的考试，均已交卷
    submitted.secA = await startAndSubmit(await createExam('安全知识月考'));
    submitted.culture = await startAndSubmit(await createExam('企业文化考核'));
    submitted.secB = await startAndSubmit(await createExam('安全规范测试'));
    // 一场进行中（未交卷）考试：不应出现在「我的成绩」中，也不应被关键字命中
    const inProgress = await createExam('年终综合评测');
    const start = await request(app).post(`/api/exams/${inProgress}/start`).set(bearer(zs));
    expect(start.body.code).toBe(0);
  }, 30000);

  afterAll(async () => {
    await closePool();
  });

  it('不传 keyword → 返回全部本人已交卷记录（不含进行中），分页正常', async () => {
    const data = await queryMy();
    expect(data.total).toBe(3);
    expect(data.list).toHaveLength(3);
    const ids = data.list.map((r) => r.id).sort();
    expect(ids).toEqual([submitted.secA, submitted.culture, submitted.secB].sort());
  });

  it('keyword=安全 → 仅返回匹配记录，total 同步变小', async () => {
    const data = await queryMy('安全');
    expect(data.total).toBe(2);
    expect(data.list.map((r) => r.id).sort()).toEqual([submitted.secA, submitted.secB].sort());
  });

  it('keyword=文化 → 仅返回单条匹配记录', async () => {
    const data = await queryMy('文化');
    expect(data.total).toBe(1);
    expect(data.list.map((r) => r.id)).toEqual([submitted.culture]);
  });

  it('keyword 含 % → 按字面量匹配（未命中任何记录，而非全匹配）', async () => {
    const data = await queryMy('%');
    expect(data.total).toBe(0);
    expect(data.list).toHaveLength(0);
  });

  it('keyword 含 _ → 按字面量匹配（未命中任何记录，而非单字符通配）', async () => {
    const data = await queryMy('_');
    expect(data.total).toBe(0);
    expect(data.list).toHaveLength(0);
  });

  it('空白字符串 keyword（含首尾空格）等价不过滤', async () => {
    const blank = await queryMy('   ');
    expect(blank.total).toBe(3);

    // 首尾空格被 trim：「 安全 」等价「安全」
    const padded = await queryMy('  安全  ');
    expect(padded.total).toBe(2);
  });

  it('带 keyword 的分页：total 为命中总数，列表分页切割正确', async () => {
    const page1 = await queryMy('安全', { page: 1, pageSize: 1 });
    expect(page1.total).toBe(2);
    expect(page1.list).toHaveLength(1);

    const page2 = await queryMy('安全', { page: 2, pageSize: 1 });
    expect(page2.total).toBe(2);
    expect(page2.list).toHaveLength(1);
    expect(page2.list[0].id).not.toBe(page1.list[0].id);
  });
});
