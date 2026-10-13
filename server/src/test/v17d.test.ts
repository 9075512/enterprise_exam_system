/**
 * v1.7③-b 安全与合规加固 · S1（简答富文本/图片作答 + 评分细则）与 S2（题库授权批量维护）集成测试。
 *
 * 1) 富文本净化（纯函数）：危险标签/事件属性/伪协议剥离、图片白名单与体积/数量限制、长度截断。
 * 2) 评分细则 rubric：仅简答生效、按分值降序去重、档位上限校验。
 * 3) 富文本作答链路：暂存即净化（服务端为安全边界）→ 阅卷按 rubric 档位给分。
 * 4) 题库授权批量维护：按科室/角色/手选批量授权与取消，非出题人与不存在账号被跳过，仅 admin 可用。
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../app.js';
import { prepareTestDb } from './db.js';
import { closePool } from '../db/pool.js';
import { signToken } from '../middleware/auth.js';
import { sanitizeRichText, isRichTextEmpty } from '../utils/richText.js';

const bearer = (token: string): { Authorization: string } => ({ Authorization: `Bearer ${token}` });

const admin = signToken({ sub: 'user-admin', role: 'admin', departmentId: '' });
const author = signToken({ sub: 'user-author', role: 'author', departmentId: '' });
const zs = signToken({ sub: 'user-zhangsan', role: 'examinee', departmentId: 'dept-rd' });

/** 1×1 透明 PNG 的 data URI（合法内联图片）。 */
const TINY_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

/* ============================ 1. 富文本净化（纯函数） ============================ */

describe('S1 富文本净化（XSS 白名单）', () => {
  it('剥离 script 整段内容与事件属性', () => {
    const dirty = '<p onclick="steal()">答案<script>alert(1)</script></p><img src="x" onerror="alert(2)">';
    const clean = sanitizeRichText(dirty);
    expect(clean).not.toContain('script');
    expect(clean).not.toContain('onclick');
    expect(clean).not.toContain('onerror');
    expect(clean).toContain('答案');
    // 非法 img（src=x）整张丢弃
    expect(clean).not.toContain('<img');
  });

  it('a[href] 仅保留安全协议，javascript: 被剥离', () => {
    const clean = sanitizeRichText('<a href="javascript:alert(1)">点我</a><a href="https://a.com">官网</a>');
    expect(clean).not.toContain('javascript:');
    expect(clean).toContain('href="https://a.com"');
    expect(clean).toContain('点我');
  });

  it('保留白名单标签与结构，剥离 style/class 属性', () => {
    const clean = sanitizeRichText(
      '<div style="color:red"><strong>要点</strong><ul class="x"><li>一</li><li>二</li></ul></div>',
    );
    expect(clean).toBe('<div><strong>要点</strong><ul><li>一</li><li>二</li></ul></div>');
  });

  it('img[src] 仅允许 data:image，且限制单图体积', () => {
    const ok = sanitizeRichText(`<p>看图<img src="${TINY_PNG}"></p>`);
    expect(ok).toContain('data:image/png;base64,');
    // 超限体积（> maxImageBytes + 64）→ 丢弃该图片
    const huge = `data:image/png;base64,${'A'.repeat(4096)}`;
    const dropped = sanitizeRichText(`<img src="${huge}">`, { maxImageBytes: 512 });
    expect(dropped).not.toContain('<img');
  });

  it('图片数量超限时丢弃后续图片', () => {
    const one = `<img src="${TINY_PNG}">`;
    const clean = sanitizeRichText(one.repeat(4), { maxImages: 2 });
    expect((clean.match(/<img/g) ?? []).length).toBe(2);
  });

  it('超长内容按长度上限截断', () => {
    const clean = sanitizeRichText(`<p>${'甲'.repeat(500)}</p>`, { maxLength: 100 });
    expect(clean.length).toBe(100);
  });

  it('isRichTextEmpty 判定：空白/仅 br 为空，文本或图片非空', () => {
    expect(isRichTextEmpty('')).toBe(true);
    expect(isRichTextEmpty('<p>  </p>')).toBe(true);
    expect(isRichTextEmpty('<p>&nbsp;</p>')).toBe(true);
    expect(isRichTextEmpty('<br><br>')).toBe(true);
    expect(isRichTextEmpty('<p>作答</p>')).toBe(false);
    expect(isRichTextEmpty(`<img src="${TINY_PNG}">`)).toBe(false);
  });
});

/* ============================ 集成用例 ============================ */

let shortQuestionId = '';
let paperId = '';
let examId = '';

