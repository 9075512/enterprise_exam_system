import { examContent, createPaperFixture } from './examFixtures.js';
/**
 * 补考资格边界 —— 集成测试（2026-10-15 放开次数限制后新增）。
 *
 * 规则演进：
 *   - 原：仅 `maxAttempts === 1` 的考试可补考（多次作答的考试用尽次数后反无补考入口）；
 *   - 现：`allowRetake && 未及格 && 答题次数已用尽 && 无有效申请 && 无进行中作答`。
 *
 * 本文件锁死新口径的三条边界：
 *  1) 次数**未**用尽 → 不显示补考入口，且申请接口拒绝（1001）；
 *  2) 次数用尽 → 可申请，走通全流程；
 *  3) 上限口径含「特殊安排」的额外次数（extraAttempts），不是裸 maxAttempts；
 *  4) 已及格者即使次数用尽也不可申请（回归保护）。
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

/** 纯客观卷（单选 100 分；不作答即 0 分） */
let paper = '';

/** E1：maxAttempts=2（次数未用尽 → 不可申请；用尽 → 可申请） */
let examTwo = '';
/** E2：maxAttempts=1 + 特殊安排 extraAttempts=1（上限应为 2） */
let examExtra = '';
/** E3：maxAttempts=1 且考生答对（已及格，回归保护） */
let examPassed = '';

/** 管理员新建考试。 */
async function createExam(name: string, departmentIds: string[], passScore: number, maxAttempts: number): Promise<string> {
  const res = await request(app)
    .post('/api/exams')
    .set(bearer(admin))
    .send({
      name,
      ...(await examContent(paper)),
      departmentIds,
      startTime: new Date(Date.now() - 3600_000).toISOString(),
      endTime: new Date(Date.now() + 3600_000).toISOString(),
      durationMinutes: 30,
      passScore,
      maxAttempts,
      allowRetake: true,
      allowAppeal: false,
    });
  expect(res.body.code, JSON.stringify(res.body)).toBe(0);
  return res.body.data.id as string;
}

/** 开考并交卷；`correct=true` 时选中正确答案。 */
async function startAndSubmit(examId: string, token: string, correct = false): Promise<{ score: number }> {
  const start = await request(app).post(`/api/exams/${examId}/start`).set(bearer(token));
  expect(start.body.code, JSON.stringify(start.body)).toBe(0);
  const recordId = start.body.data.id as string;

  if (correct) {
    const snap = start.body.data.paperSnapshot.questions as Array<{
      questionId: string;
      question: { type: string; answer: number[] };
    }>;
    const single = snap.find((q) => q.question.type === 'single')!;
    const save = await request(app)
      .put(`/api/records/${recordId}/answers`)
      .set(bearer(token))
      .send({ answers: { [single.questionId]: single.question.answer } });
    expect(save.body.code, JSON.stringify(save.body)).toBe(0);
  }

  const submit = await request(app).post(`/api/records/${recordId}/submit`).set(bearer(token)).send({});
  expect(submit.body.code, JSON.stringify(submit.body)).toBe(0);
  return { score: Number(submit.body.data.score) };
}

/** 取考生视角的某场考试（含 canApplyRetake / attemptsUsed）。 */
async function myExamOf(examId: string, token: string): Promise<Record<string, unknown>> {
  const res = await request(app).get('/api/exams/my').set(bearer(token));
  expect(res.body.code, JSON.stringify(res.body)).toBe(0);
  const found = (res.body.data as Record<string, unknown>[]).find((e) => e.id === examId);
  expect(found, `未找到考试 ${examId}`).toBeTruthy();
  return found!;
}

/** 考生申请补考。 */
async function applyRetake(examId: string, token: string): Promise<{ code: number; message: string }> {
  const res = await request(app)
    .post('/api/retakes/apply')
    .set(bearer(token))
    .send({ examId, reason: '自动化测试：次数校验' });
  return { code: res.body.code as number, message: res.body.message as string };
}

