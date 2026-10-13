/**
 * v1.9④ 考务队列按「考试维度」打通 —— 集成测试。
 *
 * 背景：补考管理 / 成绩复核 / 人工阅卷三张考务队列原先只能全局浏览，
 * 与「考试管理」是断开的；本次为三者的列表接口补上可选 `examId` 过滤，
 * 并让前端支持 `?examId=` 直达。本文件锁死后端口径：
 *   1) 三张队列在带 / 不带 `examId` 时都能正确收窄，且 `total` 与 `list` 同步收窄
 *      （分页统计与列表必须同源，否则会出现「第 1 页空、total=5」的错位）；
 *   2) `?examId=` 为空串等价于不过滤（前端清空选择器时会残留空串，不应 400）；
 *   3) 不存在的 examId → 200 空列表（列表查询不做存在性校验，避免多一次往返）；
 *   4) 原有分页校验与角色隔离不因新参数而变化。
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
/** 研发部考生 */
const zs = signToken({ sub: 'user-zhangsan', role: 'examinee', departmentId: 'dept-rd' });
/** 市场部考生 */
const ls = signToken({ sub: 'user-lisi', role: 'examinee', departmentId: 'dept-mkt' });

/** 含简答题的试卷（客观 40 + 主观 30 = 70） */
let paperShort = '';
/** 纯客观试卷（100 分，便于「答 0 分」构造可申请补考/复核的成绩） */
let paperPlain = '';
let shortQuestionId = '';

/** 四场考试：A/B 用于待阅卷，C/D 用于补考与复核 */
let examA = '';
let examB = '';
let examC = '';
let examD = '';

/** 待阅卷记录（A：张三，B：李四） */
let pendingRecordA = '';
let pendingRecordB = '';
/** 已出成绩记录（C：张三，D：李四） */
let submittedRecordC = '';
let submittedRecordD = '';

/** 管理员新建考试。 */
async function createExam(
  name: string,
  paperId: string,
  departmentIds: string[],
  passScore: number,
): Promise<string> {
  const res = await request(app)
    .post('/api/exams')
    .set(bearer(admin))
    .send({
      name,
      paperId,
      departmentIds,
      startTime: new Date(Date.now() - 3600_000).toISOString(),
      endTime: new Date(Date.now() + 3600_000).toISOString(),
      durationMinutes: 30,
      passScore,
      maxAttempts: 1,
      allowRetake: true,
      allowAppeal: true,
    });
  expect(res.body.code, JSON.stringify(res.body)).toBe(0);
  return res.body.data.id as string;
}

/** 开考 →（可选作答）→ 交卷，返回 recordId 与交卷结果。 */
async function startAndSubmit(
  examId: string,
  token: string,
  answers: Record<string, unknown> = {},
): Promise<{ recordId: string; status: string; score: number }> {
  const start = await request(app).post(`/api/exams/${examId}/start`).set(bearer(token));
  expect(start.body.code, JSON.stringify(start.body)).toBe(0);
  const recordId = start.body.data.id as string;

  // 取快照里的单选正确答案（纯客观卷用），保证「答对」而不是靠猜
  const snap = start.body.data.paperSnapshot.questions as Array<{
    questionId: string;
    question: { type: string; answer: number[] | string[] };
  }>;
  const single = snap.find((q) => q.question.type === 'single');
  const payload: Record<string, unknown> = { ...answers };
  if (Object.keys(payload).length === 0 && single) {
    payload[single.questionId] = single.question.answer;
  }
  if (Object.keys(payload).length > 0) {
    const save = await request(app).put(`/api/records/${recordId}/answers`).set(bearer(token)).send({ answers: payload });
    expect(save.body.code, JSON.stringify(save.body)).toBe(0);
  }

  const submit = await request(app).post(`/api/records/${recordId}/submit`).set(bearer(token)).send({});
  expect(submit.body.code, JSON.stringify(submit.body)).toBe(0);
  return {
    recordId,
    status: submit.body.data.status as string,
    score: Number(submit.body.data.score),
  };
}

/** 取列表接口的数据体。 */
async function listOf(
  url: string,
  token: string,
  query: Record<string, string | number> = {},
): Promise<{ list: Record<string, unknown>[]; total: number }> {
  const res = await request(app).get(url).set(bearer(token)).query(query);
  expect(res.body.code, `${url} ${JSON.stringify(res.body)}`).toBe(0);
  return res.body.data as { list: Record<string, unknown>[]; total: number };
}

