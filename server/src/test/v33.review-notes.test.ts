/**
 * v3.3 阅卷「评语 + 标记存疑」全链路 集成测试。
 *
 * 背景：设计稿 `pages/reviews.html` 的「本题评分」区含「评语（可选，考生可见）」与「标记存疑」，
 * 此前后端 `exam_records` 无对应字段，阅卷页以占位提示标注数据缺口。本轮新增
 * `exam_records.review_notes`（JSON：Record<questionId, { comment, commentVisible, doubtful }>）。
 *
 * 本文件护栏：
 *  1) 阅卷入库归一化——空评语条目被剔除、`commentVisible`/`doubtful` 归一为布尔；
 *  2) 评语长度上限（> 500 → 1001）与归属校验（指向本卷以外题目 → 1001）；
 *  3) 管理员视角可见完整备注（评语 + 存疑）；
 *  4) **考生视角服务端强制过滤**——仅暴露「勾选同步」的评语，剔除存疑与未勾选评语；
 *  5) 「我的成绩」列表同样走考生视角过滤。
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import type { RowDataPacket } from 'mysql2/promise';
import { app } from '../app.js';
import { prepareTestDb } from './db.js';
import { closePool, query } from '../db/pool.js';
import { signToken } from '../middleware/auth.js';
import type { ExamRecordDto, ReviewNotes } from '../types/domain.js';

const bearer = (token: string): { Authorization: string } => ({ Authorization: `Bearer ${token}` });

const admin = signToken({ sub: 'user-admin', role: 'admin', departmentId: '' });
const author = signToken({ sub: 'user-author', role: 'author', departmentId: '' });
const zhangsan = signToken({ sub: 'user-zhangsan', role: 'examinee', departmentId: 'dept-rd' });

beforeAll(async () => {
  await prepareTestDb();
}, 30_000);

afterAll(async () => {
  await closePool();
});

describe('v3.3 阅卷评语与标记存疑', () => {
  let short1 = '';
  let short2 = '';
  let paperId = '';
  let examId = '';
  let recordId = '';

  it('出题人新增两道简答题', async () => {
    for (const [stem, holder] of [
      ['简述生产安全事故报告的程序与时限要求。', 's1'],
      ['简述收到疑似钓鱼邮件时的处置流程。', 's2'],
    ] as const) {
      const res = await request(app).post('/api/questions').set(bearer(author)).send({
        bankId: 'bank-security',
        type: 'short',
        stem,
        options: [],
        answer: ['参考要点'],
        defaultScore: 30,
        subject: '安全知识',
      });
      expect(res.body.code, JSON.stringify(res.body)).toBe(0);
      if (holder === 's1') short1 = res.body.data.id as string;
      else short2 = res.body.data.id as string;
    }
    expect(short1).not.toBe('');
    expect(short2).not.toBe('');
  });

  it('组卷（单选 40 + 简答 30 + 简答 30 = 100）并发布考试', async () => {
    const paper = await request(app).post('/api/papers').set(bearer(author)).send({
      name: 'v3.3 阅卷评语冒烟卷',
      description: '',
      bankIds: ['bank-security'],
      questions: [
        { questionId: 'q-01', score: 40 },
        { questionId: short1, score: 30 },
        { questionId: short2, score: 30 },
      ],
    });
    expect(paper.body.code, JSON.stringify(paper.body)).toBe(0);
    paperId = paper.body.data.id as string;

    const exam = await request(app).post('/api/exams').set(bearer(admin)).send({
      name: 'v3.3 阅卷评语冒烟考试',
      paperId,
      departmentIds: ['dept-rd'],
      startTime: new Date(Date.now() - 3600_000).toISOString(),
      endTime: new Date(Date.now() + 3600_000).toISOString(),
      durationMinutes: 30,
      passScore: 60,
      maxAttempts: 1,
    });
    expect(exam.body.code, JSON.stringify(exam.body)).toBe(0);
    examId = exam.body.data.id as string;
  });

  it('考生开考作答并交卷 → pending_review', async () => {
    const start = await request(app).post(`/api/exams/${examId}/start`).set(bearer(zhangsan));
    expect(start.body.code).toBe(0);
    recordId = start.body.data.id as string;

    await request(app)
      .put(`/api/records/${recordId}/answers`)
      .set(bearer(zhangsan))
      .send({ answers: { [short1]: ['考生作答一'], [short2]: ['考生作答二'] } });

    const submit = await request(app).post(`/api/records/${recordId}/submit`).set(bearer(zhangsan)).send({});
    expect(submit.body.code).toBe(0);
    expect(submit.body.data.status).toBe('pending_review');
  });

  it('评语长度超过 500 字 → 1001（zod 拦截）', async () => {
    const res = await request(app)
      .put(`/api/records/${recordId}/review`)
      .set(bearer(author))
      .send({ subjectiveScores: { [short1]: 20, [short2]: 20 }, reviewNotes: { [short1]: { comment: 'x'.repeat(501) } } });
    expect(res.body.code).toBe(1001);
  });

  it('评语指向本卷以外题目 → 1001', async () => {
    const res = await request(app)
      .put(`/api/records/${recordId}/review`)
      .set(bearer(author))
      .send({ subjectiveScores: { [short1]: 20, [short2]: 20 }, reviewNotes: { 'q-not-exist': { comment: '越权' } } });
    expect(res.body.code).toBe(1001);
  });

  it('阅卷提交：空评语条目被剔除，评语与存疑原样入库', async () => {
    const res = await request(app)
      .put(`/api/records/${recordId}/review`)
      .set(bearer(author))
      .send({
        subjectiveScores: { [short1]: 25, [short2]: 18 },
        reviewNotes: {
          [short1]: { comment: '  作答准确，若能补充时限要求将更完整  ', commentVisible: true, doubtful: true },
          [short2]: { comment: '   ', commentVisible: true }, // 空评语 → 整条剔除
        },
      });
    expect(res.body.code, JSON.stringify(res.body)).toBe(0);
    expect(res.body.data.status).toBe('submitted');
    expect(res.body.data.score).toBe(43); // 客观 0 + 主观 43

    const notes = res.body.data.reviewNotes as ReviewNotes;
    expect(notes[short1]).toEqual({
      comment: '作答准确，若能补充时限要求将更完整',
      commentVisible: true,
      doubtful: true,
    });
    expect(notes[short2]).toBeUndefined();
  });

  it('管理员查看详情：完整备注可见（含存疑）', async () => {
    const res = await request(app).get(`/api/records/${recordId}`).set(bearer(admin));
    expect(res.body.code).toBe(0);
    const dto = res.body.data as ExamRecordDto;
    expect(dto.reviewNotes[short1].comment).toBe('作答准确，若能补充时限要求将更完整');
    expect(dto.reviewNotes[short1].doubtful).toBe(true);
  });

  it('考生查看详情：仅见「勾选同步」评语，存疑被服务端剔除', async () => {
    const res = await request(app).get(`/api/records/${recordId}`).set(bearer(zhangsan));
    expect(res.body.code).toBe(0);
    const dto = res.body.data as ExamRecordDto;
    expect(dto.reviewNotes[short1]).toEqual({ comment: '作答准确，若能补充时限要求将更完整' });
    expect(dto.reviewNotes[short1].doubtful).toBeUndefined();
  });

  it('考生「我的成绩」列表同样经过考生视角过滤', async () => {
    const res = await request(app).get('/api/records/my').set(bearer(zhangsan));
    expect(res.body.code).toBe(0);
    const list = res.body.data.list as ExamRecordDto[];
    const item = list.find((r) => r.id === recordId);
    expect(item).toBeDefined();
    if (item && item.reviewNotes[short1]) {
      expect(item.reviewNotes[short1].doubtful).toBeUndefined();
    }
  });

  it('归档搬移保留 review_notes（后台维护迁移不丢备注）', async () => {
    // 直接校验列已存在于「业务表 ∪ 归档表」的数据源（表结构一致性）
    const rows = await query<RowDataPacket[]>(
      `SELECT COUNT(*) AS c FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND COLUMN_NAME = 'review_notes'
          AND TABLE_NAME IN ('exam_records', 'exam_records_archive')`,
    );
    expect(Number(rows[0].c)).toBe(2);
  });
});
