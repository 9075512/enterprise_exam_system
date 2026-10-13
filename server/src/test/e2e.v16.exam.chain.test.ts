/**
 * v1.6② 端到端冒烟：填空 / 简答全链路业务闭环。
 *
 * 串联现有测试未覆盖的完整链路：
 *   出题（fill + short）→ 组卷（单选+填空+简答）→ 发布考试 → 考生作答 →
 *   交卷转 pending_review（客观+填空先判分）→ 待阅卷列表 → 人工阅卷 →
 *   终评总分 = 客观 + 主观 → 考生查看成绩明细。
 *
 * 同时覆盖两道关键防护：
 *   - 含主观题的答卷交卷后「待阅卷」也计入已用作答次数，不可绕过 maxAttempts 再开新卷；
 *   - 重复阅卷 / 缺漏简答打分 的边界错误码。
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
const zhangsan = signToken({ sub: 'user-zhangsan', role: 'examinee', departmentId: 'dept-rd' });

beforeAll(async () => {
  await prepareTestDb();
}, 30000);

afterAll(async () => {
  await closePool();
});

describe('v1.6② 端到端冒烟：填空 / 简答全链路', () => {
  let fillId = '';
  let shortId = '';
  let paperId = '';
  let examId = '';
  let recordId = '';
  let singleAnswer: number[] = [];

  it('出题人新增填空题（2 空，含大小写待验证）', async () => {
    const res = await request(app).post('/api/questions').set(bearer(author)).send({
      bankId: 'bank-security',
      type: 'fill',
      stem: 'HTTPS 中用于加密的传输层安全协议缩写是 ___，其中第一个字母代表 ___。',
      options: [],
      answer: ['TLS', 'Transport'],
      defaultScore: 30,
      subject: '安全知识',
    });
    expect(res.body.code).toBe(0);
    fillId = res.body.data.id as string;
    expect(res.body.data.type).toBe('fill');
    expect(res.body.data.answer).toEqual(['TLS', 'Transport']);
  });

  it('出题人新增简答题', async () => {
    const res = await request(app).post('/api/questions').set(bearer(author)).send({
      bankId: 'bank-security',
      type: 'short',
      stem: '请简述收到疑似钓鱼邮件时的处置流程。',
      options: [],
      answer: ['不点击链接；上报安全团队；删除邮件。'],
      defaultScore: 30,
      subject: '安全知识',
    });
    expect(res.body.code).toBe(0);
    shortId = res.body.data.id as string;
    expect(res.body.data.type).toBe('short');
  });

  it('出题人组卷（单选 40 + 填空 30 + 简答 30 = 100），题型按序排列', async () => {
    const res = await request(app).post('/api/papers').set(bearer(author)).send({
      name: 'v1.6 主观题冒烟卷',
      description: '',
      bankIds: ['bank-security'],
      // 故意乱序提交，验证服务端按题型排序：single → fill → short
      questions: [
        { questionId: shortId, score: 30 },
        { questionId: 'q-01', score: 40 },
        { questionId: fillId, score: 30 },
      ],
    });
    expect(res.body.code).toBe(0);
    paperId = res.body.data.id as string;
    expect(res.body.data.totalScore).toBe(100);
    const order = (res.body.data.questions as Array<{ questionId: string }>).map((q) => q.questionId);
    expect(order.indexOf('q-01')).toBeLessThan(order.indexOf(fillId));
    expect(order.indexOf(fillId)).toBeLessThan(order.indexOf(shortId));
  });

  it('管理员发布考试（研发部，作答上限 1 次）', async () => {
    const res = await request(app).post('/api/exams').set(bearer(admin)).send({
      name: 'v1.6 主观题冒烟考试',
      paperId,
      departmentIds: ['dept-rd'],
      startTime: new Date(Date.now() - 3600_000).toISOString(),
      endTime: new Date(Date.now() + 3600_000).toISOString(),
      durationMinutes: 30,
      passScore: 60,
      maxAttempts: 1,
    });
    expect(res.body.code).toBe(0);
    examId = res.body.data.id as string;
  });

  it('考生开考并拿到试卷快照（含单选正确选项）', async () => {
    const res = await request(app).post(`/api/exams/${examId}/start`).set(bearer(zhangsan));
    expect(res.body.code).toBe(0);
    recordId = res.body.data.id as string;
    const snap = res.body.data.paperSnapshot.questions as Array<{
      questionId: string;
      question: { type: string; answer: number[] | string[] };
    }>;
    const single = snap.find((q) => q.questionId === 'q-01');
    expect(single).toBeDefined();
    singleAnswer = single!.question.answer as number[];
    expect(singleAnswer.length).toBeGreaterThan(0);
  });

  it('考生作答：单选正确 + 填空大小写/空白不敏感命中 + 简答作答', async () => {
    const res = await request(app)
      .put(`/api/records/${recordId}/answers`)
      .set(bearer(zhangsan))
      .send({
        answers: {
          'q-01': singleAnswer,
          [fillId]: ['  tls ', 'TRANSPORT'], // trim + 忽略大小写 → 命中
          [shortId]: ['先不点击链接，再上报安全团队，最后删除该邮件。'],
        },
      });
    expect(res.body.code).toBe(0);
  });

  it('交卷 → 含简答题转 pending_review，客观 + 填空先行计分（40 + 30 = 70）', async () => {
    const res = await request(app)
      .post(`/api/records/${recordId}/submit`)
      .set(bearer(zhangsan))
      .send({});
    expect(res.body.code).toBe(0);
    expect(res.body.data.status).toBe('pending_review');
    expect(res.body.data.score).toBe(70);
  });

  it('交卷后再次开考被拒（待阅卷也计入已用次数，不可绕过 maxAttempts）', async () => {
    const res = await request(app).post(`/api/exams/${examId}/start`).set(bearer(zhangsan));
    expect(res.body.code).toBe(1008);
  });

  it('待阅卷列表包含该记录，且携带作答与快照（供阅卷渲染）', async () => {
    const res = await request(app).get('/api/records/pending').set(bearer(author));
    expect(res.body.code).toBe(0);
    const list = res.body.data.list as Array<{
      id: string;
      answers: Record<string, unknown>;
      paperSnapshot: { questions: unknown[] };
    }>;
    const item = list.find((r) => r.id === recordId);
    expect(item).toBeDefined();
    expect(item!.paperSnapshot.questions.length).toBe(3);
    expect(item!.answers[fillId]).toBeDefined();
  });

  it('考生 Token 访问待阅卷列表 → 403', async () => {
    const res = await request(app).get('/api/records/pending').set(bearer(zhangsan));
    expect(res.status).toBe(403);
  });

  it('简答打分超出该题分值 → 1001', async () => {
    const res = await request(app)
      .put(`/api/records/${recordId}/review`)
      .set(bearer(author))
      .send({ subjectiveScores: { [shortId]: 999 } });
    expect(res.body.code).toBe(1001);
  });

  it('出题人阅卷：简答给 25 分 → 总分 70 + 25 = 95，状态转 submitted', async () => {
    const res = await request(app)
      .put(`/api/records/${recordId}/review`)
      .set(bearer(author))
      .send({ subjectiveScores: { [shortId]: 25 } });
    expect(res.body.code).toBe(0);
    expect(res.body.data.status).toBe('submitted');
    expect(res.body.data.score).toBe(95);
  });

  it('考生查看成绩明细：终评 95 + 主观题得分可见', async () => {
    const res = await request(app).get(`/api/records/${recordId}`).set(bearer(zhangsan));
    expect(res.body.code).toBe(0);
    expect(res.body.data.score).toBe(95);
    expect(res.body.data.status).toBe('submitted');
    expect((res.body.data.subjectiveScores as Record<string, number>)[shortId]).toBe(25);
  });

  it('重复阅卷 → 已不在待阅卷态（1005）', async () => {
    const res = await request(app)
      .put(`/api/records/${recordId}/review`)
      .set(bearer(author))
      .send({ subjectiveScores: { [shortId]: 30 } });
    expect(res.body.code).toBe(1005);
  });

  it('阅卷后待阅卷列表不再包含该记录', async () => {
    const res = await request(app).get('/api/records/pending').set(bearer(author));
    expect(res.body.code).toBe(0);
    const list = res.body.data.list as Array<{ id: string }>;
    expect(list.some((r) => r.id === recordId)).toBe(false);
  });
});

describe('v1.6① 端到端冒烟：切屏事件上报 → 切屏审查', () => {
  let examId = '';
  let recordId = '';

  it('考生开考、上报两次切屏事件后交卷', async () => {
    const exam = await request(app).post('/api/exams').set(bearer(admin)).send({
      name: 'v1.6 切屏冒烟考试',
      paperId: 'paper-demo',
      departmentIds: ['dept-rd'],
      startTime: new Date(Date.now() - 3600_000).toISOString(),
      endTime: new Date(Date.now() + 3600_000).toISOString(),
      durationMinutes: 30,
      passScore: 60,
      maxAttempts: 1,
    });
    expect(exam.body.code).toBe(0);
    examId = exam.body.data.id as string;

    const start = await request(app).post(`/api/exams/${examId}/start`).set(bearer(zhangsan));
    expect(start.body.code).toBe(0);
    recordId = start.body.data.id as string;

    await request(app)
      .post(`/api/records/${recordId}/cheat-events`)
      .set(bearer(zhangsan))
      .send({ awaySeconds: 12 });
    await request(app)
      .post(`/api/records/${recordId}/cheat-events`)
      .set(bearer(zhangsan))
      .send({ awaySeconds: 8 });

    const submit = await request(app).post(`/api/records/${recordId}/submit`).set(bearer(zhangsan)).send({});
    expect(submit.body.code).toBe(0);
  });

  it('管理员切屏审查返回该记录及事件明细（两条、按离开秒数）', async () => {
    const res = await request(app).get('/api/records/cheat').set(bearer(admin)).query({ examId });
    expect(res.body.code).toBe(0);
    const list = res.body.data as Array<{
      id: string;
      cheatEvents: Array<{ at: string; awaySeconds: number }>;
    }>;
    const item = list.find((r) => r.id === recordId);
    expect(item).toBeDefined();
    expect(item!.cheatEvents.length).toBe(2);
    expect(item!.cheatEvents[0].awaySeconds).toBeGreaterThan(0);
  });

  it('出题人访问切屏审查 → 403（仅 admin）', async () => {
    const res = await request(app).get('/api/records/cheat').set(bearer(author)).query({ examId });
    expect(res.status).toBe(403);
  });
});
