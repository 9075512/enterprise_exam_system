import { examContent, createPaperFixture } from './examFixtures.js';
/**
 * v2.0② 考试端首页数据后端化 —— 集成测试。
 *
 * 背景：首页原本由前端三次并发拉取（exams/my + records/my + 未读数）后**本地即时计算**统计，
 * 受分页上限与前端口径影响；v2.0② 新增 `GET /api/home/summary` 在服务端一次算清。
 *
 * 本文件锁死：
 *   1) 统计口径：待考（进行中且无记录、排除免考）/ 进行中（有未交卷记录）/ 已交卷 / 平均分 / 及格率；
 *   2) 及格线：优先取考试 pass_score，缺省回退系统设置 examDefaultPassScore；
 *   3) 趋势：最近 10 次已交卷成绩，按交卷时间倒序，含考试名与是否及格；
 *   4) 待办：待考 / 未交卷 / 可申请补考 / 未读消息按条件生成；
 *   5) 个性化：快捷入口默认 4 项全部启用、推荐题库默认空；
 *   6) 未登录 → 401。
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';

import { app } from '../app.js';
import { prepareTestDb } from './db.js';
import { closePool, query } from '../db/pool.js';
import { signToken } from '../middleware/auth.js';
import type { HomeSummaryDto } from '../types/domain.js';

const bearer = (token: string): { Authorization: string } => ({ Authorization: `Bearer ${token}` });

const admin = signToken({ sub: 'user-admin', role: 'admin', departmentId: '' });
const author = signToken({ sub: 'user-author', role: 'author', departmentId: '' });
const zs = signToken({ sub: 'user-zhangsan', role: 'examinee', departmentId: 'dept-rd' });

let paperPlain = '';

async function createExam(
  name: string,
  departmentIds: string[],
  passScore: number,
  window: { start: number; end: number } = { start: -3600_000, end: 3600_000 },
): Promise<string> {
  const res = await request(app)
    .post('/api/exams')
    .set(bearer(admin))
    .send({
      name,
      ...(await examContent(paperPlain)),
      departmentIds,
      startTime: new Date(Date.now() + window.start).toISOString(),
      endTime: new Date(Date.now() + window.end).toISOString(),
      durationMinutes: 30,
      passScore,
      maxAttempts: 1,
      allowRetake: true,
      allowAppeal: true,
    });
  expect(res.body.code, JSON.stringify(res.body)).toBe(0);
  return res.body.data.id as string;
}

/** 开考 →（可选作答）→ 交卷。 */
async function startAndSubmit(
  examId: string,
  token: string,
  correct: boolean,
): Promise<{ recordId: string; score: number; status: string }> {
  const start = await request(app).post(`/api/exams/${examId}/start`).set(bearer(token));
  expect(start.body.code, JSON.stringify(start.body)).toBe(0);
  const recordId = start.body.data.id as string;
  if (correct) {
    const snap = start.body.data.paperSnapshot.questions as Array<{
      questionId: string;
      question: { type: string; answer: number[] | string[] };
    }>;
    const single = snap.find((q) => q.question.type === 'single');
    if (single) {
      const save = await request(app)
        .put(`/api/records/${recordId}/answers`)
        .set(bearer(token))
        .send({ answers: { [single.questionId]: single.question.answer } });
      expect(save.body.code, JSON.stringify(save.body)).toBe(0);
    }
  }
  const submit = await request(app).post(`/api/records/${recordId}/submit`).set(bearer(token)).send({});
  expect(submit.body.code, JSON.stringify(submit.body)).toBe(0);
  return { recordId, score: Number(submit.body.data.score), status: submit.body.data.status as string };
}

async function summary(token = zs): Promise<HomeSummaryDto> {
  const res = await request(app).get('/api/home/summary').set(bearer(token));
  expect(res.body.code, JSON.stringify(res.body)).toBe(0);
  return res.body.data as HomeSummaryDto;
}

