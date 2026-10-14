/**
 * 组卷选题池正确率透传（v3.3）—— 集成测试。
 *
 * 背景：组卷页「难度系数（P 值）」以实测正确率优先评估；选题池 `GET /api/questions`
 * 需为当前页每题透传 `correctRate`（练题作答聚合，无作答 → null），与题库详情列表同口径。
 *
 * 护栏：
 *  1) 无作答 → correctRate = null（不造数）；
 *  2) 作答后按 (正确数 / 作答数) 精确聚合，保留 1 位小数；
 *  3) 仅当前页题目参与聚合（一次 IN 批量，不越界）。
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';

import { app } from '../app.js';
import { prepareTestDb } from './db.js';
import { closePool, query } from '../db/pool.js';
import { nowDb } from '../utils/datetime.js';
import type { Page, QuestionDto } from '../types/domain.js';

const bearer = (token: string): Record<string, string> => ({ Authorization: `Bearer ${token}` });

async function internalLogin(username: string, password: string): Promise<string> {
  const res = await request(app).post('/api/auth/login').send({ username, password });
  expect(res.body.code, JSON.stringify(res.body)).toBe(0);
  return (res.body.data.token ?? res.body.data.accessToken) as string;
}

let adminToken = '';
let bankId = '';
let q1 = '';
let q2 = '';
let q3 = '';

async function createQuestion(payload: Record<string, unknown>): Promise<string> {
  const res = await request(app).post('/api/questions').set(bearer(adminToken)).send(payload);
  expect(res.body.code, JSON.stringify(res.body)).toBe(0);
  return res.body.data.id as string;
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

/** 读取组卷选题池（限定测试题库，隔离其他用例数据）。 */
async function fetchPool(bankIdFilter: string): Promise<QuestionDto[]> {
  const res = await request(app)
    .get('/api/questions')
    .query({ bankIds: bankIdFilter, pageSize: 100 })
    .set(bearer(adminToken));
  expect(res.body.code, JSON.stringify(res.body)).toBe(0);
  return (res.body.data as Page<QuestionDto>).list;
}

beforeAll(async () => {
  await prepareTestDb();
  adminToken = await internalLogin('admin', 'admin123');

  const bankRes = await request(app)
    .post('/api/banks')
    .set(bearer(adminToken))
    .send({ name: '选题池正确率测试题库', description: '', category: '安全知识', allowPractice: true });
  expect(bankRes.body.code, JSON.stringify(bankRes.body)).toBe(0);
  bankId = bankRes.body.data.id as string;

  q1 = await createQuestion({ bankId, type: 'single', stem: '池题1', options: ['A', 'B'], answer: [0], subject: '安全知识' });
  q2 = await createQuestion({ bankId, type: 'judge', stem: '池题2', answer: [0], subject: '安全知识' });
  q3 = await createQuestion({ bankId, type: 'multiple', stem: '池题3', options: ['A', 'B', 'C'], answer: [0, 1], subject: '安全知识' });
}, 60_000);

afterAll(async () => {
  await closePool();
});

describe('v3.3 组卷选题池正确率透传', () => {
  it('无作答：每题 correctRate 为 null（不造数）', async () => {
    const list = await fetchPool(bankId);
    expect(list).toHaveLength(3);
    for (const q of list) expect(q.correctRate).toBeNull();
  });

  it('作答后按 (正确数 / 作答数) 精确聚合，保留 1 位小数；未作答题仍为 null', async () => {
    // q1：对、对、错 → 66.7%；q2：对 → 100%
    await insertPracticeAnswer('pa-pool-1', q1, true);
    await insertPracticeAnswer('pa-pool-2', q1, true);
    await insertPracticeAnswer('pa-pool-3', q1, false);
    await insertPracticeAnswer('pa-pool-4', q2, true);

    const list = await fetchPool(bankId);
    const byId = new Map(list.map((q) => [q.id, q]));
    expect(byId.get(q1)?.correctRate).toBe(66.7);
    expect(byId.get(q2)?.correctRate).toBe(100);
    expect(byId.get(q3)?.correctRate).toBeNull();
  });
});
