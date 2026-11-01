import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import ExcelJS from 'exceljs';
import type { RowDataPacket } from 'mysql2/promise';
import { app } from '../app.js';
import { prepareTestDb } from './db.js';
import { closePool, pool, query } from '../db/pool.js';
import { signToken } from '../middleware/auth.js';
import { migrateCourseAudience } from '../db/courseAudienceMigration.js';

const credentials = (id: string, role: 'admin' | 'author' | 'examinee' = 'examinee') => ({ Authorization: 'Bearer ' + signToken({ sub: id, role, departmentId: '' }) });
const admin = credentials('user-admin', 'admin'), learner = credentials('user-zhangsan'), other = credentials('user-lisi');
const input = () => ({ title: '课程人员与学习进度测试', category: '安全学习', cover: '/courses/flower.svg', description: '课程说明', instructor: '教学团队', chapters: [
  { id: 'chapter-a', title: '安全基础', lessons: [{ id: 'lesson-a', title: '安全第一课', src: 'https://example.com/a.mp4', durationLabel: '01:00' }, { id: 'lesson-b', title: '安全第二课', src: 'https://example.com/b.mp4', durationLabel: '02:00' }] },
] });
async function create(body = input()) {
  const result = await request(app).post('/api/courses/manage').set(admin).send(body);
  expect(result.status, JSON.stringify(result.body)).toBe(200); return result.body.data;
}
async function bind(id: string, departmentIds = ['dept-rd'], userIds: string[] = []) {
  const course = (await request(app).get(`/api/courses/manage/${id}`).set(admin)).body.data;
  const result = await request(app).put(`/api/courses/manage/${id}/audience`).set(admin).send({ revision: course.revision, departmentIds, userIds });
  expect(result.status, JSON.stringify(result.body)).toBe(200); return result.body.data;
}
async function publish(id: string) {
  const course = (await request(app).get(`/api/courses/manage/${id}`).set(admin)).body.data;
  const result = await request(app).put(`/api/courses/manage/${id}/status`).set(admin).send({ revision: course.revision, status: 'published' });
  expect(result.status, JSON.stringify(result.body)).toBe(200); return result.body.data;
}
async function saveProgress(id: string, user = learner, lessonId = 'lesson-a', completed = false, position = 10) {
  const result = await request(app).put(`/api/courses/progress/${id}/${lessonId}`).set(user).send({ position, duration: 60, completed, revision: 0, clientId: 'report-device', sequence: 1 });
  expect(result.status, JSON.stringify(result.body)).toBe(200); return result.body.data;
}
const report = (id: string, filter = {}) => request(app).get(`/api/courses/manage/${id}/progress`).set(admin).query(filter);
beforeAll(async () => { await prepareTestDb(); await request(app).post('/api/courses/manage/categories').set(admin).send({ name: '安全学习' }); });
beforeEach(async () => {
  await query("UPDATE users SET department_id = 'dept-rd', status = 'active' WHERE id IN ('user-zhangsan', 'user-wangwu')");
  await query("UPDATE users SET department_id = 'dept-mkt', status = 'active' WHERE id = 'user-lisi'");
});
afterAll(closePool);

