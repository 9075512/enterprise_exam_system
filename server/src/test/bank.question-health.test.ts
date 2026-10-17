/**
 * 题库「题目级健康度」（v3.3）—— 集成测试。
 *
 * 背景：设计稿 `pages/bank-detail.html` 顶部含「平均正确率 / 待完善」统计卡、表格含「正确率」列；
 * 此前因后端无对应接口被标注为数据缺口。本次以 `practice_answers`（练题作答明细）实时聚合补齐：
 *  - `GET /api/banks/:id/question-stats`：题型分布 / 平均正确率 / 待完善口径；
 *  - `GET /api/banks/:id/questions`：每题 `correctRate`（无作答 → null）。
 *
 * 本文件护栏：
 *  1) 无练题作答时 `avgCorrectRate` = null，题目 `correctRate` = null（不造数）；
 *  2) 「待完善」口径 = 缺解析 ∪ 未设知识点（并集去重），拆分计数正确；
 *  3) 作答后正确率按 (正确数 / 作答数) 精确聚合（保留 1 位小数），题型分布计数正确；
 *  4) 鉴权：考生（examinee）访问 → 1003；不存在题库 → 1004。
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';

import { app } from '../app.js';
import { prepareTestDb } from './db.js';
import { closePool, query } from '../db/pool.js';
import { nowDb } from '../utils/datetime.js';
import type { BankQuestionStatsDto, Page, QuestionDto } from '../types/domain.js';

const bearer = (token: string): Record<string, string> => ({ Authorization: `Bearer ${token}` });

/** 内网登录，返回 token。 */
async function internalLogin(username: string, password: string): Promise<string> {
  const res = await request(app).post('/api/auth/login').send({ username, password });
  expect(res.body.code, JSON.stringify(res.body)).toBe(0);
  return (res.body.data.token ?? res.body.data.accessToken) as string;
}

let adminToken = '';

/** 新建题目（admin），返回 id。 */
async function createQuestion(payload: Record<string, unknown>): Promise<string> {
  const res = await request(app).post('/api/questions').set(bearer(adminToken)).send(payload);
  expect(res.body.code, JSON.stringify(res.body)).toBe(0);
  return res.body.data.id as string;
}

/** 读取题库健康度统计。 */
async function fetchStats(bankId: string, token = adminToken): Promise<request.Response> {
  return request(app).get(`/api/banks/${bankId}/question-stats`).set(bearer(token));
}

/** 读取题库内试题列表。 */
async function fetchQuestions(bankId: string): Promise<QuestionDto[]> {
  const res = await request(app).get(`/api/banks/${bankId}/questions`).set(bearer(adminToken));
  expect(res.body.code, JSON.stringify(res.body)).toBe(0);
  return (res.body.data as Page<QuestionDto>).list;
}

/** 直接写入一条练题作答明细（绕过练题端流程，聚焦聚合口径）。 */
async function insertPracticeAnswer(
  id: string,
  questionId: string,
  isCorrect: boolean,
): Promise<void> {
  await query(
    `INSERT INTO practice_answers (id, user_id, question_id, answer, is_correct, answered_at)
     VALUES (?, 'user-zhangsan', ?, ?, ?, ?)`,
    [id, questionId, JSON.stringify([0]), isCorrect ? 1 : 0, nowDb()],
  );
}

let bankId = '';
let qComplete = ''; // 有解析 + 有知识点
let qNoAnalysis = ''; // 缺解析 + 有知识点
let qNoTags = ''; // 有解析 + 无知识点

beforeAll(async () => {
  await prepareTestDb();
  adminToken = await internalLogin('admin', 'admin123');

  const bankRes = await request(app)
    .post('/api/banks')
    .set(bearer(adminToken))
    .send({ name: '健康度测试题库', description: '', allowPractice: true });
  expect(bankRes.body.code, JSON.stringify(bankRes.body)).toBe(0);
  bankId = bankRes.body.data.id as string;

  qComplete = await createQuestion({
    bankId,
    type: 'single',
    stem: '完整题目（有解析有知识点）',
    options: ['A', 'B'],
    answer: [0],
    analysis: '这是解析',
    subject: '安全知识',
    tags: ['安全生产法'],
  });
  qNoAnalysis = await createQuestion({
    bankId,
    type: 'judge',
    stem: '缺解析题目',
    answer: [0],
    analysis: '',
    subject: '安全知识',
    tags: ['隐患排查'],
  });
  qNoTags = await createQuestion({
    bankId,
    type: 'multiple',
    stem: '缺知识点题目',
    options: ['A', 'B', 'C'],
    answer: [0, 1],
    analysis: '这是解析',
    subject: '安全知识',
    tags: [],
  });
}, 60_000);

afterAll(async () => {
  await closePool();
});

describe('v3.3 题库题目健康度统计', () => {
  it('无练题作答：平均正确率为 null，题目正确率均为 null（不造数）', async () => {
    const res = await fetchStats(bankId);
    expect(res.body.code, JSON.stringify(res.body)).toBe(0);
    const data = res.body.data as BankQuestionStatsDto;

    expect(data.total).toBe(3);
    expect(data.byType).toEqual({ single: 1, multiple: 1, judge: 1, fill: 0, short: 0 });
    expect(data.avgCorrectRate).toBeNull();
    expect(data.answeredCount).toBe(0);

    const list = await fetchQuestions(bankId);
    expect(list).toHaveLength(3);
    for (const q of list) {
      expect(q.correctRate).toBeNull();
    }
  });

  it('待完善口径 = 缺解析 ∪ 未设知识点（并集去重）', async () => {
    const res = await fetchStats(bankId);
    const data = res.body.data as BankQuestionStatsDto;
    expect(data.incompleteCount).toBe(2); // 缺解析 + 缺知识点（两题不重叠）
    expect(data.missingAnalysisCount).toBe(1);
    expect(data.missingTagsCount).toBe(1);
  });

  it('作答后按 (正确数 / 作答数) 精确聚合，保留 1 位小数', async () => {
    // qComplete：对、对、错 → 2/3 = 66.7%；qNoAnalysis：错 → 0%
    await insertPracticeAnswer('pa-qa-1', qComplete, true);
    await insertPracticeAnswer('pa-qa-2', qComplete, true);
    await insertPracticeAnswer('pa-qa-3', qComplete, false);
    await insertPracticeAnswer('pa-qa-4', qNoAnalysis, false);

    const res = await fetchStats(bankId);
    expect(res.body.code, JSON.stringify(res.body)).toBe(0);
    const data = res.body.data as BankQuestionStatsDto;

    // 全库加权：(2 正确) / (4 作答) = 50.0%
    expect(data.avgCorrectRate).toBe(50);
    expect(data.answeredCount).toBe(2);

    const list = await fetchQuestions(bankId);
    const byId = new Map(list.map((q) => [q.id, q]));
    expect(byId.get(qComplete)?.correctRate).toBe(66.7);
    expect(byId.get(qNoAnalysis)?.correctRate).toBe(0);
    expect(byId.get(qNoTags)?.correctRate).toBeNull(); // 仍无作答
  });

  it('鉴权：考生访问 → 1003；不存在题库 → 1004', async () => {
    const examineeToken = await internalLogin('zhangsan', '123456');
    const denied = await fetchStats(bankId, examineeToken);
    expect(denied.body.code).toBe(1003);

    const missing = await fetchStats('bank-not-exist');
    expect(missing.body.code).toBe(1004);
  });
});
