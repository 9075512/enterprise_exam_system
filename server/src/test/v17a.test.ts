/**
 * v1.7① 考试运营闭环 集成测试。
 * 1) 试卷 PDF 导出：考生版/答案版；author 仅能导出被授权题库来源的试卷。
 * 2) 特殊考试安排：加时下发、免考拒绝开考、额外次数不绕过次数口径。
 * 3) 成绩复核：申请-复核改分流、改分生效、审计留痕、权限隔离。
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../app.js';
import { prepareTestDb } from './db.js';
import { closePool } from '../db/pool.js';
import { signToken } from '../middleware/auth.js';

const bearer = (token: string): { Authorization: string } => ({ Authorization: `Bearer ${token}` });

const admin = signToken({ sub: 'user-admin', role: 'admin', departmentId: '' });
const author = signToken({ sub: 'user-author', role: 'author', departmentId: '' });
const zs = signToken({ sub: 'user-zhangsan', role: 'examinee', departmentId: 'dept-rd' });
const ls = signToken({ sub: 'user-lisi', role: 'examinee', departmentId: 'dept-mkt' });

/** 裸二进制响应解析器：把响应体收集为 Buffer。 */
function binaryParser(
  res: { on: (event: string, cb: (c?: Buffer) => void) => void },
  cb: (err: null, body: Buffer) => void,
) {
  const chunks: Buffer[] = [];
  res.on('data', (c?: Buffer) => chunks.push(Buffer.from(c ?? [])));
  res.on('end', () => cb(null, Buffer.concat(chunks)));
}

/** 管理员创建一场考试（maxAttempts 可指定，默认 1）。 */
async function createExam(name: string, maxAttempts = 1): Promise<string> {
  const res = await request(app)
    .post('/api/exams')
    .set(bearer(admin))
    .send({
      name,
      paperId: 'paper-demo',
      departmentIds: ['dept-rd', 'dept-mkt'],
      startTime: new Date(Date.now() - 3600_000).toISOString(),
      endTime: new Date(Date.now() + 3600_000).toISOString(),
      durationMinutes: 30,
      passScore: 60,
      maxAttempts,
    });
  expect(res.body.code).toBe(0);
  return res.body.data.id as string;
}

/** 考生开考并交卷，返回 recordId 与分数。 */
async function startAndSubmit(
  examId: string,
  token: string,
): Promise<{ recordId: string; score: number }> {
  const start = await request(app).post(`/api/exams/${examId}/start`).set(bearer(token));
  expect(start.body.code).toBe(0);
  const recordId = start.body.data.id as string;
  const submit = await request(app).post(`/api/records/${recordId}/submit`).set(bearer(token)).send({});
  expect(submit.body.code).toBe(0);
  return { recordId, score: Number(submit.body.data.score) };
}