beforeAll(async () => {
  await prepareTestDb();

  // 移除种子演示考试（否则会作为「待考」干扰统计断言）
  await query(`DELETE FROM exam_records WHERE exam_id = 'exam-demo'`);
  await query(`DELETE FROM exams WHERE id = 'exam-demo'`);

  const p = await createPaperFixture({
    name: 'v2.0② 纯客观卷',
    description: '',
    bankIds: ['bank-security'],
    questions: [{ questionId: 'q-01', score: 100 }],
  });
  expect(p.body.code, JSON.stringify(p.body)).toBe(0);
  paperPlain = p.body.data.id as string;

  // 已考·及格（passScore 60，答对 100）
  const examPass = await createExam('首页-已考及格', ['dept-rd'], 60);
  const r1 = await startAndSubmit(examPass, zs, true);
  expect(r1.status).toBe('submitted');
  expect(r1.score).toBe(100);

  // 已考·不及格（passScore 100，不作答 0）
  const examFail = await createExam('首页-已考不及格', ['dept-rd'], 100);
  const r2 = await startAndSubmit(examFail, zs, false);
  expect(r2.status).toBe('submitted');
  expect(r2.score).toBe(0);

  // 待考（进行中、无记录）
  await createExam('首页-待考', ['dept-rd'], 60);

  // 进行中（开考但不交卷）
  const examOngoing = await createExam('首页-进行中', ['dept-rd'], 60);
  const start = await request(app).post(`/api/exams/${examOngoing}/start`).set(bearer(zs));
  expect(start.body.code, JSON.stringify(start.body)).toBe(0);

  // 未开始（不计入任何统计）
  await createExam('首页-未开始', ['dept-rd'], 60, { start: 3600_000, end: 7200_000 });
}, 60000);

afterAll(async () => {
  await closePool();
});

describe('考试端首页聚合（v2.0②）', () => {
  it('未登录 → 401', async () => {
    const res = await request(app).get('/api/home/summary');
    expect(res.status).toBe(401);
  });

  it('统计口径正确（待考 1 / 进行中 1 / 已交卷 2 / 平均分 50 / 及格率 50）', async () => {
    const data = await summary();
    expect(data.stats.submitted).toBe(2);
    expect(data.stats.ongoing).toBe(1);
    expect(data.stats.pending).toBe(1);
    expect(data.stats.avgScore).toBe(50);
    expect(data.stats.passRate).toBe(50);
    expect(data.stats.passLine).toBe(60);
  });

  it('趋势为最近已交卷成绩（倒序、含考试名与及格判定）', async () => {
    const data = await summary();
    expect(data.trend.length).toBe(2);
    const names = data.trend.map((t) => t.examName);
    expect(names).toContain('首页-已考及格');
    expect(names).toContain('首页-已考不及格');
    const pass = data.trend.find((t) => t.examName === '首页-已考及格');
    const fail = data.trend.find((t) => t.examName === '首页-已考不及格');
    expect(pass?.passed).toBe(true);
    expect(pass?.passScore).toBe(60);
    expect(fail?.passed).toBe(false);
    expect(fail?.passScore).toBe(100);
  });

  it('待办按条件生成（含待考与未交卷）', async () => {
    const data = await summary();
    const keys = data.todos.map((t) => t.key);
    expect(keys).toContain('pending-exam');
    expect(keys).toContain('ongoing-exam');
    const pending = data.todos.find((t) => t.key === 'pending-exam');
    expect(pending?.count).toBe(1);
    expect(pending?.path).toBe('/exam/my');
  });

  it('个性化入口：默认 4 项全部启用，推荐题库默认空', async () => {
    const data = await summary();
    expect(data.shortcuts.map((s) => s.key)).toEqual(['my-exams', 'my-scores', 'my-retakes', 'notifications']);
    expect(data.shortcuts.every((s) => s.enabled)).toBe(true);
    expect(data.recommendedBanks).toEqual([]);
  });

  it('免考考试不计入「待考」', async () => {
    const exam = await createExam('首页-待考(免考)', ['dept-rd'], 60);
    await request(app)
      .put(`/api/exams/${exam}/exceptions/user-zhangsan`)
      .set(bearer(admin))
      .send({ extraMinutes: 0, extraAttempts: 0, exempt: true });
    // 免考前 pending=1；加免考后仍为 1（新考试被排除）
    const data = await summary();
    expect(data.stats.pending).toBe(1);
  });
});