beforeAll(async () => {
  await prepareTestDb();

  // 1) 出题人建一道简答题（供含主观题的试卷使用）
  const q = await request(app).post('/api/questions').set(bearer(author)).send({
    bankId: 'bank-security',
    type: 'short',
    stem: '请简述收到疑似钓鱼邮件时的处置流程。',
    options: [],
    answer: ['不点击链接；上报安全团队；删除邮件。'],
    defaultScore: 30,
    subject: '安全知识',
  });
  expect(q.body.code, JSON.stringify(q.body)).toBe(0);
  shortQuestionId = q.body.data.id as string;

  // 2) 含简答卷：单选 40 + 简答 30 = 70
  const pShort = await request(app).post('/api/papers').set(bearer(author)).send({
    name: 'v1.9④ 含简答卷',
    description: '',
    bankIds: ['bank-security'],
    questions: [
      { questionId: 'q-01', score: 40 },
      { questionId: shortQuestionId, score: 30 },
    ],
  });
  expect(pShort.body.code, JSON.stringify(pShort.body)).toBe(0);
  paperShort = pShort.body.data.id as string;

  // 3) 纯客观卷：单选 100（及格线设 100 → 答 0 分即可申请补考）
  const pPlain = await request(app).post('/api/papers').set(bearer(author)).send({
    name: 'v1.9④ 纯客观卷',
    description: '',
    bankIds: ['bank-security'],
    questions: [{ questionId: 'q-01', score: 100 }],
  });
  expect(pPlain.body.code, JSON.stringify(pPlain.body)).toBe(0);
  paperPlain = pPlain.body.data.id as string;

  // 4) 四场考试
  examA = await createExam('v1.9④ 考试A（待阅卷-研发）', paperShort, ['dept-rd'], 60);
  examB = await createExam('v1.9④ 考试B（待阅卷-市场）', paperShort, ['dept-mkt'], 60);
  examC = await createExam('v1.9④ 考试C（已出成绩-研发）', paperPlain, ['dept-rd'], 100);
  examD = await createExam('v1.9④ 考试D（已出成绩-市场）', paperPlain, ['dept-mkt'], 100);

  // 5) 造数据
  const rA = await startAndSubmit(examA, zs, { [shortQuestionId]: ['先上报，再删除。'] });
  expect(rA.status).toBe('pending_review');
  pendingRecordA = rA.recordId;

  const rB = await startAndSubmit(examB, ls, { [shortQuestionId]: ['先上报，再删除。'] });
  expect(rB.status).toBe('pending_review');
  pendingRecordB = rB.recordId;

  // 纯客观卷故意不作答 → 0 分（低于及格线 100），可申请补考与复核
  const rC = await startAndSubmit(examC, zs, { 'no-such-question': [] });
  expect(rC.status).toBe('submitted');
  expect(rC.score).toBe(0);
  submittedRecordC = rC.recordId;

  const rD = await startAndSubmit(examD, ls, { 'no-such-question': [] });
  expect(rD.status).toBe('submitted');
  expect(rD.score).toBe(0);
  submittedRecordD = rD.recordId;
}, 60000);

afterAll(async () => {
  await closePool();
});

/* ============================ 1. 待阅卷队列 ============================ */

describe('v1.9④ 待阅卷队列按考试过滤', () => {
  it('不带 examId：A/B 两条待阅卷记录都在', async () => {
    const { list, total } = await listOf('/api/records/pending', author);
    const ids = list.map((r) => r.id);
    expect(ids).toContain(pendingRecordA);
    expect(ids).toContain(pendingRecordB);
    expect(total).toBeGreaterThanOrEqual(2);
  });

  it('带 examId=A：只返回 A 的记录，且 total 与 list 同步收窄', async () => {
    const { list, total } = await listOf('/api/records/pending', author, { examId: examA });
    expect(total).toBe(1);
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe(pendingRecordA);
    expect(list[0].examId).toBe(examA);
    // 阅卷页渲染需要考试名与快照
    expect(list[0].examName).toBe('v1.9④ 考试A（待阅卷-研发）');
  });

  it('带 examId=B：只返回 B 的记录', async () => {
    const { list, total } = await listOf('/api/records/pending', author, { examId: examB });
    expect(total).toBe(1);
    expect(list[0].id).toBe(pendingRecordB);
  });

  it('带已出成绩的考试 C：无待阅卷记录 → 空列表且 total=0', async () => {
    const { list, total } = await listOf('/api/records/pending', author, { examId: examC });
    expect(total).toBe(0);
    expect(list).toEqual([]);
  });

  it('admin 同样可按考试过滤', async () => {
    const { list } = await listOf('/api/records/pending', admin, { examId: examA });
    expect(list.map((r) => r.id)).toEqual([pendingRecordA]);
  });
});

/* ============================ 2. 补考队列 ============================ */