describe('v1.7① 考试运营闭环', () => {
  beforeAll(async () => {
    await prepareTestDb();
  }, 30000);

  afterAll(async () => {
    await closePool();
  });

  describe('试卷 PDF 导出', () => {
    it('考生版导出：响应头 + %PDF 魔数', async () => {
      const res = await request(app)
        .get('/api/papers/paper-demo/export-pdf')
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

    it('答案版导出（withAnswer=1）成功', async () => {
      const res = await request(app)
        .get('/api/papers/paper-demo/export-pdf')
        .query({ withAnswer: 1 })
        .set(bearer(author))
        .buffer(true)
        .parse(binaryParser as never);
      expect(res.status).toBe(200);
      expect((res.body as Buffer).subarray(0, 4).toString()).toBe('%PDF');
    });

    it('出题人导出未授权题库来源的试卷 → 403', async () => {
      // admin 新建题库（不授权 author）与试卷
      const bank = await request(app)
        .post('/api/banks')
        .set(bearer(admin))
        .send({ name: '未授权题库P', description: '', category: '测试' });
      expect(bank.body.code).toBe(0);
      const bankId = bank.body.data.id as string;

      const q = await request(app)
        .post('/api/questions')
        .set(bearer(admin))
        .send({
          bankId,
          type: 'single',
          stem: '唯一选项题',
          options: ['A项', 'B项'],
          answer: [0],
          defaultScore: 10,
          analysis: '',
          subject: '测试',
        });
      expect(q.body.code).toBe(0);

      const paper = await request(app)
        .post('/api/papers')
        .set(bearer(admin))
        .send({ name: '未授权试卷P', description: '', bankIds: [bankId], questions: [{ questionId: q.body.data.id, score: 10 }] });
      expect(paper.body.code).toBe(0);

      const res = await request(app)
        .get(`/api/papers/${paper.body.data.id}/export-pdf`)
        .set(bearer(author));
      expect(res.status).toBe(403);
    });
  });

  describe('特殊考试安排', () => {
    let examId = '';

    it('管理员下发加时 → 考生端列表与开考均带回', async () => {
      examId = await createExam('特殊安排-加时考试');

      const put = await request(app)
        .put(`/api/exams/${examId}/exceptions/user-zhangsan`)
        .set(bearer(admin))
        .send({ extraMinutes: 30, note: '残障加时' });
      expect(put.body.code).toBe(0);
      expect(put.body.data.extraMinutes).toBe(30);
      expect(put.body.data.userName).toBe('张三');

      const list = await request(app).get(`/api/exams/${examId}/exceptions`).set(bearer(admin));
      expect(list.body.code).toBe(0);
      expect(list.body.data.length).toBe(1);

      const mine = await request(app).get('/api/exams/my').set(bearer(zs));
      const target = (mine.body.data as Array<{ id: string; extraMinutes: number }>).find((e) => e.id === examId);
      expect(target?.extraMinutes).toBe(30);

      const start = await request(app).post(`/api/exams/${examId}/start`).set(bearer(zs));
      expect(start.body.code).toBe(0);
      expect(start.body.data.extraMinutes).toBe(30);
    });

    it('额外次数：加次数前次数用完 1008，加次数后可再开考', async () => {
      const start1 = await request(app).post(`/api/exams/${examId}/start`).set(bearer(ls));
      expect(start1.body.code).toBe(0);
      const rec1 = start1.body.data.id as string;
      await request(app).post(`/api/records/${rec1}/submit`).set(bearer(ls)).send({});

      const blocked = await request(app).post(`/api/exams/${examId}/start`).set(bearer(ls));
      expect(blocked.body.code).toBe(1008);

      const put = await request(app)
        .put(`/api/exams/${examId}/exceptions/user-lisi`)
        .set(bearer(admin))
        .send({ extraAttempts: 1, note: '单独安排' });
      expect(put.body.code).toBe(0);

      const again = await request(app).post(`/api/exams/${examId}/start`).set(bearer(ls));
      expect(again.body.code).toBe(0);
      expect(again.body.data.attemptNo).toBe(2);
    });

    it('免考标记：开考被拒绝；撤销后可正常开考', async () => {
      const exempt = await request(app)
        .put(`/api/exams/${examId}/exceptions/user-lisi`)
        .set(bearer(admin))
        .send({ exempt: true, note: '免考' });
      expect(exempt.body.code).toBe(0);
      expect(exempt.body.data.exempt).toBe(true);

      // 先交掉进行中的第 2 次
      const inProgress = await request(app).get('/api/records/my').set(bearer(ls));
      expect(inProgress.body.code).toBe(0);

      const blocked = await request(app).post(`/api/exams/${examId}/start`).set(bearer(ls));
      // 存在进行中记录时续考优先；先交卷再试
      if (blocked.body.code === 0) {
        await request(app).post(`/api/records/${blocked.body.data.id}/submit`).set(bearer(ls)).send({});
      }
      const blocked2 = await request(app).post(`/api/exams/${examId}/start`).set(bearer(ls));
      expect(blocked2.body.code).toBe(1001);

      const reset = await request(app)
        .put(`/api/exams/${examId}/exceptions/user-lisi`)
        .set(bearer(admin))
        .send({ exempt: false, extraAttempts: 5 });
      expect(reset.body.code).toBe(0);
      const ok = await request(app).post(`/api/exams/${examId}/start`).set(bearer(ls));
      expect(ok.body.code).toBe(0);
    });

    it('特殊安排写操作落审计日志；考生无权访问安排列表', async () => {
      const logs = await request(app)
        .get('/api/audit-logs')
        .query({ action: 'exam.exception_update' })
        .set(bearer(admin));
      expect(logs.body.code).toBe(0);
      expect((logs.body.data.list as unknown[]).length).toBeGreaterThan(0);

      const res = await request(app).get(`/api/exams/${examId}/exceptions`).set(bearer(zs));
      expect(res.status).toBe(403);
    });

    it('删除特殊安排', async () => {
      const del = await request(app)
        .delete(`/api/exams/${examId}/exceptions/user-zhangsan`)
        .set(bearer(admin));
      expect(del.body.code).toBe(0);
      const list = await request(app).get(`/api/exams/${examId}/exceptions`).set(bearer(admin));
      expect((list.body.data as unknown[]).length).toBe(1); // 仅剩 lisi
    });
  });

  describe('成绩复核', () => {
    let examId = '';
    let zsRecordId = '';

    it('考生申请复核 → 待审批；重复申请 1005', async () => {
      examId = await createExam('成绩复核测试考试');
      const { recordId } = await startAndSubmit(examId, zs);
      zsRecordId = recordId;

      const apply = await request(app)
        .post('/api/appeals/apply')
        .set(bearer(zs))
        .send({ recordId, reason: '第 3 题我认为判错了' });
      expect(apply.body.code).toBe(0);
      expect(apply.body.data.status).toBe('pending');
      expect(apply.body.data.originalScore).toBe(0);

      const again = await request(app).post('/api/appeals/apply').set(bearer(zs)).send({ recordId });
      expect(again.body.code).toBe(1005);
    });

    it('对他人记录申请复核 → 403', async () => {
      const res = await request(app).post('/api/appeals/apply').set(bearer(ls)).send({ recordId: zsRecordId });
      expect(res.status).toBe(403);
    });

    it('管理员列表可见；考生无权访问复核列表', async () => {
      const list = await request(app).get('/api/appeals').set(bearer(admin));
      expect(list.body.code).toBe(0);
      expect((list.body.data.list as unknown[]).length).toBe(1);

      const forbiddenRes = await request(app).get('/api/appeals').set(bearer(zs));
      expect(forbiddenRes.status).toBe(403);
    });

    it('超出分值范围的改分 → 1001', async () => {
      const list = await request(app).get('/api/appeals').set(bearer(admin));
      const appealId = (list.body.data.list as Array<{ id: string }>)[0].id;
      const res = await request(app)
        .post(`/api/appeals/${appealId}/approve`)
        .set(bearer(admin))
        .send({ newScore: 9999, comment: '超出范围' });
      expect(res.body.code).toBe(1001);
    });

    it('复核通过改分 → 记录分数更新 + 审计留痕', async () => {
      const list = await request(app).get('/api/appeals').set(bearer(admin));
      const appealId = (list.body.data.list as Array<{ id: string }>)[0].id;

      const approve = await request(app)
        .post(`/api/appeals/${appealId}/approve`)
        .set(bearer(admin))
        .send({ newScore: 88, comment: '第 3 题给分' });
      expect(approve.body.code).toBe(0);
      expect(approve.body.data.status).toBe('approved');
      expect(approve.body.data.newScore).toBe(88);

      const detail = await request(app).get(`/api/records/${zsRecordId}`).set(bearer(admin));
      expect(Number(detail.body.data.score)).toBe(88);
      expect(detail.body.data.appealStatus).toBe('approved');

      const my = await request(app).get('/api/records/my').set(bearer(zs));
      const row = (my.body.data.list as Array<{ id: string; score: number }>).find((r) => r.id === zsRecordId);
      expect(Number(row?.score)).toBe(88);

      const logs = await request(app)
        .get('/api/audit-logs')
        .query({ action: 'appeal.approve' })
        .set(bearer(admin));
      expect((logs.body.data.list as unknown[]).length).toBeGreaterThan(0);

      // 已复核不可重复复核
      const repeat = await request(app)
        .post(`/api/appeals/${appealId}/approve`)
        .set(bearer(admin))
        .send({ newScore: 90 });
      expect(repeat.body.code).toBe(1005);
    });

    it('复核驳回：保留原分 + 意见必填', async () => {
      const { recordId } = await startAndSubmit(examId, ls);
      const apply = await request(app).post('/api/appeals/apply').set(bearer(ls)).send({ recordId, reason: '想复核' });
      expect(apply.body.code).toBe(0);
      const appealId = apply.body.data.id as string;

      const noComment = await request(app)
        .post(`/api/appeals/${appealId}/reject`)
        .set(bearer(admin))
        .send({});
      expect(noComment.body.code).toBe(1001);

      const reject = await request(app)
        .post(`/api/appeals/${appealId}/reject`)
        .set(bearer(admin))
        .send({ comment: '判分无误' });
      expect(reject.body.code).toBe(0);
      expect(reject.body.data.status).toBe('rejected');

      const detail = await request(app).get(`/api/records/${recordId}`).set(bearer(admin));
      expect(Number(detail.body.data.score)).toBe(0);
      expect(detail.body.data.appealStatus).toBe('rejected');

      // 被驳回后不可再次申请（每条记录仅一次）
      const again = await request(app).post('/api/appeals/apply').set(bearer(ls)).send({ recordId });
      expect(again.body.code).toBe(1005);
    });

    it('我的复核申请（考生）可查', async () => {
      const my = await request(app).get('/api/appeals/my').set(bearer(zs));
      expect(my.body.code).toBe(0);
      expect((my.body.data.list as unknown[]).length).toBe(1);
    });
  });
});