beforeAll(async () => {
  await prepareTestDb();

  // 纯客观卷：单选 100 分（及格线设 100 → 不作答即不及格）
  const p = await createPaperFixture({
    name: '补考资格边界卷',
    description: '',
    bankIds: ['bank-security'],
    questions: [{ questionId: 'q-01', score: 100 }],
  });
  expect(p.body.code, JSON.stringify(p.body)).toBe(0);
  paper = p.body.data.id as string;

  examTwo = await createExam('补考边界-两次作答', ['dept-rd'], 100, 2);
  examExtra = await createExam('补考边界-含额外次数', ['dept-mkt'], 100, 1);
  examPassed = await createExam('补考边界-已及格', ['dept-rd'], 60, 1);

  // 市场部考生额外 1 次（总上限 = 1 + 1 = 2）
  const ex = await request(app)
    .put(`/api/exams/${examExtra}/exceptions/user-lisi`)
    .set(bearer(admin))
    .send({ extraMinutes: 0, extraAttempts: 1, exempt: false, note: '测试：额外一次' });
  expect(ex.body.code, JSON.stringify(ex.body)).toBe(0);
});

afterAll(async () => {
  await closePool();
});

describe('补考资格：次数未用尽不可申请', () => {
  it('maxAttempts=2 只考 1 次（0 分）→ canApplyRetake=false，申请被拒 1001', async () => {
    const r = await startAndSubmit(examTwo, zs);
    expect(r.score).toBe(0);

    const mine = await myExamOf(examTwo, zs);
    expect(mine.attemptsUsed).toBe(1);
    expect(mine.maxAttempts).toBe(2);
    expect(mine.canApplyRetake).toBe(false);

    const apply = await applyRetake(examTwo, zs);
    expect(apply.code).toBe(1001);
    expect(apply.message).toContain('尚未用完');
  });

  it('用尽第 2 次后 → canApplyRetake=true，申请成功', async () => {
    await startAndSubmit(examTwo, zs);

    const mine = await myExamOf(examTwo, zs);
    expect(mine.attemptsUsed).toBe(2);
    expect(mine.canApplyRetake).toBe(true);

    const apply = await applyRetake(examTwo, zs);
    expect(apply.code, JSON.stringify(apply)).toBe(0);
  });

  it('已提交申请 → canApplyRetake=false（不重复入口）', async () => {
    const mine = await myExamOf(examTwo, zs);
    expect(mine.canApplyRetake).toBe(false);
  });
});

describe('补考资格：上限含特殊安排的额外次数', () => {
  it('maxAttempts=1 + extraAttempts=1，只考 1 次 → 仍不可申请', async () => {
    await startAndSubmit(examExtra, ls);

    const mine = await myExamOf(examExtra, ls);
    expect(mine.attemptsUsed).toBe(1);
    expect(mine.canApplyRetake).toBe(false);

    const apply = await applyRetake(examExtra, ls);
    expect(apply.code).toBe(1001);
    expect(apply.message).toContain('尚未用完');
  });

  it('用尽额外那一次后 → 可申请', async () => {
    await startAndSubmit(examExtra, ls);

    const mine = await myExamOf(examExtra, ls);
    expect(mine.attemptsUsed).toBe(2);
    expect(mine.canApplyRetake).toBe(true);
  });
});

describe('补考资格：已及格不可申请（回归保护）', () => {
  it('答对得满分且次数用尽 → canApplyRetake 仍为 false，申请提示「已及格」', async () => {
    const r = await startAndSubmit(examPassed, zs, true);
    expect(r.score).toBe(100);

    const mine = await myExamOf(examPassed, zs);
    expect(mine.attemptsUsed).toBe(1);
    expect(mine.canApplyRetake).toBe(false);

    const apply = await applyRetake(examPassed, zs);
    expect(apply.code).toBe(1001);
    expect(apply.message).toContain('已及格');
  });
});