describe('v1.9④ 补考队列按考试过滤', () => {
  beforeAll(async () => {
    // 张三对 C 申请补考；李四对 D 申请补考（均为 0 分、低于及格线）
    const a1 = await request(app)
      .post('/api/retakes/apply')
      .set(bearer(zs))
      .send({ examId: examC, reason: '网络异常导致未能作答' });
    expect(a1.body.code, JSON.stringify(a1.body)).toBe(0);
    const a2 = await request(app)
      .post('/api/retakes/apply')
      .set(bearer(ls))
      .send({ examId: examD, reason: '设备故障' });
    expect(a2.body.code, JSON.stringify(a2.body)).toBe(0);
  });

  it('不带 examId：两条申请都在', async () => {
    const { list, total } = await listOf('/api/retakes', admin);
    expect(total).toBe(2);
    expect(list.map((r) => r.examId).sort()).toEqual([examC, examD].sort());
  });

  it('带 examId=C：只返回 C 的申请，total 同步收窄', async () => {
    const { list, total } = await listOf('/api/retakes', admin, { examId: examC });
    expect(total).toBe(1);
    expect(list).toHaveLength(1);
    expect(list[0].examId).toBe(examC);
    expect(list[0].userName).toBe('张三');
  });

  it('examId 与 status 组合过滤（C + pending 命中，C + approved 为空）', async () => {
    const pending = await listOf('/api/retakes', admin, { examId: examC, status: 'pending' });
    expect(pending.total).toBe(1);
    const approved = await listOf('/api/retakes', admin, { examId: examC, status: 'approved' });
    expect(approved.total).toBe(0);
    expect(approved.list).toEqual([]);
  });

  it('带 examId 的考试无补考申请 → 空列表', async () => {
    const { list, total } = await listOf('/api/retakes', admin, { examId: examA });
    expect(total).toBe(0);
    expect(list).toEqual([]);
  });
});

/* ============================ 3. 成绩复核队列 ============================ */

describe('v1.9④ 复核队列按考试过滤', () => {
  beforeAll(async () => {
    const a1 = await request(app)
      .post('/api/appeals/apply')
      .set(bearer(zs))
      .send({ recordId: submittedRecordC, reason: '主观题漏判' });
    expect(a1.body.code, JSON.stringify(a1.body)).toBe(0);
    const a2 = await request(app)
      .post('/api/appeals/apply')
      .set(bearer(ls))
      .send({ recordId: submittedRecordD, reason: '分数异常' });
    expect(a2.body.code, JSON.stringify(a2.body)).toBe(0);
  });

  it('不带 examId：两条申请都在', async () => {
    const { list, total } = await listOf('/api/appeals', admin);
    expect(total).toBe(2);
    expect(list.map((r) => r.examId).sort()).toEqual([examC, examD].sort());
  });

  it('带 examId=D：只返回 D 的申请，且携带 recordId 供改分', async () => {
    const { list, total } = await listOf('/api/appeals', admin, { examId: examD });
    expect(total).toBe(1);
    expect(list[0].examId).toBe(examD);
    expect(list[0].recordId).toBe(submittedRecordD);
  });

  it('带 examId 的考试无复核申请 → 空列表', async () => {
    const { list, total } = await listOf('/api/appeals', admin, { examId: examB });
    expect(total).toBe(0);
    expect(list).toEqual([]);
  });
});

/* ============================ 4. 参数健壮性与权限不变式 ============================ */

describe('v1.9④ examId 参数健壮性', () => {
  it('三个队列：examId 为空串等价于不过滤（不 400）', async () => {
    const cases: Array<[string, string]> = [
      ['/api/records/pending', author],
      ['/api/retakes', admin],
      ['/api/appeals', admin],
    ];
    for (const [url, token] of cases) {
      const plain = await listOf(url, token);
      const empty = await listOf(url, token, { examId: '' });
      expect(empty.total, url).toBe(plain.total);
      expect(empty.list.length, url).toBe(plain.list.length);
    }
  });

  it('三个队列：不存在的 examId → 200 空列表（列表查询不做存在性校验）', async () => {
    const cases: Array<[string, string]> = [
      ['/api/records/pending', author],
      ['/api/retakes', admin],
      ['/api/appeals', admin],
    ];
    for (const [url, token] of cases) {
      const { list, total } = await listOf(url, token, { examId: 'exam-not-exist' });
      expect(total, url).toBe(0);
      expect(list, url).toEqual([]);
    }
  });

  it('原有分页校验不被新参数破坏（pageSize=101 → 1001/400）', async () => {
    const cases: Array<[string, string]> = [
      ['/api/records/pending', author],
      ['/api/retakes', admin],
      ['/api/appeals', admin],
    ];
    for (const [url, token] of cases) {
      const res = await request(app).get(url).set(bearer(token)).query({ pageSize: 101, examId: examA });
      expect(res.status, url).toBe(400);
      expect(res.body.code, url).toBe(1001);
    }
  });

  it('角色隔离不因 examId 放宽：考生访问三张队列均 403', async () => {
    for (const url of ['/api/records/pending', '/api/retakes', '/api/appeals']) {
      const res = await request(app).get(url).set(bearer(zs)).query({ examId: examC });
      expect(res.status, url).toBe(403);
    }
  });

  it('未登录访问带 examId 的队列 → 401', async () => {
    const res = await request(app).get('/api/retakes').query({ examId: examC });
    expect(res.status).toBe(401);
    expect(res.body.code).toBe(1002);
  });
});
