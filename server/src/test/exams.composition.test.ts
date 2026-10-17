import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { RowDataPacket } from 'mysql2/promise';
import { app } from '../app.js';
import { prepareTestDb } from './db.js';
import { closePool, pool, query } from '../db/pool.js';
import { signToken } from '../middleware/auth.js';
import { toDbDate } from '../utils/datetime.js';
import { RECORD_FULL_COLUMNS } from '../db/recordSource.js';

const header = (id: string, role: 'admin' | 'author' | 'examinee') => ({ Authorization: `Bearer ${signToken({ sub: id, role, departmentId: role === 'examinee' ? 'dept-rd' : '' })}` });
const admin = header('user-admin', 'admin');
const author = header('user-author', 'author');
const student = header('user-zhangsan', 'examinee');
const content = () => ({ bankIds: ['bank-security'], questions: [{ questionId: 'q-01', score: 100 }] });
const input = () => ({ name: '合并流程考试', ...content(), authorIds: ['user-author'], departmentIds: ['dept-rd'],
  startTime: new Date(Date.now() + 3600_000).toISOString(), endTime: new Date(Date.now() + 7200_000).toISOString(), durationMinutes: 30, passScore: 60, maxAttempts: 2 });
async function create(overrides = {}) {
  const payload = { ...input(), ...overrides };
  const res = await request(app).post('/api/exams').set(admin).send(payload);
  expect(res.body.code, JSON.stringify(res.body)).toBe(0);
  return { id: res.body.data.id as string, paperId: res.body.data.paperId as string, payload };
}
async function counts() {
  const rows = await query<RowDataPacket[]>('SELECT (SELECT COUNT(*) FROM exams) AS exams, (SELECT COUNT(*) FROM papers) AS papers, (SELECT COUNT(*) FROM paper_questions) AS questions, (SELECT COUNT(*) FROM exam_authors) AS authors, (SELECT COUNT(*) FROM exam_participants) AS participants');
  return rows[0];
}

beforeAll(prepareTestDb, 30000);
afterAll(closePool);

describe('考试内直接组题', () => {
  it('一次创建考试、独占题目容器、出题人和名单，列表带摘要', async () => {
    const a = await create();
    const b = await create();
    expect(a.paperId).not.toBe(b.paperId);
    const list = await request(app).get('/api/exams').set(admin);
    const row = list.body.data.find((e: { id: string }) => e.id === a.id);
    expect(row).toMatchObject({ questionCount: 1, totalScore: 100, canEditQuestions: true, authors: [{ id: 'user-author', name: '王出题' }] });
    const detail = await request(app).get(`/api/exams/${a.id}/questions`).set(admin);
    expect(detail.body.data.questions).toHaveLength(1);
    const roster = await request(app).get(`/api/exams/${a.id}/participants`).set(admin);
    expect(roster.body.data.map((p: { userId: string }) => p.userId)).toContain('user-zhangsan');
  });

  it('名单解析失败时整笔回滚，不残留内部试卷和题目', async () => {
    const before = await counts();
    const res = await request(app).post('/api/exams').set(admin).send({ ...input(), departmentIds: [], includeUserIds: ['missing-user'] });
    expect(res.status).toBe(400);
    expect(await counts()).toEqual(before);
  });

  it.each([
    { questions: [] }, { questions: [{ questionId: 'q-01', score: 0 }] },
    { questions: [{ questionId: 'q-01', score: 60 }, { questionId: 'q-01', score: 60 }] },
    { questions: [{ questionId: 'q-01', score: 50 }] }, { questions: [{ questionId: 'missing', score: 100 }] },
    { bankIds: ['bank-culture'] }, { authorIds: ['user-zhangsan'] }, { paperId: 'paper-demo' },
  ])('拒绝无效组题或旧 paperId 输入 %j', async override => {
    const before = await counts();
    const res = await request(app).post('/api/exams').set(admin).send({ ...input(), ...override });
    expect(res.body.code).not.toBe(0);
    expect(await counts()).toEqual(before);
  });

  it('删除考试同步清理内部试卷、题目、出题人与名单', async () => {
    const e = await create();
    expect((await request(app).delete(`/api/exams/${e.id}`).set(admin)).body.code).toBe(0);
    const rows = await query<RowDataPacket[]>('SELECT id FROM papers WHERE id = ?', [e.paperId]);
    expect(rows).toHaveLength(0);
    expect((await request(app).get(`/api/exams/${e.id}/questions`).set(admin)).status).toBe(404);
  });

  it('独立试卷 CRUD 与克隆入口已撤下，抽题移至考试域', async () => {
    expect((await request(app).post('/api/papers').set(admin).send({})).status).toBe(404);
    expect((await request(app).put('/api/papers/paper-demo').set(admin).send({})).status).toBe(404);
    expect((await request(app).post('/api/papers/paper-demo/clone').set(admin).send({})).status).toBe(404);
    const draw = await request(app).post('/api/exams/draw-questions').set(author).send({ bankIds: ['bank-security'], rules: { single: { count: 1, score: 100 } } });
    expect(draw.body.code).toBe(0);
    expect(draw.body.data.questions).toHaveLength(1);
  });
});

