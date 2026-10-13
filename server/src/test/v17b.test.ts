/**
 * v1.7② 题库与数据运营深化 集成测试。
 * 1) 知识点标签：增删改查、题库内/全局按标签过滤、标签列表、按标签配比抽题与缺口。
 * 2) 批量编辑：追加/覆盖标签、改科目、改分值、权限隔离。
 * 3) 试卷克隆：题量与总分一致、名称规则。
 * 4) 看板下钻：科室（含子树）+ 时间范围筛选、知识点错题归因。
 * 5) 审计导出与保留：xlsx / csv 导出、非法列、保留天数、按策略清理。
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../app.js';
import { prepareTestDb } from './db.js';
import { closePool } from '../db/pool.js';
import { signToken } from '../middleware/auth.js';
import * as auditRepo from '../modules/audit/audit.repo.js';
import { toDbDate } from '../utils/datetime.js';

const bearer = (token: string): { Authorization: string } => ({ Authorization: `Bearer ${token}` });

const admin = signToken({ sub: 'user-admin', role: 'admin', departmentId: '' });
const author = signToken({ sub: 'user-author', role: 'author', departmentId: '' });
const zs = signToken({ sub: 'user-zhangsan', role: 'examinee', departmentId: 'dept-rd' });

/** 裸二进制响应解析器：把响应体收集为 Buffer。 */
function binaryParser(
  res: { on: (event: string, cb: (c?: Buffer) => void) => void },
  cb: (err: null, body: Buffer) => void,
) {
  const chunks: Buffer[] = [];
  res.on('data', (c?: Buffer) => chunks.push(Buffer.from(c ?? [])));
  res.on('end', () => cb(null, Buffer.concat(chunks)));
}

/** 新建一道单选小题并返回 id。 */
async function createQuestion(
  bankId: string,
  stem: string,
  tags: string[],
  score = 10,
  token = admin,
): Promise<string> {
  const res = await request(app)
    .post('/api/questions')
    .set(bearer(token))
    .send({
      bankId,
      type: 'single',
      stem,
      options: ['选项甲', '选项乙'],
      answer: [0],
      defaultScore: score,
      analysis: '解析',
      subject: '标签测试',
      tags,
    });
  expect(res.body.code).toBe(0);
  return res.body.data.id as string;
}

/** 新建试卷并返回 id。 */
async function createPaper(
  name: string,
  bankIds: string[],
  questions: Array<{ questionId: string; score: number }>,
): Promise<string> {
  const res = await request(app)
    .post('/api/papers')
    .set(bearer(admin))
    .send({ name, description: '', bankIds, questions });
  expect(res.body.code).toBe(0);
  return res.body.data.id as string;
}

/** 新建考试并返回 id。 */
async function createExam(name: string, paperId: string, departmentIds: string[] = ['dept-rd']): Promise<string> {
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
      passScore: 60,
      maxAttempts: 1,
    });
  expect(res.body.code).toBe(0);
  return res.body.data.id as string;
}

/** 考生开考并交卷（返回最终分数）。 */
async function startAndSubmit(examId: string, token: string): Promise<number> {
  const start = await request(app).post(`/api/exams/${examId}/start`).set(bearer(token));
  expect(start.body.code).toBe(0);
  const recordId = start.body.data.id as string;
  const submit = await request(app).post(`/api/records/${recordId}/submit`).set(bearer(token)).send({});
  expect(submit.body.code).toBe(0);
  return Number(submit.body.data.score);
}