beforeAll(async () => {
  await prepareTestDb();

  // 1) 建一道带评分细则的简答题（分值 10，三档）
  const q = await request(app).post('/api/questions').set(bearer(admin)).send({
    bankId: 'bank-security',
    type: 'short',
    stem: '请简述企业信息安全的三项基本要求。',
    answer: ['保密性、完整性、可用性'],
    defaultScore: 10,
    subject: '信息安全',
    analysis: '要点齐全即可给满分。',
    rubric: [
      { score: 5, label: '部分正确', description: '提及 1~2 项' },
      { score: 10, label: '完全正确', description: '三项齐全且有说明' },
      { score: 10, label: '重复档位', description: '应被去重' },
    ],
  });
  expect(q.body.code).toBe(0);
  shortQuestionId = q.body.data.id as string;

  // 2) 组卷（仅该简答题）→ 建考
  const paper = await request(app)
    .post('/api/papers')
    .set(bearer(admin))
    .send({
      name: 'v17d 简答富文本试卷',
      description: '',
      bankIds: ['bank-security'],
      questions: [{ questionId: shortQuestionId, score: 10 }],
    });
  expect(paper.body.code).toBe(0);
  paperId = paper.body.data.id as string;

  const exam = await request(app)
    .post('/api/exams')
    .set(bearer(admin))
    .send({
      name: 'v17d 简答富文本考试',
      paperId,
      departmentIds: ['dept-rd'],
      startTime: new Date(Date.now() - 3600_000).toISOString(),
      endTime: new Date(Date.now() + 3600_000).toISOString(),
      durationMinutes: 30,
      passScore: 6,
      maxAttempts: 1,
    });
  expect(exam.body.code).toBe(0);
  examId = exam.body.data.id as string;
});

afterAll(async () => {
  await closePool();
});

describe('S1 评分细则（rubric）', () => {
  it('简答题 rubric 按分值降序、同分去重后返回', async () => {
    const res = await request(app)
      .get('/api/banks/bank-security/questions')
      .query({ type: 'short', pageSize: 50 })
      .set(bearer(admin));
    expect(res.body.code).toBe(0);
    const target = (res.body.data.list as Array<{ id: string; rubric: Array<{ score: number; label: string }> }>).find(
      (q) => q.id === shortQuestionId,
    );
    expect(target).toBeTruthy();
    const rubric = target!.rubric;
    expect(rubric.map((b) => b.score)).toEqual([10, 5]);
    // 同分档位仅保留首个
    expect(rubric[0].label).toBe('完全正确');
  });

  it('非简答题提交 rubric → 返回空数组（仅简答生效）', async () => {
    const res = await request(app).post('/api/questions').set(bearer(admin)).send({
      bankId: 'bank-security',
      type: 'single',
      stem: 'rubric 不适用于客观题',
      options: ['A', 'B'],
      answer: [0],
      defaultScore: 5,
      rubric: [{ score: 5, label: '满分', description: '' }],
    });
    expect(res.body.code).toBe(0);
    expect(res.body.data.rubric).toEqual([]);
  });

  it('评分细则超过 10 档 → 1001', async () => {
    const res = await request(app).post('/api/questions').set(bearer(admin)).send({
      bankId: 'bank-security',
      type: 'short',
      stem: '档位过多',
      answer: ['参考答案'],
      defaultScore: 10,
      rubric: Array.from({ length: 11 }, (_, i) => ({ score: i, label: `档位${i}`, description: '' })),
    });
    expect(res.body.code).toBe(1001);
  });
});

describe('S1 富文本作答链路', () => {
  let recordId = '';

  it('暂存答案时服务端净化富文本（script/事件属性被剥离）', async () => {
    const start = await request(app).post(`/api/exams/${examId}/start`).set(bearer(zs));
    expect(start.body.code).toBe(0);
    recordId = start.body.data.id as string;

    const dirty =
      `<p>答：<strong>保密性</strong>、完整性、可用性<script>alert(1)</script></p>` +
      `<img src="x" onerror="alert(2)"><img src="${TINY_PNG}">`;
    const save = await request(app)
      .put(`/api/records/${recordId}/answers`)
      .set(bearer(zs))
      .send({ answers: { [shortQuestionId]: [dirty] } });
    expect(save.body.code).toBe(0);

    const detail = await request(app).get(`/api/records/${recordId}`).set(bearer(zs));
    expect(detail.body.code).toBe(0);
    const stored = (detail.body.data.answers[shortQuestionId] as string[])[0];
    expect(stored).toContain('<strong>保密性</strong>');
    expect(stored).not.toContain('script');
    expect(stored).not.toContain('onerror');
    expect(stored).not.toContain('src="x"');
    // 合法内联图片保留
    expect(stored).toContain('data:image/png;base64,');
  });

  it('含简答卷交卷后进入待阅卷，按 rubric 档位给分并合计总分', async () => {
    const submit = await request(app).post(`/api/records/${recordId}/submit`).set(bearer(zs)).send({});
    expect(submit.body.code).toBe(0);
    expect(submit.body.data.status).toBe('pending_review');
    expect(Number(submit.body.data.score)).toBe(0); // 主观题自动分 0

    const review = await request(app)
      .put(`/api/records/${recordId}/review`)
      .set(bearer(admin))
      .send({ subjectiveScores: { [shortQuestionId]: 5 } });
    expect(review.body.code).toBe(0);
    expect(review.body.data.status).toBe('submitted');
    expect(Number(review.body.data.score)).toBe(5);
  });

  it('仅含空白/富文本空内容的作答被归一为空数组', async () => {
    // 新建第 2 次作答（先提升次数上限）
    const exam = await request(app).put(`/api/exams/${examId}`).set(bearer(admin)).send({
      name: 'v17d 简答富文本考试',
      paperId,
      departmentIds: ['dept-rd'],
      startTime: new Date(Date.now() - 3600_000).toISOString(),
      endTime: new Date(Date.now() + 3600_000).toISOString(),
      durationMinutes: 30,
      passScore: 6,
      maxAttempts: 3,
    });
    expect(exam.body.code).toBe(0);

    const start = await request(app).post(`/api/exams/${examId}/start`).set(bearer(zs));
    expect(start.body.code).toBe(0);
    const rid = start.body.data.id as string;
    const save = await request(app)
      .put(`/api/records/${rid}/answers`)
      .set(bearer(zs))
      .send({ answers: { [shortQuestionId]: ['<p>&nbsp;</p><br>'] } });
    expect(save.body.code).toBe(0);
    const detail = await request(app).get(`/api/records/${rid}`).set(bearer(zs));
    expect((detail.body.data.answers[shortQuestionId] as string[])[0]).toBe('');
  });
});

