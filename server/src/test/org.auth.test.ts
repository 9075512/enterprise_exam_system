/**
 * v1.6③ 组织与权限精细化 集成测试。
 * 1) 多级科室树：父科室考试覆盖子科室考生（级联授权）。
 * 2) 出题人题库授权：author 无法访问未授权题库，授权后可访问。
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../app.js';
import { prepareTestDb } from './db.js';
import { closePool } from '../db/pool.js';
import { signToken } from '../middleware/auth.js';

const bearer = (token: string): { Authorization: string } => ({ Authorization: `Bearer ${token}` });

const admin = signToken({ sub: 'user-admin', role: 'admin', departmentId: '' });

describe('v1.6③ 组织与权限精细化', () => {
  beforeAll(async () => {
    await prepareTestDb();
  }, 30000);

  afterAll(async () => {
    await closePool();
  });

  describe('多级科室树：父科室考试覆盖子科室考生', () => {
    let parentDeptId = '';
    let childDeptId = '';
    let examId = '';

    it('管理员创建父/子科室', async () => {
      const parent = await request(app)
        .post('/api/departments')
        .set(bearer(admin))
        .send({ name: '质量中心', description: '', parentId: '' });
      expect(parent.body.code).toBe(0);
      parentDeptId = parent.body.data.id;
      expect(parent.body.data.parentId).toBeNull();

      const child = await request(app)
        .post('/api/departments')
        .set(bearer(admin))
        .send({ name: '质量中心一组', description: '', parentId: parentDeptId });
      expect(child.body.code).toBe(0);
      childDeptId = child.body.data.id;
      expect(child.body.data.parentId).toBe(parentDeptId);
    });

    it('禁止将科室挂到自身或下级（防环）', async () => {
      const selfLoop = await request(app)
        .put(`/api/departments/${parentDeptId}`)
        .set(bearer(admin))
        .send({ name: '质量中心', description: '', parentId: parentDeptId });
      expect(selfLoop.body.code).toBe(1001);

      const descendantLoop = await request(app)
        .put(`/api/departments/${parentDeptId}`)
        .set(bearer(admin))
        .send({ name: '质量中心', description: '', parentId: childDeptId });
      expect(descendantLoop.body.code).toBe(1001);
    });

    it('有子科室的科室不可删除', async () => {
      const res = await request(app).delete(`/api/departments/${parentDeptId}`).set(bearer(admin));
      expect(res.body.code).toBe(1005);
    });

    it('子科室考生（挂在叶子节点）能看到父科室考试', async () => {
      // 在子科室下建考生
      const user = await request(app)
        .post('/api/users')
        .set(bearer(admin))
        .send({
          username: 'qa_child',
          name: '子科室考生',
          role: 'examinee',
          departmentId: childDeptId,
        });
      expect(user.body.code).toBe(0);
      const childToken = signToken({ sub: user.body.data.id, role: 'examinee', departmentId: childDeptId });

      // 考试只选父科室
      const exam = await request(app)
        .post('/api/exams')
        .set(bearer(admin))
        .send({
          name: '父科室覆盖子科室考试',
          paperId: 'paper-demo',
          departmentIds: [parentDeptId],
          startTime: new Date(Date.now() - 3600_000).toISOString(),
          endTime: new Date(Date.now() + 3600_000).toISOString(),
          durationMinutes: 30,
          passScore: 60,
        });
      expect(exam.body.code).toBe(0);
      examId = exam.body.data.id;

      const mine = await request(app).get('/api/exams/my').set(bearer(childToken));
      const ids = (mine.body.data as Array<{ id: string }>).map((x) => x.id);
      expect(ids).toContain(examId);
    });

    it('父科室考生（挂在父节点）也能看到父科室考试', async () => {
      const user = await request(app)
        .post('/api/users')
        .set(bearer(admin))
        .send({
          username: 'qa_parent',
          name: '父科室考生',
          role: 'examinee',
          departmentId: parentDeptId,
        });
      expect(user.body.code).toBe(0);
      const parentToken = signToken({ sub: user.body.data.id, role: 'examinee', departmentId: parentDeptId });

      const mine = await request(app).get('/api/exams/my').set(bearer(parentToken));
      const ids = (mine.body.data as Array<{ id: string }>).map((x) => x.id);
      expect(ids).toContain(examId);
    });
  });

  describe('出题人题库授权：未授权不可访问，授权后可访问', () => {
    let privateBankId = '';
    let author2Id = '';

    it('管理员创建私有题库（不授权任何出题人）与第二个出题人', async () => {
      const bank = await request(app)
        .post('/api/banks')
        .set(bearer(admin))
        .send({ name: '私有题库', description: '', category: '私有', authorIds: [] });
      expect(bank.body.code).toBe(0);
      privateBankId = bank.body.data.id;
      expect(bank.body.data.authorIds).toEqual([]);

      const author = await request(app)
        .post('/api/users')
        .set(bearer(admin))
        .send({ username: 'author2', name: '出题人二号', role: 'author' });
      expect(author.body.code).toBe(0);
      author2Id = author.body.data.id;
    });

    it('未授权出题人看不到私有题库（列表隔离）', async () => {
      const token = signToken({ sub: author2Id, role: 'author', departmentId: '' });
      const res = await request(app).get('/api/banks').set(bearer(token));
      const ids = (res.body.data as Array<{ id: string }>).map((b) => b.id);
      expect(ids).not.toContain(privateBankId);
    });

    it('未授权出题人访问私有题库详情 → 403 / 1003', async () => {
      const token = signToken({ sub: author2Id, role: 'author', departmentId: '' });
      const res = await request(app).get(`/api/banks/${privateBankId}`).set(bearer(token));
      expect(res.status).toBe(403);
      expect(res.body.code).toBe(1003);
    });

    it('授权后出题人可见并可访问', async () => {
      await request(app)
        .put(`/api/banks/${privateBankId}`)
        .set(bearer(admin))
        .send({ name: '私有题库', description: '', category: '私有', authorIds: [author2Id] });

      const token = signToken({ sub: author2Id, role: 'author', departmentId: '' });
      const list = await request(app).get('/api/banks').set(bearer(token));
      const ids = (list.body.data as Array<{ id: string }>).map((b) => b.id);
      expect(ids).toContain(privateBankId);

      const detail = await request(app).get(`/api/banks/${privateBankId}`).set(bearer(token));
      expect(detail.body.code).toBe(0);
      expect(detail.body.data.authorIds).toContain(author2Id);
    });
  });
});