describe('分配、题库授权与题目锁定', () => {
  it('出题人只见分配考试；能调题分，不能改考务、创建或删除', async () => {
    const e = await create();
    const hidden = await create({ authorIds: [] });
    const list = await request(app).get('/api/exams').set(author);
    expect(list.body.data.map((x: { id: string }) => x.id)).toContain(e.id);
    expect(list.body.data.map((x: { id: string }) => x.id)).not.toContain(hidden.id);
    expect((await request(app).get(`/api/exams/${hidden.id}/questions`).set(author)).status).toBe(403);
    expect((await request(app).get(`/api/exams/${hidden.id}`).set(author)).status).toBe(403);
    expect((await request(app).put(`/api/exams/${e.id}/questions`).set(author).send({ ...content(), questions: [{ questionId: 'q-01', score: 80 }] })).body.code).toBe(0);
    expect((await request(app).put(`/api/exams/${e.id}/questions`).set(author).send({ ...content(), passScore: 20 })).status).toBe(400);
    expect((await request(app).put(`/api/exams/${e.id}/questions`).set(author).send({ ...content(), questions: [{ questionId: 'q-01', score: 50 }] })).status).toBe(400);
    expect((await request(app).put(`/api/exams/${e.id}`).set(author).send(e.payload)).status).toBe(403);
    expect((await request(app).post('/api/exams').set(author).send(input())).status).toBe(403);
    expect((await request(app).delete(`/api/exams/${e.id}`).set(author)).status).toBe(403);
    expect((await request(app).put(`/api/exams/${e.id}`).set(admin).send({ ...e.payload, authorIds: [] })).body.code).toBe(0);
    expect((await request(app).put(`/api/exams/${e.id}/questions`).set(author).send(content())).status).toBe(403);
  });

  it('考生不能读取含答案的管理接口', async () => {
    const e = await create();
    for (const endpoint of ['questions', 'export-pdf']) expect((await request(app).get(`/api/exams/${e.id}/${endpoint}`).set(student)).status).toBe(403);
  });

  it('获分配仍需题库权限，撤销题库授权后不能查看、导出或维护', async () => {
    const e = await create();
    const access = await request(app).get('/api/banks/bank-security/access').set(admin);
    const denied = await request(app).put('/api/banks/bank-security/access').set(admin).send({ permissionMode: 'override', viewAll: false, departmentIds: [], userIds: [], editorIds: [] });
    expect(denied.body.code).toBe(0);
    try {
      const list = await request(app).get('/api/exams').set(author);
      expect(list.body.data.find((x: { id: string }) => x.id === e.id)).toMatchObject({ canReadQuestions: false, canEditQuestions: false });
      for (const endpoint of ['questions', 'export-pdf']) expect((await request(app).get(`/api/exams/${e.id}/${endpoint}`).set(author)).status).toBe(403);
      expect((await request(app).put(`/api/exams/${e.id}/questions`).set(author).send(content())).status).toBe(403);
    } finally {
      const restored = await request(app).put('/api/banks/bank-security/access').set(admin).send(access.body.data);
      expect(restored.body.code).toBe(0);
    }
  });

  it('开始时间到达后锁定题目，后移开始时间不能解锁；其他设置仍可保存', async () => {
    const e = await create({ startTime: new Date(Date.now() - 1000).toISOString() });
    expect((await request(app).put(`/api/exams/${e.id}/questions`).set(author).send(content())).status).toBe(409);
    expect((await request(app).put(`/api/exams/${e.id}`).set(admin).send({ ...e.payload, startTime: new Date(Date.now() + 3600_000).toISOString() })).status).toBe(409);
    expect((await request(app).put(`/api/exams/${e.id}`).set(admin).send({ ...e.payload, passScore: 70, name: '只调整考务' })).body.code).toBe(0);
    expect((await request(app).get(`/api/exams/${e.id}/questions`).set(admin)).body.data.name).toBe('只调整考务');
  });

  it('开考与保存并发时拒绝改题，快照可答题并正常判分', async () => {
    const e = await create({ startTime: new Date(Date.now() - 1000).toISOString() });
    const [start, edit] = await Promise.all([
      request(app).post(`/api/exams/${e.id}/start`).set(student),
      request(app).put(`/api/exams/${e.id}/questions`).set(author).send({ ...content(), questions: [{ questionId: 'q-02', score: 100 }] }),
    ]);
    expect(start.body.code, JSON.stringify(start.body)).toBe(0);
    expect(edit.status).toBe(409);
    expect(start.body.data.paperSnapshot.questions[0].questionId).toBe('q-01');
    const recordId = start.body.data.id;
    expect((await request(app).delete(`/api/exams/${e.id}`).set(admin)).status).toBe(409);
    const answer = start.body.data.paperSnapshot.questions[0].question.answer;
    await request(app).put(`/api/records/${recordId}/answers`).set(student).send({ answers: { 'q-01': answer } });
    const submitted = await request(app).post(`/api/records/${recordId}/submit`).set(student).send({});
    expect(submitted.body.data.score).toBe(100);
  });

  it('保存等待行锁后重新校验时间边界，不能使用等待前的可编辑状态', async () => {
    const e = await create();
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      await conn.query('SELECT id FROM exams WHERE id = ? FOR UPDATE', [e.id]);
      const pending = request(app).put(`/api/exams/${e.id}/questions`).set(author).send(content()).then(r => r);
      await conn.query('UPDATE exams SET start_time = ? WHERE id = ?', [toDbDate(new Date(Date.now() - 1000)), e.id]);
      await conn.commit();
      expect((await pending).status).toBe(409);
    } finally { await conn.rollback(); conn.release(); }
  });

  it('超过连接池容量的并发开考仍能幂等续考，不耗尽连接池', async () => {
    const e = await create({ startTime: new Date(Date.now() - 1000).toISOString() });
    const results = await Promise.all(Array.from({ length: 12 }, () => request(app).post(`/api/exams/${e.id}/start`).set(student)));
    for (const result of results) expect(result.body.code, JSON.stringify(result.body)).toBe(0);
    expect(new Set(results.map(r => r.body.data.id)).size).toBe(1);
  }, 15000);

  it('即使时间被库外后移，已有归档答卷仍阻止改题和删除', async () => {
    const e = await create({ startTime: new Date(Date.now() - 1000).toISOString() });
    const start = await request(app).post(`/api/exams/${e.id}/start`).set(student);
    expect(start.body.code).toBe(0);
    const recordId = start.body.data.id;
    await request(app).post(`/api/records/${recordId}/submit`).set(student).send({});
    await query(`INSERT INTO exam_records_archive (${RECORD_FULL_COLUMNS}, archived_at) SELECT ${RECORD_FULL_COLUMNS}, NOW(3) FROM exam_records WHERE id = ?`, [recordId]);
    await query('DELETE FROM exam_records WHERE id = ?', [recordId]);
    await query('UPDATE exams SET start_time = ? WHERE id = ?', [toDbDate(new Date(Date.now() + 3600_000)), e.id]);
    expect((await request(app).get(`/api/exams/${e.id}`).set(admin)).body.data.questionsLocked).toBe(true);
    expect((await request(app).put(`/api/exams/${e.id}/questions`).set(author).send(content())).status).toBe(409);
    expect((await request(app).delete(`/api/exams/${e.id}`).set(admin)).status).toBe(409);
  });
});