describe('课程绑定与人员进度', () => {
  it('已有课程增量迁移重复执行安全，保留公开状态和观看数据', async () => {
    const course = await create();
    await query("UPDATE courses SET status = 'published' WHERE id = ?", [course.id]);
    // Only the isolated *_test database is touched by this simulated pre-upgrade schema.
    await query('ALTER TABLE courses DROP COLUMN audience_json');
    const conn = await pool.getConnection();
    try { await migrateCourseAudience(conn); await migrateCourseAudience(conn); } finally { conn.release(); }
    expect((await request(app).get(`/api/courses/${course.id}`).set(other)).status).toBe(200);
    expect((await request(app).get(`/api/courses/manage/${course.id}/audience`).set(admin)).body.data).toMatchObject({ mode: 'public', revision: course.revision });
    await saveProgress(course.id, other);
    expect((await report(course.id)).body.data.total).toBe(3);
    await bind(course.id);
    expect((await request(app).get(`/api/courses/${course.id}`).set(other)).status).toBe(404);
    expect((await report(course.id, { scope: 'history' })).body.data.list[0]).toMatchObject({ userId: 'user-lisi', status: 'learning' });
  });
  it('新课程空绑定不能上架，绑定后可以上架；规则不泄露到学员响应', async () => {
    const course = await create();
    const before = await request(app).put(`/api/courses/manage/${course.id}/status`).set(admin).send({ revision: course.revision, status: 'published' });
    expect(before.status).toBe(400); expect(before.body.message).toContain('绑定');
    await bind(course.id); await publish(course.id);
    const response = await request(app).get(`/api/courses/${course.id}`).set(learner);
    expect(response.status).toBe(200); expect(response.body.data).not.toHaveProperty('audience_json'); expect(response.body.data).not.toHaveProperty('userIds');
  });
  it('科室级联与指定人员取并集去重，新加入和调动立即生效', async () => {
    await query("INSERT INTO departments (id, name, description, parent_id, created_at) VALUES ('dept-child', '研发子科室', '', 'dept-rd', NOW(3))");
    const course = await create(); await bind(course.id, ['dept-rd', 'dept-child'], ['user-zhangsan', 'user-lisi']); await publish(course.id);
    await query("UPDATE users SET department_id = 'dept-child' WHERE id = 'user-wangwu'");
    expect((await report(course.id)).body.data.total).toBe(3);
    await query("INSERT INTO users (id, username, password_hash, name, role, role_id, department_id, status, created_at) SELECT 'user-course-new', 'course-new', password_hash, '新增学员', role, role_id, 'dept-child', 'active', NOW(3) FROM users WHERE id = 'user-zhangsan'");
    expect((await report(course.id)).body.data.total).toBe(4);
    await query("UPDATE users SET department_id = 'dept-mkt' WHERE id IN ('user-zhangsan', 'user-wangwu')");
    expect((await request(app).get(`/api/courses/${course.id}`).set(learner)).status).toBe(200); // direct assignment survives transfer
    expect((await request(app).get(`/api/courses/${course.id}`).set(credentials('user-wangwu'))).status).toBe(404);
    await query("UPDATE users SET status = 'disabled' WHERE id = 'user-course-new'");
    expect((await report(course.id)).body.data.total).toBe(2);
  });
  it('范围外账号不能通过详情、进度、切节或旧记录导入绕过；重新绑定恢复记录', async () => {
    const course = await create(); await bind(course.id); await publish(course.id); await saveProgress(course.id);
    await bind(course.id, ['dept-mkt']);
    expect((await request(app).get('/api/courses').set(learner)).body.data.some((row: { id: string }) => row.id === course.id)).toBe(false);
    expect((await request(app).get(`/api/courses/${course.id}`).set(learner)).status).toBe(404);
    expect((await request(app).get('/api/courses/progress').set(learner)).body.data.courses[course.id]).toBeUndefined();
    expect((await request(app).put(`/api/courses/progress/${course.id}/selection`).set(learner).send({ lessonId: 'lesson-b' })).status).toBe(404);
    expect((await request(app).put(`/api/courses/progress/${course.id}/lesson-a`).set(learner).send({ position: 60, duration: 60, completed: true, revision: 1, clientId: 'report-device', sequence: 2 })).status).toBe(404);
    const imported = await request(app).post('/api/courses/progress/import').set(learner).send({ lessons: [{ courseId: course.id, lessonId: 'lesson-b', position: 60, duration: 60, completed: true }] });
    expect(imported.status).toBe(200); expect(imported.body.data.courses[course.id]).toBeUndefined();
    expect((await query<RowDataPacket[]>('SELECT * FROM course_progress WHERE course_id = ? AND user_id = ?', [course.id, 'user-zhangsan']))).toHaveLength(1);
    await bind(course.id);
    expect((await request(app).get('/api/courses/progress').set(learner)).body.data.courses[course.id].lessons['lesson-a'].position).toBe(10);
  });
  it('包含未看课人员；选择小节不算开始；完成率、小节明细和筛选分页一致', async () => {
    const course = await create(); await bind(course.id, ['dept-rd', 'dept-mkt']); await publish(course.id);
    await request(app).put(`/api/courses/progress/${course.id}/selection`).set(other).send({ lessonId: 'lesson-a' });
    let response = (await report(course.id)).body.data;
    expect(response.summary).toEqual({ total: 3, notStarted: 3, learning: 0, completed: 0, completionRate: 0 });
    expect(response.list.find((row: { userId: string }) => row.userId === 'user-lisi').lastLearnedAt).toBe('');
    await saveProgress(course.id, learner, 'lesson-a', true, 60);
    await saveProgress(course.id, learner, 'lesson-b', true, 60);
    await saveProgress(course.id, credentials('user-wangwu'));
    response = (await report(course.id, { pageSize: 1, page: 999 })).body.data;
    expect(response.list).toHaveLength(1); expect(response.page).toBe(3);
    expect(response.summary).toEqual({ total: 3, notStarted: 1, learning: 1, completed: 1, completionRate: 33.3 });
    const person = (await request(app).get(`/api/courses/manage/${course.id}/progress/user-zhangsan`).set(admin)).body.data;
    expect(person).toMatchObject({ status: 'completed', percent: 100, completedLessons: 2 }); expect(person.lessons).toHaveLength(2);
    expect((await report(course.id, { status: 'learning' })).body.data.list[0].userId).toBe('user-wangwu');
    expect((await report(course.id, { keyword: 'zhangsan', departmentId: 'dept-rd' })).body.data.total).toBe(1);
    await query("UPDATE users SET status = 'disabled' WHERE id = 'user-zhangsan'");
    expect((await report(course.id)).body.data.summary.completed).toBe(0);
    expect((await report(course.id, { scope: 'history' })).body.data.list[0]).toMatchObject({ userId: 'user-zhangsan', accountStatus: 'disabled', percent: 100 });
  });
  it('删除小节和更换视频不沿用旧完成记录，空课程不算完成', async () => {
    const course = await create(); await bind(course.id); const published = await publish(course.id); await saveProgress(course.id, learner, 'lesson-a', true, 60);
    const archived = (await request(app).put(`/api/courses/manage/${course.id}/status`).set(admin).send({ revision: published.revision, status: 'archived' })).body.data;
    const next = input(); next.chapters[0].lessons = [{ ...next.chapters[0].lessons[0], src: 'https://example.com/replaced.mp4' }];
    const changed = await request(app).put(`/api/courses/manage/${course.id}`).set(admin).send({ revision: archived.revision, course: next });
    expect(changed.status).toBe(200);
    const person = (await request(app).get(`/api/courses/manage/${course.id}/progress/user-zhangsan`).set(admin)).body.data;
    expect(person).toMatchObject({ totalLessons: 1, completedLessons: 0, percent: 0, status: 'not_started', lastLearnedAt: '' });
    const empty = await create({ ...input(), chapters: [] }); await bind(empty.id);
    expect((await report(empty.id)).body.data.list.every((row: { percent: number; status: string }) => row.percent === 0 && row.status === 'not_started')).toBe(true);
  });
  it('Excel包含所有筛选人员和小节，保留中文和北京时间；历史导出隔离', async () => {
    const course = await create(); await bind(course.id, ['dept-rd', 'dept-mkt']); await publish(course.id); await saveProgress(course.id, learner, 'lesson-a', true, 60);
    await query("UPDATE course_progress SET updated_at = '2026-10-30 00:15:00' WHERE course_id = ?", [course.id]);
    const download = async (filters = {}) => {
      const response = await request(app).get(`/api/courses/manage/${course.id}/progress/export`).set(admin).query(filters).buffer(true).parse((res, done) => {
        const chunks: Buffer[] = []; res.on('data', chunk => chunks.push(Buffer.from(chunk))); res.on('end', () => done(null, Buffer.concat(chunks)));
      });
      expect(response.status).toBe(200); expect(response.headers['content-disposition']).toContain('filename*=UTF-8');
      const workbook = new ExcelJS.Workbook(); await workbook.xlsx.load(response.body); return workbook;
    };
    const workbook = await download({ pageSize: 1 });
    expect(workbook.worksheets.map(sheet => sheet.name)).toEqual(['人员汇总', '小节明细']);
    const summary = workbook.worksheets[0], details = workbook.worksheets[1];
    expect(summary.rowCount).toBe(4); expect(details.rowCount).toBe(7);
    const rows = [2, 3, 4].map(index => summary.getRow(index).values as unknown[]);
    const zhang = rows.find(row => row[3] === 'zhangsan')!;
    expect(zhang[1]).toBe('课程人员与学习进度测试'); expect(zhang[9]).toBe(50); expect(zhang[10]).toBe('2026-10-30 08:15:00');
    expect(rows.filter(row => row[6] === '未开始')).toHaveLength(2);
    expect((await download({ keyword: 'zhangsan' })).worksheets[0].rowCount).toBe(2);
    await bind(course.id, ['dept-mkt']);
    expect((await download({ scope: 'history' })).worksheets[0].getRow(2).getCell(5).value).toBe('历史记录');
  });
  it('绑定可对已上架课程独立保存，并发和非法人员被拒绝，审计留痕', async () => {
    const course = await create(); const first = await bind(course.id); await publish(course.id);
    const stale = await request(app).put(`/api/courses/manage/${course.id}/audience`).set(admin).send({ revision: first.revision, departmentIds: [], userIds: [] });
    expect(stale.status).toBe(409);
    const current = (await request(app).get(`/api/courses/manage/${course.id}`).set(admin)).body.data;
    for (const body of [{ departmentIds: ['missing-dept'], userIds: [] }, { departmentIds: [], userIds: ['user-admin'] }, { departmentIds: [], userIds: ['missing-user'] }]) {
      expect((await request(app).put(`/api/courses/manage/${course.id}/audience`).set(admin).send({ revision: current.revision, ...body })).status).toBe(400);
    }
    await bind(course.id, [], []);
    expect((await request(app).get(`/api/courses/${course.id}`).set(learner)).status).toBe(404);
    expect((await query<RowDataPacket[]>("SELECT action FROM audit_logs WHERE target_id = ? AND action = 'course.audience'", [course.id])).length).toBe(2);
    expect((await request(app).get(`/api/courses/manage/${course.id}`).set(admin)).body.data.status).toBe('published');
  });
  it('管理接口统一校验身份、菜单权限与参数，学员看课菜单仍生效', async () => {
    const course = await create(); await bind(course.id); await publish(course.id);
    const routes = ['audience', 'progress', 'progress/export', 'progress/user-zhangsan'];
    for (const route of routes) {
      const endpoint = `/api/courses/manage/${course.id}/${route}`;
      expect((await request(app).get(endpoint)).status).toBe(401);
      expect((await request(app).get(endpoint).set(learner)).status).toBe(403);
      expect((await request(app).get(endpoint).set(credentials('user-author', 'author'))).status).toBe(403);
    }
    expect((await report(course.id, { scope: 'unknown' })).status).toBe(400);
    await query("INSERT INTO menu_overrides (user_id, menu_key, effect, updated_at) VALUES ('user-admin', 'course-manage', 'deny', NOW(3)), ('user-zhangsan', 'courses', 'deny', NOW(3))");
    try {
      for (const route of routes) expect((await request(app).get(`/api/courses/manage/${course.id}/${route}`).set(admin)).status).toBe(403);
      expect((await request(app).get(`/api/courses/${course.id}`).set(learner)).status).toBe(403);
    } finally { await query("DELETE FROM menu_overrides WHERE (user_id = 'user-admin' AND menu_key = 'course-manage') OR (user_id = 'user-zhangsan' AND menu_key = 'courses')"); }
  });
});
