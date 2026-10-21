import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { readFile, unlink } from 'node:fs/promises';
import path from 'node:path';
import { app } from '../app.js';
import { prepareTestDb } from './db.js';
import { closePool, query } from '../db/pool.js';
import { signToken } from '../middleware/auth.js';
import { courseMediaRoot } from '../modules/courses/courses.media.js';
import type { ManagedCourse } from '../modules/courses/courses.schema.js';
import type { RowDataPacket } from 'mysql2/promise';

const admin = { Authorization: 'Bearer ' + signToken({ sub: 'user-admin', role: 'admin', departmentId: '' }) };
const learner = { Authorization: 'Bearer ' + signToken({ sub: 'user-zhangsan', role: 'examinee', departmentId: 'dept-rd' }) };
const author = { Authorization: 'Bearer ' + signToken({ sub: 'user-author', role: 'author', departmentId: '' }) };
const input = () => ({ title: '护理培训课程', category: '护理', instructor: '教学团队', description: '学习观察、记录和交接流程', cover: '/courses/flower.svg', level: '入门', sortOrder: 10, isDemo: false, chapters: [
  { id: 'chapter-1', title: '基础培训', lessons: [{ id: 'lesson-1', title: '第一小节', src: 'https://example.com/one.mp4', description: '视频说明', durationLabel: '05:00' }] },
  { id: 'chapter-2', title: '进阶培训', lessons: [{ id: 'lesson-2', title: '第二小节', src: 'https://example.com/two.mp4', description: '', durationLabel: '06:00' }] },
] });
async function create(body = input()): Promise<ManagedCourse> {
  const res = await request(app).post('/api/courses/manage').set(admin).send(body);
  expect(res.status, JSON.stringify(res.body)).toBe(200); return res.body.data;
}
beforeAll(prepareTestDb);
afterAll(async () => {
  const files = await query<RowDataPacket[]>('SELECT filename FROM course_media');
  for (const file of files) if (/^[a-f0-9-]+\.(mp4|webm|png|jpg|webp|svg)$/.test(file.filename)) await unlink(path.join(courseMediaRoot, file.filename)).catch(() => {});
  await closePool();
});