describe('S2 题库授权批量维护', () => {
  let deptAuthorA = '';
  let deptAuthorB = '';

  beforeAll(async () => {
    // 在 dept-rd 下建两名出题人
    const a = await request(app)
      .post('/api/users')
      .set(bearer(admin))
      .send({ username: 'batch_a', name: '批量甲', role: 'author', departmentId: 'dept-rd', password: 'Batch1234' });
    expect(a.body.code).toBe(0);
    deptAuthorA = a.body.data.id as string;
    const b = await request(app)
      .post('/api/users')
      .set(bearer(admin))
      .send({ username: 'batch_b', name: '批量乙', role: 'author', departmentId: 'dept-rd', password: 'Batch1234' });
    expect(b.body.code).toBe(0);
    deptAuthorB = b.body.data.id as string;
  });

  it('按科室批量授权：命中科室内的出题人', async () => {
    const res = await request(app)
      .post('/api/banks/bank-culture/authors/grant')
      .set(bearer(admin))
      .send({ departmentId: 'dept-rd', role: 'author' });
    expect(res.body.code).toBe(0);
    expect(res.body.data.changed).toBe(2);
    expect(res.body.data.authorIds).toEqual(expect.arrayContaining([deptAuthorA, deptAuthorB]));
    // 科室内的考生不应被授权
    expect(res.body.data.authorIds).not.toContain('user-zhangsan');
  });

  it('重复授权幂等：changed=0 且计入 skipped', async () => {
    const res = await request(app)
      .post('/api/banks/bank-culture/authors/grant')
      .set(bearer(admin))
      .send({ departmentId: 'dept-rd', role: 'author' });
    expect(res.body.code).toBe(0);
    expect(res.body.data.changed).toBe(0);
    expect(res.body.data.skipped).toBe(2);
  });

  it('手选用户中的非出题人被跳过并计数（nonAuthor）', async () => {
    const res = await request(app)
      .post('/api/banks/bank-culture/authors/grant')
      .set(bearer(admin))
      .send({ userIds: ['user-lisi', 'user-author'] });
    expect(res.body.code).toBe(0);
    expect(res.body.data.nonAuthor).toBe(1); // user-lisi 为考生
    expect(res.body.data.authorIds).toContain('user-author');
    expect(res.body.data.authorIds).not.toContain('user-lisi');
  });

  it('不存在的账号计入 missing', async () => {
    const res = await request(app)
      .post('/api/banks/bank-culture/authors/grant')
      .set(bearer(admin))
      .send({ userIds: ['user-not-exist'] });
    expect(res.body.code).toBe(0);
    expect(res.body.data.missing).toBe(1);
    expect(res.body.data.changed).toBe(0);
  });

  it('按科室批量取消授权', async () => {
    const res = await request(app)
      .post('/api/banks/bank-culture/authors/revoke')
      .set(bearer(admin))
      .send({ departmentId: 'dept-rd', role: 'author' });
    expect(res.body.code).toBe(0);
    expect(res.body.data.changed).toBe(2);
    expect(res.body.data.authorIds).not.toContain(deptAuthorA);
    expect(res.body.data.authorIds).not.toContain(deptAuthorB);
  });

  it('选择器全空 → 1001', async () => {
    const res = await request(app)
      .post('/api/banks/bank-culture/authors/grant')
      .set(bearer(admin))
      .send({ userIds: [] });
    expect(res.body.code).toBe(1001);
  });

  it('非管理员（出题人）调用 → 1003', async () => {
    const res = await request(app)
      .post('/api/banks/bank-culture/authors/grant')
      .set(bearer(author))
      .send({ departmentId: 'dept-rd' });
    expect(res.body.code).toBe(1003);
  });
});