describe('v1.7② 题库与数据运营深化', () => {
  /** 供后续用例复用的题目 id。 */
  let tagQ1 = '';
  let tagQ2 = '';
  let batchQ1 = '';
  let batchQ2 = '';
  /** 未授权给 author 的题库及其题目（权限隔离用例）。 */
  let privateBankId = '';
  let privateQId = '';

  beforeAll(async () => {
    await prepareTestDb();

    tagQ1 = await createQuestion('bank-security', '标签题一（信息安全）', ['信息安全', '访问控制']);
    tagQ2 = await createQuestion('bank-security', '标签题二（信息安全）', ['信息安全']);
    // 去重/去空/trim 归一化：' 密码 ' 与 '密码' 视为同一标签
    batchQ1 = await createQuestion('bank-security', '批量题一', [' 密码 ', '密码', '', '  ']);
    batchQ2 = await createQuestion('bank-security', '批量题二', []);

    const bankRes = await request(app)
      .post('/api/banks')
      .set(bearer(admin))
      .send({ name: '私有题库（未授权出题人）', description: '', category: '测试', authorIds: [] });
    expect(bankRes.body.code).toBe(0);
    privateBankId = bankRes.body.data.id as string;
    privateQId = await createQuestion(privateBankId, '私有题', ['私有标签']);
  }, 60000);

  afterAll(async () => {
    await closePool();
  });

  describe('Q1 知识点标签', () => {
    it('新增题目携带标签：回读一致且完成 trim / 去重 / 去空', async () => {
      const res = await request(app).get(`/api/questions?bankIds=bank-security&keyword=批量题一`).set(bearer(admin));
      expect(res.body.code).toBe(0);
      const item = res.body.data.list.find((q: { id: string }) => q.id === batchQ1);
      expect(item).toBeTruthy();
      expect(item.tags).toEqual(['密码']);
    });

    it('题库内列表按标签过滤', async () => {
      const res = await request(app)
        .get(`/api/banks/bank-security/questions?tag=访问控制`)
        .set(bearer(admin));
      expect(res.body.code).toBe(0);
      const ids = res.body.data.list.map((q: { id: string }) => q.id);
      expect(ids).toContain(tagQ1);
      expect(ids).not.toContain(tagQ2);
    });

    it('全局试题池按标签过滤', async () => {
      const res = await request(app)
        .get('/api/questions?bankIds=bank-security&tag=信息安全')
        .set(bearer(admin));
      expect(res.body.code).toBe(0);
      const ids = res.body.data.list.map((q: { id: string }) => q.id);
      expect(ids).toEqual(expect.arrayContaining([tagQ1, tagQ2]));
      expect(ids).not.toContain(batchQ2);
    });

    it('GET /api/questions/tags 返回去重后的标签列表', async () => {
      const res = await request(app).get('/api/questions/tags').set(bearer(admin));
      expect(res.body.code).toBe(0);
      const tags = res.body.data as string[];
      expect(tags).toContain('信息安全');
      expect(tags).toContain('访问控制');
      expect(tags).toContain('密码');
      // 去重校验
      expect(new Set(tags).size).toBe(tags.length);
    });

    it('按标签配比抽题：命中标签题目', async () => {
      const res = await request(app)
        .post('/api/papers/draw-questions')
        .set(bearer(admin))
        .send({
          bankIds: ['bank-security'],
          rules: {},
          tagRules: [{ tag: '信息安全', count: 2, score: 5 }],
        });
      expect(res.body.code).toBe(0);
      expect(res.body.data.tagShortages).toEqual([]);
      expect(res.body.data.questions).toHaveLength(2);
      const ids = res.body.data.questions.map((q: { questionId: string }) => q.questionId);
      expect(ids).toEqual(expect.arrayContaining([tagQ1, tagQ2]));
      expect(res.body.data.questions.every((q: { score: number }) => q.score === 5)).toBe(true);
    });

    it('题型 + 标签混合抽题不重复', async () => {
      const res = await request(app)
        .post('/api/papers/draw-questions')
        .set(bearer(admin))
        .send({
          bankIds: ['bank-security'],
          rules: { single: { count: 2, score: 10 } },
          tagRules: [{ tag: '信息安全', count: 2, score: 5 }],
        });
      expect(res.body.code).toBe(0);
      const ids = res.body.data.questions.map((q: { questionId: string }) => q.questionId);
      expect(new Set(ids).size).toBe(ids.length);
    });

    it('标签存量不足 → 返回 tagShortages 且不生成任何题目', async () => {
      const res = await request(app)
        .post('/api/papers/draw-questions')
        .set(bearer(admin))
        .send({
          bankIds: ['bank-security'],
          rules: {},
          tagRules: [{ tag: '不存在的知识点', count: 3, score: 5 }],
        });
      expect(res.body.code).toBe(0);
      expect(res.body.data.questions).toEqual([]);
      expect(res.body.data.tagShortages).toEqual([
        { tag: '不存在的知识点', required: 3, available: 0 },
      ]);
    });
  });

  describe('Q2 批量编辑', () => {
    it('追加标签 + 改科目 + 改分值', async () => {
      const res = await request(app)
        .post('/api/questions/batch-edit')
        .set(bearer(admin))
        .send({
          ids: [batchQ1, batchQ2],
          subject: '批量改后科目',
          tags: ['新增标签'],
          tagsMode: 'append',
          defaultScore: 7,
        });
      expect(res.body.code).toBe(0);
      expect(res.body.data.updated).toBe(2);

      const list = await request(app).get('/api/questions?bankIds=bank-security&tag=新增标签').set(bearer(admin));
      const ids = list.body.data.list.map((q: { id: string }) => q.id);
      expect(ids).toEqual(expect.arrayContaining([batchQ1, batchQ2]));

      const item = list.body.data.list.find((q: { id: string }) => q.id === batchQ1);
      expect(item.subject).toBe('批量改后科目');
      expect(item.defaultScore).toBe(7);
      // 追加模式保留原标签
      expect(item.tags).toEqual(expect.arrayContaining(['密码', '新增标签']));
      // 题干等未传字段保持不变
      expect(item.stem).toBe('批量题一');
    });

    it('覆盖模式替换标签', async () => {
      const res = await request(app)
        .post('/api/questions/batch-edit')
        .set(bearer(admin))
        .send({ ids: [batchQ1], tags: ['唯一标签'], tagsMode: 'replace' });
      expect(res.body.code).toBe(0);

      const list = await request(app).get('/api/questions?bankIds=bank-security&tag=唯一标签').set(bearer(admin));
      const item = list.body.data.list.find((q: { id: string }) => q.id === batchQ1);
      expect(item.tags).toEqual(['唯一标签']);
    });

    it('未选择任何字段 → 1001', async () => {
      const res = await request(app)
        .post('/api/questions/batch-edit')
        .set(bearer(admin))
        .send({ ids: [batchQ1] });
      expect(res.status).toBe(400);
      expect(res.body.code).toBe(1001);
    });

    it('author 对未授权题库的题目 → 403', async () => {
      const res = await request(app)
        .post('/api/questions/batch-edit')
        .set(bearer(author))
        .send({ ids: [privateQId], tags: ['越权'] });
      expect(res.status).toBe(403);
      expect(res.body.code).toBe(1003);
    });
  });

  describe('Q2 试卷克隆', () => {
    it('克隆试卷：题量/总分一致，名称为「原名（副本）」', async () => {
      const res = await request(app)
        .post('/api/papers/paper-demo/clone')
        .set(bearer(admin))
        .send({});
      expect(res.body.code).toBe(0);
      expect(res.body.data.name).toContain('副本');
      expect(res.body.data.questions).toHaveLength(10);
      expect(res.body.data.totalScore).toBe(100);
      expect(res.body.data.id).not.toBe('paper-demo');
    });

    it('克隆可自定义名称', async () => {
      const res = await request(app)
        .post('/api/papers/paper-demo/clone')
        .set(bearer(admin))
        .send({ name: '克隆卷（自定义名）' });
      expect(res.body.code).toBe(0);
      expect(res.body.data.name).toBe('克隆卷（自定义名）');
    });
  });

  describe('Q3 看板下钻与归因', () => {
    beforeAll(async () => {
      // 构造一场含标签题的考试并交卷（张三，研发部）
      const paperId = await createPaper('标签归因卷', ['bank-security'], [{ questionId: tagQ1, score: 100 }]);
      const examId = await createExam('标签归因考试（研发部）', paperId, ['dept-rd']);
      await startAndSubmit(examId, zs);
    }, 30000);

    it('dashboard 返回 tagWrong 知识点错题归因', async () => {
      const res = await request(app).get('/api/reports/dashboard').set(bearer(admin));
      expect(res.body.code).toBe(0);
      expect(Array.isArray(res.body.data.tagWrong)).toBe(true);
      const tags = res.body.data.tagWrong.map((t: { subject: string }) => t.subject);
      expect(tags).toContain('信息安全');
      const item = res.body.data.tagWrong.find((t: { subject: string }) => t.subject === '信息安全');
      expect(item.totalAnswered).toBeGreaterThan(0);
    });

    it('按科室下钻：仅返回该科室（含子科室）的考试', async () => {
      const rd = await request(app).get('/api/reports/dashboard?departmentId=dept-rd').set(bearer(admin));
      expect(rd.body.code).toBe(0);
      const rdNames = rd.body.data.examTrend.map((t: { examName: string }) => t.examName);
      expect(rdNames).toContain('标签归因考试（研发部）');

      const mkt = await request(app).get('/api/reports/dashboard?departmentId=dept-mkt').set(bearer(admin));
      expect(mkt.body.code).toBe(0);
      const mktNames = mkt.body.data.examTrend.map((t: { examName: string }) => t.examName);
      expect(mktNames).not.toContain('标签归因考试（研发部）');
    });

    it('时间范围筛选：未来区间 → 无趋势数据', async () => {
      const from = new Date(Date.now() + 86400_000).toISOString();
      const to = new Date(Date.now() + 2 * 86400_000).toISOString();
      const res = await request(app)
        .get(`/api/reports/dashboard?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`)
        .set(bearer(admin));
      expect(res.body.code).toBe(0);
      expect(res.body.data.examTrend).toEqual([]);
      expect(res.body.data.tagWrong).toEqual([]);
    });
  });

  describe('Q4 审计导出与保留策略', () => {
    it('导出 xlsx：响应头 + 魔数', async () => {
      const res = await request(app)
        .get('/api/audit-logs/export?format=xlsx')
        .set(bearer(admin))
        .buffer(true)
        .parse(binaryParser as never);
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('spreadsheetml');
      const body = res.body as Buffer;
      expect(body.length).toBeGreaterThan(1000);
      // xlsx 为 zip 容器：'PK'
      expect(body.subarray(0, 2).toString('latin1')).toBe('PK');
    });

    it('导出 csv：响应头 + BOM', async () => {
      const res = await request(app)
        .get('/api/audit-logs/export?format=csv')
        .set(bearer(admin))
        .buffer(true)
        .parse(binaryParser as never);
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('text/csv');
      const text = (res.body as Buffer).toString('utf8');
      expect(text.startsWith('\uFEFF')).toBe(true);
      expect(text).toContain('操作时间');
      expect(text).toContain('操作者');
    });

    it('导出行为自身留痕（audit.export）', async () => {
      const res = await request(app)
        .get('/api/audit-logs?action=audit.export&page=1&pageSize=5')
        .set(bearer(admin));
      expect(res.body.code).toBe(0);
      expect(res.body.data.total).toBeGreaterThan(0);
    });

    it('非法导出列 → 1001', async () => {
      const res = await request(app)
        .get('/api/audit-logs/export?format=csv&columns=notExist')
        .set(bearer(admin));
      expect(res.status).toBe(400);
      expect(res.body.code).toBe(1001);
    });

    it('GET /api/audit-logs/retention 返回设置中的保留天数', async () => {
      const res = await request(app).get('/api/audit-logs/retention').set(bearer(admin));
      expect(res.body.code).toBe(0);
      expect(res.body.data.retentionDays).toBe(180);
    });

    it('按策略清理：删除超期日志并留痕', async () => {
      // 直接写入一条 400 天前的历史日志
      const oldDate = new Date(Date.now() - 400 * 86400_000);
      await auditRepo.insert({
        id: 'audit-old-1',
        actorId: 'user-admin',
        actorName: '系统管理员',
        action: 'user.delete',
        targetType: 'user',
        targetId: 'user-gone',
        targetName: '历史用户',
        detail: { note: '超期日志' },
        createdAt: toDbDate(oldDate),
      });
      const before = await auditRepo.count({});

      const res = await request(app).post('/api/audit-logs/cleanup').set(bearer(admin)).send({});
      expect(res.body.code).toBe(0);
      expect(res.body.data.retentionDays).toBe(180);
      expect(res.body.data.deletedCount).toBeGreaterThanOrEqual(1);

      const after = await auditRepo.count({});
      // 删除超期日志，同时新增一条清理留痕
      expect(after).toBe(before - res.body.data.deletedCount + 1);
    });

    it('保留天数为 0 → 视为永久保留，不删除任何日志', async () => {
      const res = await request(app)
        .post('/api/audit-logs/cleanup')
        .set(bearer(admin))
        .send({ retentionDays: 0 });
      expect(res.body.code).toBe(0);
      expect(res.body.data.retentionDays).toBe(0);
      expect(res.body.data.deletedCount).toBe(0);
      expect(res.body.data.cutoff).toBeNull();
    });
  });
});