describe('课程管理和学员端联动', () => {
  it('按课程信息生成可持久读取的封面，转义输入，保存上架后学员能读取', async () => {
    const before = await query<RowDataPacket[]>('SELECT COUNT(*) AS total FROM courses');
    const result = await request(app).post('/api/courses/manage/cover').set(admin).send({ title: '瓦斯安全 <script>alert(1)</script> & "学习"', category: '瓦斯防治', instructor: '教学团队' });
    expect(result.status, JSON.stringify(result.body)).toBe(200);
    expect(result.body.data).toMatchObject({ mime: 'image/svg+xml' });
    expect((await query<RowDataPacket[]>('SELECT COUNT(*) AS total FROM courses'))[0].total).toBe(before[0].total);
    const svg = await readFile(path.join(courseMediaRoot, result.body.data.id + '.svg'), 'utf8');
    expect(svg).toContain('width="1280" height="720"'); expect(svg).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(svg).toContain('&amp; &quot;学习&quot;'); expect(svg).not.toContain('<script>'); expect(svg).not.toContain('<foreignObject');
    const media = await request(app).get(result.body.data.url);
    expect(media.status).toBe(200); expect(media.headers['content-type']).toContain('image/svg+xml');
    expect(media.headers['content-security-policy']).toBe("default-src 'none'; sandbox");
    expect((await request(app).get(`/api/courses/media/${result.body.data.id}?t=${'0'.repeat(32)}`)).status).toBe(403);
    const course = await create({ ...input(), cover: result.body.data.url });
    expect((await request(app).put(`/api/courses/manage/${course.id}/status`).set(admin).send({ revision: course.revision, status: 'published' })).status).toBe(200);
    expect((await request(app).get(`/api/courses/${course.id}`).set(learner)).body.data.cover).toBe(result.body.data.url);
  });
  it('生成封面要求管理权限和有效标题，不接受上传任意SVG', async () => {
    const endpoint = '/api/courses/manage/cover';
    expect((await request(app).post(endpoint).send({ title: '课程' })).status).toBe(401);
    expect((await request(app).post(endpoint).set(learner).send({ title: '课程' })).status).toBe(403);
    expect((await request(app).post(endpoint).set(author).send({ title: '课程' })).status).toBe(403);
    for (const body of [{ title: ' ' }, { title: '\u0000' }, { title: '测'.repeat(121) }, { title: '课程', category: '分'.repeat(51) }]) expect((await request(app).post(endpoint).set(admin).send(body)).status).toBe(400);
    await query("INSERT INTO menu_overrides (user_id, menu_key, effect, updated_at) VALUES ('user-admin', 'course-manage', 'deny', NOW(3))");
    try { expect((await request(app).post(endpoint).set(admin).send({ title: '课程' })).status).toBe(403); }
    finally { await query("DELETE FROM menu_overrides WHERE user_id = 'user-admin' AND menu_key = 'course-manage'"); }
    expect((await request(app).post('/api/courses/manage/media').set(admin).attach('file', Buffer.from('<svg/>'), { filename: 'untrusted.svg', contentType: 'image/svg+xml' })).status).toBe(400);
  });
  it('未登录、考生和出题人不能调用管理接口', async () => {
    expect((await request(app).get('/api/courses/manage')).status).toBe(401);
    expect((await request(app).post('/api/courses/manage').set(learner).send(input())).status).toBe(403);
    expect((await request(app).get('/api/courses/manage').set(author)).status).toBe(403);
  });
  it('保存草稿、上架、下架与删除完整联动；已上架课程不能直接编辑或删除', async () => {
    const created = await create();
    expect(created.status).toBe('draft');
    expect((await request(app).get(`/api/courses/${created.id}`).set(learner)).status).toBe(404);
    const publish = await request(app).put(`/api/courses/manage/${created.id}/status`).set(admin).send({ status: 'published', revision: created.revision });
    expect(publish.status).toBe(200); const current = publish.body.data as ManagedCourse;
    const detail = await request(app).get(`/api/courses/${created.id}`).set(learner);
    expect(detail.body.data.title).toBe(created.title);
    expect((await request(app).get('/api/courses').set(learner)).body.data.some((item: ManagedCourse) => item.id === created.id)).toBe(true);
    expect((await request(app).put(`/api/courses/manage/${created.id}`).set(admin).send({ revision: current.revision, course: input() })).status).toBe(409);
    expect((await request(app).delete(`/api/courses/manage/${created.id}`).set(admin).query({ revision: current.revision })).status).toBe(409);
    const archived = await request(app).put(`/api/courses/manage/${created.id}/status`).set(admin).send({ status: 'archived', revision: current.revision });
    expect(archived.status).toBe(200);
    expect((await request(app).get(`/api/courses/${created.id}`).set(learner)).status).toBe(404);
    expect((await request(app).delete(`/api/courses/manage/${created.id}`).set(admin).query({ revision: archived.body.data.revision })).status).toBe(200);
    expect((await request(app).get(`/api/courses/manage/${created.id}`).set(admin)).status).toBe(404);
    const audit = await query<RowDataPacket[]>('SELECT action FROM audit_logs WHERE target_id = ?', [created.id]);
    expect(audit.map(row => row.action)).toEqual(expect.arrayContaining(['course.create', 'course.status', 'course.delete']));
  });
  it('不完整课程可存草稿但不能上架，章节标识重复和非法视频地址被拒绝', async () => {
    const empty = { ...input(), chapters: [] }; const draft = await create(empty);
    const publish = await request(app).put(`/api/courses/manage/${draft.id}/status`).set(admin).send({ revision: draft.revision, status: 'published' });
    expect(publish.status).toBe(400); expect(publish.body.message).toContain('至少');
    const duplicate = input(); duplicate.chapters[1].lessons[0].id = 'lesson-1';
    expect((await request(app).post('/api/courses/manage').set(admin).send(duplicate)).status).toBe(400);
    const unsafe = input(); unsafe.chapters[0].lessons[0].src = 'javascript:alert(1)';
    expect((await request(app).post('/api/courses/manage').set(admin).send(unsafe)).status).toBe(400);
  });
  it('编辑重排保留小节ID，更换视频产生新ID；旧版本提交不能覆盖新修改', async () => {
    const created = await create(); const reordered = input(); reordered.chapters.reverse(); reordered.title = '已调整课程';
    const updated = await request(app).put(`/api/courses/manage/${created.id}`).set(admin).send({ revision: created.revision, course: reordered });
    expect(updated.status).toBe(200); expect(updated.body.data.chapters[0].lessons[0].id).toBe('lesson-2');
    const outdated = await request(app).put(`/api/courses/manage/${created.id}`).set(admin).send({ revision: created.revision, course: input() });
    expect(outdated.status).toBe(409);
    reordered.chapters[0].lessons[0].src = 'https://example.com/new.mp4';
    const replaced = await request(app).put(`/api/courses/manage/${created.id}`).set(admin).send({ revision: updated.body.data.revision, course: reordered });
    expect(replaced.status).toBe(200); expect(replaced.body.data.chapters[0].lessons[0].id).not.toBe('lesson-2');
    expect(replaced.body.data.chapters[1].lessons[0].id).toBe('lesson-1');
  });
  it('列表支持筛选分页及排序，超出末页会回到有效页', async () => {
    await create({ ...input(), title: '检索专用课程', sortOrder: 0 });
    const res = await request(app).get('/api/courses/manage').set(admin).query({ q: '检索专用', status: 'draft', page: 999, pageSize: 1 });
    expect(res.status).toBe(200); expect(res.body.data).toMatchObject({ total: 1, page: 1, pageSize: 1 });
    expect(res.body.data.list[0].title).toBe('检索专用课程');
  });
  it('管理菜单被收回后后端同步拒绝访问，不能靠角色绕过', async () => {
    await query("INSERT INTO menu_overrides (user_id, menu_key, effect, updated_at) VALUES ('user-admin', 'course-manage', 'deny', NOW(3))");
    try { expect((await request(app).get('/api/courses/manage').set(admin)).status).toBe(403); }
    finally { await query("DELETE FROM menu_overrides WHERE user_id = 'user-admin' AND menu_key = 'course-manage'"); }
  });
  it('媒体上传验证内容、签名和视频Range请求；考生不能上传', async () => {
    const mp4 = Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from('ftypisom'), Buffer.alloc(80)]);
    const upload = await request(app).post('/api/courses/manage/media').set(admin).attach('file', mp4, { filename: 'training.mp4', contentType: 'video/mp4' });
    expect(upload.status, JSON.stringify(upload.body)).toBe(200);
    const media = await request(app).get(upload.body.data.url).set('Range', 'bytes=0-15');
    expect(media.status).toBe(206); expect(media.headers['content-range']).toBe(`bytes 0-15/${mp4.length}`);
    expect(media.headers['content-type']).toContain('video/mp4');
    expect((await request(app).get(upload.body.data.url).set('Range', 'bytes=999999-')).status).toBe(416);
    expect((await request(app).get(`/api/courses/media/${upload.body.data.id}?t=${'0'.repeat(32)}`)).status).toBe(403);
    const invalid = await request(app).post('/api/courses/manage/media').set(admin).attach('file', Buffer.from('<script>bad</script>'), { filename: 'bad.mp4', contentType: 'video/mp4' });
    expect(invalid.status).toBe(400);
    expect((await request(app).post('/api/courses/manage/media').set(learner).attach('file', mp4, { filename: 'a.mp4', contentType: 'video/mp4' })).status).toBe(403);
  });
});
