/**
 * 集成测试：考试 / 记录 / 报表 / 组卷 / 题库级联 等核心链路的 HTTP 行为。
 * 通过 supertest 直接驱动 Express 应用，数据落在测试库 enterprise_exam_system_test。
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../app.js';
import { prepareTestDb } from './db.js';
import { closePool, query } from '../db/pool.js';
import { signToken } from '../middleware/auth.js';
import { nowDb } from '../utils/datetime.js';

/** 构造 Bearer 请求头。 */
const bearer = (token: string): { Authorization: string } => ({ Authorization: `Bearer ${token}` });

// 依据种子用户签发令牌（id / role / departmentId 与 seed.ts 一致）
const admin = signToken({ sub: 'user-admin', role: 'admin', departmentId: '' });
const author = signToken({ sub: 'user-author', role: 'author', departmentId: '' });
const zs = signToken({ sub: 'user-zhangsan', role: 'examinee', departmentId: 'dept-rd' });
const ww = signToken({ sub: 'user-wangwu', role: 'examinee', departmentId: 'dept-rd' });
const ls = signToken({ sub: 'user-lisi', role: 'examinee', departmentId: 'dept-mkt' });

describe('考试系统集成测试', () => {
  beforeAll(async () => {
    await prepareTestDb();
  }, 30000);

  afterAll(async () => {
    await closePool();
  });

  describe('鉴权与权限（401/1002、403/1003）', () => {
    it('无 Token 访问受保护接口 → 401 / 1002', async () => {
      const res = await request(app).get('/api/exams');
      expect(res.status).toBe(401);
      expect(res.body.code).toBe(1002);
    });

    it('非法 Token → 401 / 1002', async () => {
      const res = await request(app).get('/api/exams').set('Authorization', 'Bearer not.a.jwt');
      expect(res.status).toBe(401);
      expect(res.body.code).toBe(1002);
    });

    it('考生访问管理员接口 → 403 / 1003', async () => {
      const res = await request(app).get('/api/exams').set(bearer(zs));
      expect(res.status).toBe(403);
      expect(res.body.code).toBe(1003);
    });

    it('考生访问报表接口 → 403 / 1003', async () => {
      const res = await request(app).get('/api/reports/exams/exam-demo').set(bearer(zs));
      expect(res.status).toBe(403);
      expect(res.body.code).toBe(1003);
    });
  });

  describe('考试科室隔离', () => {
    let mktExamId = '';

    it('管理员创建「仅市场部」考试', async () => {
      const res = await request(app)
        .post('/api/exams')
        .set(bearer(admin))
        .send({
          name: '仅市场部考试',
          paperId: 'paper-demo',
          departmentIds: ['dept-mkt'],
          startTime: new Date(Date.now() - 3600_000).toISOString(),
          endTime: new Date(Date.now() + 3600_000).toISOString(),
          durationMinutes: 30,
          passScore: 60,
        });
      expect(res.body.code).toBe(0);
      mktExamId = res.body.data.id;
      expect(mktExamId).toBeTruthy();
    });

    it('研发部考生（张三）看不到市场部考试，且列表均含研发部', async () => {
      const res = await request(app).get('/api/exams/my').set(bearer(zs));
      expect(res.body.code).toBe(0);
      const list = res.body.data as Array<{ id: string; departmentIds: string[] }>;
      const ids = list.map((x) => x.id);
      expect(ids).not.toContain(mktExamId);
      expect(ids).toContain('exam-demo');
      for (const e of list) expect(e.departmentIds).toContain('dept-rd');
    });

    it('市场部考生（李四）能看到市场部考试', async () => {
      const res = await request(app).get('/api/exams/my').set(bearer(ls));
      const ids = (res.body.data as Array<{ id: string }>).map((x) => x.id);
      expect(ids).toContain(mktExamId);
    });
  });

  describe('考试状态机（未开始 / 已结束 拒绝开考）', () => {
    it('未开始的考试不可开考 → 400 / 1001', async () => {
      const create = await request(app)
        .post('/api/exams')
        .set(bearer(admin))
        .send({
          name: '未来考试',
          paperId: 'paper-demo',
          departmentIds: ['dept-rd'],
          startTime: new Date(Date.now() + 3600_000).toISOString(),
          endTime: new Date(Date.now() + 7200_000).toISOString(),
          durationMinutes: 30,
          passScore: 60,
        });
      const id = create.body.data.id as string;
      const res = await request(app).post(`/api/exams/${id}/start`).set(bearer(zs));
      expect(res.status).toBe(400);
      expect(res.body.code).toBe(1001);
      await request(app).delete(`/api/exams/${id}`).set(bearer(admin));
    });

    it('已结束的考试不可开考 → 400 / 1001', async () => {
      const create = await request(app)
        .post('/api/exams')
        .set(bearer(admin))
        .send({
          name: '过去考试',
          paperId: 'paper-demo',
          departmentIds: ['dept-rd'],
          startTime: new Date(Date.now() - 7200_000).toISOString(),
          endTime: new Date(Date.now() - 3600_000).toISOString(),
          durationMinutes: 30,
          passScore: 60,
        });
      const id = create.body.data.id as string;
      const res = await request(app).post(`/api/exams/${id}/start`).set(bearer(zs));
      expect(res.status).toBe(400);
      expect(res.body.code).toBe(1001);
      await request(app).delete(`/api/exams/${id}`).set(bearer(admin));
    });
  });

  describe('异常退出需管理员恢复', () => {
    it('管理员恢复策略只放行一次再次进入', async () => {
      const settings = await request(app).get('/api/settings').set(bearer(admin));
      expect(settings.body.code).toBe(0);
      const original = settings.body.data as Record<string, unknown>;
      let examId = '';
      let recordId = '';
      try {
        const saved = await request(app)
          .put('/api/settings')
          .set(bearer(admin))
          .send({ ...original, abnormalExitResumePolicy: 'admin_required' });
        expect(saved.body.code).toBe(0);

        const created = await request(app)
          .post('/api/exams')
          .set(bearer(admin))
          .send({
            name: '管理员恢复策略考试',
            paperId: 'paper-demo',
            departmentIds: ['dept-rd'],
            startTime: new Date(Date.now() - 3600_000).toISOString(),
            endTime: new Date(Date.now() + 3600_000).toISOString(),
            durationMinutes: 30,
            passScore: 60,
          });
        expect(created.body.code).toBe(0);
        examId = created.body.data.id as string;

        const started = await request(app).post(`/api/exams/${examId}/start`).set(bearer(zs));
        expect(started.body.code).toBe(0);
        recordId = started.body.data.id as string;

        const firstEnter = await request(app).get(`/api/records/${recordId}`).set(bearer(zs));
        expect(firstEnter.body.code).toBe(0);
        const blocked = await request(app).get(`/api/records/${recordId}`).set(bearer(zs));
        expect(blocked.status).toBe(403);
        expect(blocked.body.code).toBe(1003);

        const allow = await request(app).post(`/api/records/${recordId}/allow-resume`).set(bearer(admin));
        expect(allow.body.code).toBe(0);
        const resumed = await request(app).get(`/api/records/${recordId}`).set(bearer(zs));
        expect(resumed.body.code).toBe(0);
      } finally {
        if (recordId) await query(`DELETE FROM exam_records WHERE id = ?`, [recordId]);
        if (examId) await request(app).delete(`/api/exams/${examId}`).set(bearer(admin));
        await request(app).put('/api/settings').set(bearer(admin)).send(original);
      }
    });
  });

  describe('开考 / 续考 / 交卷 幂等与判分', () => {
    let zsRecordId = '';

    it('张三开考 exam-demo → 新建进行中记录并冻结快照（10 题）', async () => {
      const res = await request(app).post('/api/exams/exam-demo/start').set(bearer(zs));
      expect(res.body.code).toBe(0);
      expect(res.body.data.status).toBe('in_progress');
      expect(res.body.data.paperSnapshot.questions).toHaveLength(10);
      zsRecordId = res.body.data.id;
      expect(zsRecordId).toBeTruthy();
    });

    it('重复开考 → 幂等续考，返回同一记录', async () => {
      const res = await request(app).post('/api/exams/exam-demo/start').set(bearer(zs));
      expect(res.body.code).toBe(0);
      expect(res.body.data.id).toBe(zsRecordId);
      expect(res.body.data.status).toBe('in_progress');
    });

    it('暂存答案成功', async () => {
      const res = await request(app)
        .put(`/api/records/${zsRecordId}/answers`)
        .set(bearer(zs))
        .send({
          answers: {
            'q-01': [1],
            'q-02': [1],
            'q-03': [0, 1, 3],
            'q-04': [0, 1, 3],
            'q-05': [1],
            'q-06': [0],
          },
        });
      expect(res.body.code).toBe(0);
    });

    it('上报切屏事件（只增不改，秒数四舍五入且不小于 1）', async () => {
      const res = await request(app)
        .post(`/api/records/${zsRecordId}/cheat-events`)
        .set(bearer(zs))
        .send({ awaySeconds: 3.6 });
      expect(res.body.code).toBe(0);
      const detail = await request(app).get(`/api/records/${zsRecordId}`).set(bearer(zs));
      expect(detail.body.data.cheatEvents).toHaveLength(1);
      expect(detail.body.data.cheatEvents[0].awaySeconds).toBe(4);
    });

    it('考生查看他人记录 → 403 / 1003', async () => {
      const res = await request(app).get(`/api/records/${zsRecordId}`).set(bearer(ww));
      expect(res.status).toBe(403);
      expect(res.body.code).toBe(1003);
    });

    it('交卷判分 → 60 分（答对前 6 题，每题 10 分）', async () => {
      const res = await request(app).post(`/api/records/${zsRecordId}/submit`).set(bearer(zs)).send({ auto: false });
      expect(res.body.code).toBe(0);
      expect(res.body.data.status).toBe('submitted');
      expect(res.body.data.score).toBe(60);
    });

    it('重复交卷 → 幂等，分数与状态不变', async () => {
      const res = await request(app).post(`/api/records/${zsRecordId}/submit`).set(bearer(zs)).send({ auto: true });
      expect(res.body.data.status).toBe('submitted');
      expect(res.body.data.score).toBe(60);
    });

    it('「我的成绩」包含该记录', async () => {
      const res = await request(app).get('/api/records/my').set(bearer(zs));
      expect(res.body.code).toBe(0);
      const item = (res.body.data.list as Array<{ id: string; score: number }>).find((r) => r.id === zsRecordId);
      expect(item).toBeTruthy();
      expect(item?.score).toBe(60);
    });

    it('王五开考并直接交卷（未作答）→ 0 分', async () => {
      const start = await request(app).post('/api/exams/exam-demo/start').set(bearer(ww));
      const id = start.body.data.id as string;
      const res = await request(app).post(`/api/records/${id}/submit`).set(bearer(ww)).send({});
      expect(res.body.code).toBe(0);
      expect(res.body.data.score).toBe(0);
    });
  });

  describe('记录详情展示字段（GET /records/:id）', () => {
    // 使用独立考试，避免在共享的 exam-demo 上新增交卷记录而影响报表聚合断言。
    let detailExamId = '';
    beforeAll(async () => {
      const res = await request(app)
        .post('/api/exams')
        .set(bearer(admin))
        .send({
          name: '详情展示字段专用考试',
          paperId: 'paper-demo',
          departmentIds: ['dept-rd'],
          startTime: new Date(Date.now() - 3600_000).toISOString(),
          endTime: new Date(Date.now() + 3600_000).toISOString(),
          durationMinutes: 30,
          passScore: 70,
        });
      detailExamId = res.body.data.id as string;
    });
    afterAll(async () => {
      if (!detailExamId) return;
      // exam_records → exams 为 ON DELETE RESTRICT，先清理记录再删考试。
      await query(`DELETE FROM exam_records WHERE exam_id = ?`, [detailExamId]);
      await request(app).delete(`/api/exams/${detailExamId}`).set(bearer(admin));
    });

    it('返回考试名称 / 及格线（数字）/ 姓名 / 科室名', async () => {
      const start = await request(app).post(`/api/exams/${detailExamId}/start`).set(bearer(zs));
      expect(start.body.code).toBe(0);
      const recordId = start.body.data.id as string;
      await request(app).post(`/api/records/${recordId}/submit`).set(bearer(zs)).send({});

      const res = await request(app).get(`/api/records/${recordId}`).set(bearer(zs));
      expect(res.body.code).toBe(0);
      const d = res.body.data;
      expect(d.examName).toBe('详情展示字段专用考试');
      expect(d.passScore).toBe(70);
      expect(typeof d.passScore).toBe('number');
      expect(d.userName).toBe('张三');
      expect(d.departmentName).toBe('研发部');
    });

    it('无科室考生的 departmentName 为空串（string，非 null/undefined）', async () => {
      // 直接落一条无科室考生（token 由测试自行签发，无需登录），记录与用户均无科室。
      await query(
        `INSERT INTO users (id, username, password_hash, name, role, department_id, status, created_at)
         VALUES (?, ?, ?, ?, 'examinee', NULL, 'active', ?)
         ON DUPLICATE KEY UPDATE id = id`,
        ['user-nodept', 'nodept', 'x', '无科室考生', nowDb()],
      );
      const nodept = signToken({ sub: 'user-nodept', role: 'examinee', departmentId: '' });

      // 冻结名单不会因后来新增用户而自动漂移；通过考试范围显式追加后再开考。
      const exam = await request(app).get(`/api/exams/${detailExamId}`).set(bearer(admin));
      const update = await request(app)
        .put(`/api/exams/${detailExamId}`)
        .set(bearer(admin))
        .send({ ...exam.body.data, includeUserIds: ['user-nodept'] });
      expect(update.body.code).toBe(0);

      const start = await request(app).post(`/api/exams/${detailExamId}/start`).set(bearer(nodept));
      expect(start.body.code).toBe(0);
      const recordId = start.body.data.id as string;
      await request(app).post(`/api/records/${recordId}/submit`).set(bearer(nodept)).send({});

      const res = await request(app).get(`/api/records/${recordId}`).set(bearer(nodept));
      expect(res.body.code).toBe(0);
      expect(res.body.data.departmentName).toBe('');
      expect(typeof res.body.data.departmentName).toBe('string');
      expect(res.body.data.userName).toBe('无科室考生');
    });

    it('列表接口（/records/my 与 /records?examId=）不附带展示字段（保持现状）', async () => {
      const mine = await request(app).get('/api/records/my?pageSize=100').set(bearer(zs));
      const myItem = (mine.body.data.list as Array<Record<string, unknown>>)[0];
      expect(myItem).toBeTruthy();
      expect(myItem.examName).toBeUndefined();
      expect(myItem.passScore).toBeUndefined();
      expect(myItem.userName).toBeUndefined();
      expect(myItem.departmentName).toBeUndefined();

      const all = await request(app).get(`/api/records?examId=${detailExamId}&pageSize=100`).set(bearer(admin));
      const examItem = (all.body.data.list as Array<Record<string, unknown>>)[0];
      expect(examItem).toBeTruthy();
      expect(examItem.examName).toBeUndefined();
      expect(examItem.departmentName).toBeUndefined();
    });
  });

  describe('答题次数上限（maxAttempts）', () => {
    /** 由管理员创建一场进行中的考试（指定答题次数上限）。 */
    async function createExam(name: string, maxAttempts: number): Promise<string> {
      const res = await request(app)
        .post('/api/exams')
        .set(bearer(admin))
        .send({
          name,
          paperId: 'paper-demo',
          departmentIds: ['dept-rd'],
          startTime: new Date(Date.now() - 3600_000).toISOString(),
          endTime: new Date(Date.now() + 3600_000).toISOString(),
          durationMinutes: 30,
          passScore: 60,
          maxAttempts,
        });
      expect(res.body.code).toBe(0);
      expect(res.body.data.maxAttempts).toBe(maxAttempts);
      return res.body.data.id as string;
    }

    /** 从 /api/exams/my 取指定考试项。 */
    async function myExamItem(
      examId: string,
    ): Promise<{ maxAttempts: number; attemptsUsed: number; recordStatus: string | null }> {
      const my = await request(app).get('/api/exams/my').set(bearer(zs));
      const item = (my.body.data as Array<{ id: string }>).find((e) => e.id === examId);
      expect(item).toBeTruthy();
      return item as unknown as { maxAttempts: number; attemptsUsed: number; recordStatus: string | null };
    }

    it('maxAttempts=1：交卷后再次开考 → 409 / 1008', async () => {
      const examId = await createExam('限一次考试', 1);
      const start1 = await request(app).post(`/api/exams/${examId}/start`).set(bearer(zs));
      expect(start1.body.code).toBe(0);
      expect(start1.body.data.attemptNo).toBe(1);
      await request(app).post(`/api/records/${start1.body.data.id}/submit`).set(bearer(zs)).send({});

      const start2 = await request(app).post(`/api/exams/${examId}/start`).set(bearer(zs));
      expect(start2.status).toBe(409);
      expect(start2.body.code).toBe(1008);
      expect(start2.body.message).toBe('答题次数已用完（最多 1 次）');
    });

    it('maxAttempts=2：可连续作答两次，attemptNo 与 attemptsUsed 递增', async () => {
      const examId = await createExam('可答两次考试', 2);

      // 第一次开考（attemptNo=1）→ 列表中 attemptsUsed=0、recordStatus=in_progress
      const start1 = await request(app).post(`/api/exams/${examId}/start`).set(bearer(zs));
      expect(start1.body.code).toBe(0);
      expect(start1.body.data.attemptNo).toBe(1);
      expect(await myExamItem(examId)).toMatchObject({ maxAttempts: 2, attemptsUsed: 0, recordStatus: 'in_progress' });

      // 交卷一次 → attemptsUsed=1、recordStatus=submitted
      await request(app).post(`/api/records/${start1.body.data.id}/submit`).set(bearer(zs)).send({});
      expect(await myExamItem(examId)).toMatchObject({ attemptsUsed: 1, recordStatus: 'submitted' });

      // 第二次开考（attemptNo=2，新记录）→ 进行中优先显示 in_progress，attemptsUsed 仍为 1
      const start2 = await request(app).post(`/api/exams/${examId}/start`).set(bearer(zs));
      expect(start2.body.code).toBe(0);
      expect(start2.body.data.attemptNo).toBe(2);
      expect(start2.body.data.id).not.toBe(start1.body.data.id);
      expect(await myExamItem(examId)).toMatchObject({ attemptsUsed: 1, recordStatus: 'in_progress' });

      // 两次均交卷 → attemptsUsed=2；再次开考耗尽 → 1008
      await request(app).post(`/api/records/${start2.body.data.id}/submit`).set(bearer(zs)).send({});
      expect(await myExamItem(examId)).toMatchObject({ attemptsUsed: 2, recordStatus: 'submitted' });

      const start3 = await request(app).post(`/api/exams/${examId}/start`).set(bearer(zs));
      expect(start3.status).toBe(409);
      expect(start3.body.code).toBe(1008);
      expect(start3.body.message).toBe('答题次数已用完（最多 2 次）');

      // 「我的成绩」含两次作答记录（attemptNo 分别为 1、2）
      const records = await request(app).get('/api/records/my?pageSize=100').set(bearer(zs));
      const mine = (records.body.data.list as Array<{ id: string; attemptNo: number }>).filter(
        (r) => r.id === start1.body.data.id || r.id === start2.body.data.id,
      );
      expect(mine).toHaveLength(2);
      expect(mine.map((r) => r.attemptNo).sort()).toEqual([1, 2]);
    });

    it('考试列表携带 maxAttempts（演示考试为 2）', async () => {
      expect(await myExamItem('exam-demo')).toMatchObject({ maxAttempts: 2 });
    });
  });

  describe('用户列表携带科室名（departmentName）', () => {
    it('GET /api/users 返回 departmentName（有科室为科室名，无科室为空串）', async () => {
      const res = await request(app).get('/api/users').set(bearer(admin));
      expect(res.body.code).toBe(0);
      const list = res.body.data as Array<{ username: string; departmentId: string; departmentName: string }>;
      expect(list.find((u) => u.username === 'zhangsan')).toMatchObject({ departmentId: 'dept-rd', departmentName: '研发部' });
      expect(list.find((u) => u.username === 'admin')).toMatchObject({ departmentId: '', departmentName: '' });
    });
  });

  describe('组卷抽题（数量不足返回 shortages）', () => {
    it('抽题数量超出库存 → questions 为空且返回缺口明细', async () => {
      const res = await request(app)
        .post('/api/papers/draw-questions')
        .set(bearer(admin))
        .send({ bankIds: ['bank-security'], rules: { single: { count: 999, score: 5 } } });
      expect(res.body.code).toBe(0);
      expect(res.body.data.questions).toHaveLength(0);
      expect(res.body.data.shortages).toHaveLength(1);
      expect(res.body.data.shortages[0]).toMatchObject({ type: 'single', required: 999, available: 2 });
    });

    it('抽题充足 → 返回指定数量题目且无缺口', async () => {
      const res = await request(app)
        .post('/api/papers/draw-questions')
        .set(bearer(admin))
        .send({ bankIds: ['bank-security'], rules: { single: { count: 2, score: 5 }, judge: { count: 2, score: 5 } } });
      expect(res.body.code).toBe(0);
      expect(res.body.data.questions).toHaveLength(4);
      expect(res.body.data.shortages).toHaveLength(0);
    });
  });

  describe('题库删除（非级联提示影响面 / 级联删除）', () => {
    let bankId = '';
    let q1Id = '';

    it('创建题库并新增 2 道试题', async () => {
      const b = await request(app)
        .post('/api/banks')
        .set(bearer(admin))
        .send({ name: '级联删除测试库', description: '', authorIds: ['user-author'] });
      expect(b.body.code).toBe(0);
      bankId = b.body.data.id;

      const qa = await request(app)
        .post('/api/questions')
        .set(bearer(author))
        .send({ bankId, type: 'single', stem: '级联题一', options: ['选项一', '选项二'], answer: [0], defaultScore: 5, analysis: '', subject: '云测试' });
      q1Id = qa.body.data.id;

      await request(app)
        .post('/api/questions')
        .set(bearer(author))
        .send({ bankId, type: 'single', stem: '级联题二', options: ['选项一', '选项二'], answer: [1], defaultScore: 5, analysis: '', subject: '云测试' });

      expect(q1Id).toBeTruthy();
    });

    it('用其中 1 道题建立试卷（形成引用）', async () => {
      const res = await request(app)
        .post('/api/papers')
        .set(bearer(author))
        .send({ name: '级联引用卷', description: '', bankIds: [bankId], questions: [{ questionId: q1Id, score: 5 }] });
      expect(res.body.code).toBe(0);
    });

    it('非级联删除有题题库 → 409 / 1005 且提示影响面', async () => {
      const res = await request(app).delete(`/api/banks/${bankId}`).set(bearer(admin));
      expect(res.status).toBe(409);
      expect(res.body.code).toBe(1005);
      expect(res.body.message).toContain('2 道试题');
      expect(res.body.message).toContain('1 道已被 1 份试卷引用');
    });

    it('即使请求级联，被试卷引用的题目也禁止物理删除', async () => {
      const res = await request(app).delete(`/api/banks/${bankId}?cascade=true`).set(bearer(admin));
      expect(res.status).toBe(409);
      expect(res.body.code).toBe(1005);
      expect(res.body.message).toContain('试卷引用');
      const detail = await request(app).get(`/api/banks/${bankId}`).set(bearer(author));
      expect(detail.body.code).toBe(0);
    });
  });

  describe('树形科目题库（层级 / 叶子约束 / 权限继承）', () => {
    let rootId = '';
    let leafId = '';
    let folderId = '';
    let descendantId = '';

    it('仅管理员可建科目，子科目默认继承根科目的编辑人员', async () => {
      const denied = await request(app)
        .post('/api/banks')
        .set(bearer(author))
        .send({ name: '越权创建科目' });
      expect(denied.status).toBe(403);

      const root = await request(app)
        .post('/api/banks')
        .set(bearer(admin))
        .send({ name: '树测试根科目', sortOrder: 90, authorIds: ['user-author'] });
      expect(root.body.code).toBe(0);
      rootId = root.body.data.id;

      const leaf = await request(app)
        .post('/api/banks')
        .set(bearer(admin))
        .send({ name: '树测试叶子题库', parentId: rootId, sortOrder: 1, allowPractice: true });
      expect(leaf.body.code).toBe(0);
      leafId = leaf.body.data.id;

      const folder = await request(app)
        .post('/api/banks')
        .set(bearer(admin))
        .send({ name: '树测试目录', parentId: rootId, sortOrder: 2 });
      folderId = folder.body.data.id;
      const descendant = await request(app)
        .post('/api/banks')
        .set(bearer(admin))
        .send({ name: '树测试孙级题库', parentId: folderId });
      descendantId = descendant.body.data.id;

      const tree = await request(app).get('/api/banks/tree').set(bearer(author));
      const rootNode = tree.body.data.find((node: { id: string }) => node.id === rootId);
      expect(rootNode).toMatchObject({ isLeaf: false, canView: true, canEdit: true });
      expect(rootNode.children.map((node: { id: string }) => node.id)).toEqual([leafId, folderId]);

      const leaves = await request(app).get('/api/banks').set(bearer(author));
      const ids = leaves.body.data.map((bank: { id: string }) => bank.id);
      expect(ids).toEqual(expect.arrayContaining([leafId, descendantId]));
      expect(ids).not.toContain(rootId);
      expect(ids).not.toContain(folderId);
    });

    it('拦截循环移动、同级重名及在非空叶子下新增子科目', async () => {
      const cycle = await request(app)
        .put(`/api/banks/${rootId}`)
        .set(bearer(admin))
        .send({ name: '树测试根科目', parentId: descendantId, sortOrder: 90, status: 'active', authorIds: ['user-author'] });
      expect(cycle.status).toBe(400);
      expect(cycle.body.code).toBe(1001);

      const duplicate = await request(app)
        .post('/api/banks')
        .set(bearer(admin))
        .send({ name: '树测试叶子题库', parentId: rootId });
      expect(duplicate.status).toBe(409);
      expect(duplicate.body.code).toBe(1005);

      const question = await request(app)
        .post('/api/questions')
        .set(bearer(author))
        .send({ bankId: leafId, type: 'judge', stem: '树形题库叶子约束题', options: [], answer: [0], subject: '旧客户端伪造科目' });
      expect(question.body.data.subject).toBe('树测试叶子题库');

      const child = await request(app)
        .post('/api/banks')
        .set(bearer(admin))
        .send({ name: '不应创建的下级', parentId: leafId });
      expect(child.status).toBe(409);
      expect(child.body.code).toBe(1005);
    });

    it('上级停用后后代视为停用，作者直连也被拒绝', async () => {
      const disabled = await request(app)
        .put(`/api/banks/${rootId}`)
        .set(bearer(admin))
        .send({ name: '树测试根科目', parentId: null, sortOrder: 90, status: 'disabled', authorIds: ['user-author'] });
      expect(disabled.body.code).toBe(0);

      const tree = await request(app).get('/api/banks/tree').set(bearer(admin));
      const rootNode = tree.body.data.find((node: { id: string }) => node.id === rootId);
      expect(rootNode.children[0].effectiveStatus).toBe('disabled');

      const direct = await request(app).get(`/api/banks/${leafId}`).set(bearer(author));
      expect(direct.status).toBe(403);
      expect(direct.body.code).toBe(1003);
    });
  });

  describe('报表聚合（summary / bands / departments / wrongRate）', () => {
    it('exam-demo 聚合结果正确', async () => {
      const res = await request(app).get('/api/reports/exams/exam-demo').set(bearer(admin));
      expect(res.body.code).toBe(0);
      const { summary, bands, departments, wrongRate } = res.body.data;

      // 张三 60 分、王五 0 分
      expect(summary).toMatchObject({ examId: 'exam-demo', total: 2, avgScore: 30, maxScore: 60, minScore: 0, passRate: 0.5 });
      // 分数段：0 → <60；60 → 60~69
      expect((bands as Array<{ count: number }>).map((b) => b.count)).toEqual([1, 1, 0, 0, 0]);
      // 科室对比：仅研发部
      expect(departments).toHaveLength(1);
      expect(departments[0]).toMatchObject({ departmentId: 'dept-rd', departmentName: '研发部', count: 2, avgScore: 30, passRate: 0.5 });
      // 错题率：10 题；后 4 题（q-07~q-10）两人都错 → 错误率 1；前 6 题仅王五错 → 0.5
      expect(wrongRate).toHaveLength(10);
      expect(wrongRate[0]).toMatchObject({ questionId: 'q-07', wrongCount: 2, totalAnswered: 2, wrongRate: 1 });
      expect(wrongRate[4]).toMatchObject({ wrongRate: 0.5 });
    });
  });
});
