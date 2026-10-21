import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { readFile, unlink } from 'node:fs/promises';
import path from 'node:path';
import { app } from '../app.js';
import { prepareTestDb } from './db.js';
import { closePool, query } from '../db/pool.js';
import { withTransaction } from '../db/pool.js';
import { migrateCourseCatalog } from '../db/courseCatalogMigration.js';
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
beforeAll(async () => { await prepareTestDb(); const res = await request(app).post('/api/courses/manage/categories').set(admin).send({ name: '护理' }); expect(res.status).toBe(200); });
afterAll(async () => {
  const files = await query<RowDataPacket[]>('SELECT filename FROM course_media');
  for (const file of files) if (/^[a-f0-9-]+\.(mp4|webm|png|jpg|webp|svg)$/.test(file.filename)) await unlink(path.join(courseMediaRoot, file.filename)).catch(() => {});
  await closePool();
});

describe('课程管理和学员端联动', () => {
  it('分类维护支持唯一名称、排序、改名同步课程和版本冲突；被引用的分类不能删除', async () => {
    const endpoint = '/api/courses/manage/categories';
    expect((await request(app).get(endpoint).set(learner)).status).toBe(403);
    const category = (await request(app).post(endpoint).set(admin).send({ name: '安全专题', sortOrder: 2 })).body.data;
    expect((await request(app).post(endpoint).set(admin).send({ name: '安全专题' })).status).toBe(409);
    const course = await create({ ...input(), categoryId: category.id, category: '伪造的分类名称' } as ReturnType<typeof input>);
    expect(course.category).toBe('安全专题'); expect(course.categoryId).toBe(category.id);
    const renamed = await request(app).put(`${endpoint}/${category.id}`).set(admin).send({ name: '矿山安全专题', sortOrder: 1, revision: category.revision });
    expect(renamed.status).toBe(200);
    expect((await request(app).get(`/api/courses/manage/${course.id}`).set(admin)).body.data.category).toBe('矿山安全专题');
    expect((await request(app).put(`${endpoint}/${category.id}`).set(admin).send({ name: '过期修改', revision: category.revision })).status).toBe(409);
    expect((await request(app).delete(`${endpoint}/${category.id}`).set(admin).query({ revision: renamed.body.data.revision })).status).toBe(409);
    const current = (await request(app).get(`/api/courses/manage/${course.id}`).set(admin)).body.data;
    expect((await request(app).delete(`/api/courses/manage/${course.id}`).set(admin).query({ revision: current.revision })).status).toBe(200);
    expect((await request(app).delete(`${endpoint}/${category.id}`).set(admin).query({ revision: renamed.body.data.revision })).status).toBe(200);
    expect((await request(app).post('/api/courses/manage').set(admin).send({ ...input(), categoryId: category.id })).status).toBe(400);
  });
  it('历史分类迁移可重复执行，保留课程状态、版本及章节内容', async () => {
    const course = await create();
    await query("UPDATE courses SET content_json = JSON_REMOVE(content_json, '$.categoryId') WHERE id = ?", [course.id]);
    await withTransaction(migrateCourseCatalog); await withTransaction(migrateCourseCatalog);
    const result = (await request(app).get('/api/courses/manage/' + course.id).set(admin)).body.data;
    expect(result).toMatchObject({ status: course.status, revision: course.revision, chapters: course.chapters, categoryId: course.categoryId });
  });
  it('富文本课程详情保留格式与本站图片、清除脚本和事件，学员详情可读取', async () => {
    const detailHtml = '<h2>学习目标</h2><p><strong>掌握安全知识</strong></p><ul><li>图文学习</li></ul><script>alert(1)</script><img src="/api/attachments/course-image?t=abc" onerror="alert(1)"><a href="javascript:alert(1)">错误链接</a>';
    const result = await request(app).post('/api/courses/manage').set(admin).send({ ...input(), detailHtml });
    expect(result.status).toBe(200); const course = result.body.data;
    expect(course.detailHtml).toContain('<strong>掌握安全知识</strong>'); expect(course.detailHtml).toContain('/api/attachments/course-image?t=abc');
    expect(course.detailHtml).not.toMatch(/script|onerror|javascript:/);
    await request(app).put(`/api/courses/manage/${course.id}/status`).set(admin).send({ status: 'published', revision: course.revision });
    expect((await request(app).get(`/api/courses/${course.id}`).set(learner)).body.data.detailHtml).toBe(course.detailHtml);
    expect((await request(app).post('/api/courses/manage').set(admin).send({ ...input(), detailHtml: '字'.repeat(20001) })).status).toBe(400);
  });
  it('观看记录按账号入库、换设备可读；迟到和重复写入不覆盖最新进度，完成状态保留', async () => {
    const course = await create(); await request(app).put(`/api/courses/manage/${course.id}/status`).set(admin).send({ revision: course.revision, status: 'published' });
    const endpoint = `/api/courses/progress/${course.id}/lesson-1`;
    const write = (body: Record<string, unknown>) => request(app).put(endpoint).set(learner).send({ position: 12, duration: 60, completed: false, revision: 0, clientId: 'device-a', sequence: 1, ...body });
    expect((await request(app).get('/api/courses/progress')).status).toBe(401);
    expect((await request(app).put(`/api/courses/progress/${course.id}/selection`).set(learner).send({ lessonId: 'lesson-1' })).status).toBe(200);
    expect((await write({})).body.data).toMatchObject({ position: 12, revision: 1 });
    expect((await write({ position: 20, sequence: 2 })).body.data).toMatchObject({ position: 20, revision: 2 });
    expect((await write({ position: 1 })).body.data).toMatchObject({ position: 20, revision: 2 });
    const deviceB = (await request(app).get('/api/courses/progress').set(learner)).body.data;
    expect(deviceB.courses[course.id]).toMatchObject({ lastLessonId: 'lesson-1', lessons: { 'lesson-1': { position: 20, revision: 2 } } });
    expect((await write({ position: 30, revision: 2, clientId: 'device-b' })).status).toBe(200);
    expect((await write({ position: 22, revision: 2, sequence: 99 })).status).toBe(409);
    expect((await write({ position: 60, completed: true, revision: 3, clientId: 'device-b', sequence: 2 })).body.data.completed).toBe(true);
    expect((await write({ position: 5, revision: 4, clientId: 'device-b', sequence: 3 })).body.data.completed).toBe(true);
    await request(app).put(`/api/courses/progress/${course.id}/selection`).set(learner).send({ lessonId: 'lesson-2' });
    await write({ position: 8, revision: 5, clientId: 'device-b', sequence: 4, userId: 'user-admin' });
    expect((await request(app).get('/api/courses/progress').set(learner)).body.data.courses[course.id].lastLessonId).toBe('lesson-2');
    expect((await request(app).get('/api/courses/progress').set(admin)).body.data.courses[course.id]).toBeUndefined();
    expect((await request(app).put(`/api/courses/progress/${course.id}/missing`).set(learner).send({ position: 1, duration: 60, completed: false, revision: 0, clientId: 'device-a', sequence: 1 })).status).toBe(404);
    expect((await write({ position: 61 })).status).toBe(400);
  });
  it('旧本地记录只补入缺失小节，不覆盖数据库；下架或更换视频后旧小节不再可写或返回', async () => {
    const course = await create(); const published = (await request(app).put(`/api/courses/manage/${course.id}/status`).set(admin).send({ revision: course.revision, status: 'published' })).body.data;
    await request(app).put(`/api/courses/progress/${course.id}/lesson-1`).set(learner).send({ position: 25, duration: 60, completed: false, revision: 0, clientId: 'device-a', sequence: 1 });
    const body = { lessons: [{ courseId: course.id, lessonId: 'lesson-1', position: 2, duration: 60, completed: false, selected: true }, { courseId: course.id, lessonId: 'lesson-2', position: 9, duration: 60, completed: true }, { courseId: course.id, lessonId: 'removed', position: 1, duration: 60, completed: false }] };
    const imported = await request(app).post('/api/courses/progress/import').set(learner).send(body);
    expect(imported.status).toBe(200); expect(imported.body.data.courses[course.id].lessons).toMatchObject({ 'lesson-1': { position: 25 }, 'lesson-2': { position: 9, completed: true } });
    expect(imported.body.data.courses[course.id].lessons.removed).toBeUndefined();
    const archived = (await request(app).put(`/api/courses/manage/${course.id}/status`).set(admin).send({ revision: published.revision, status: 'archived' })).body.data;
    expect((await request(app).get('/api/courses/progress').set(learner)).body.data.courses[course.id]).toBeUndefined();
    expect((await request(app).put(`/api/courses/progress/${course.id}/selection`).set(learner).send({ lessonId: 'lesson-1' })).status).toBe(404);
    const replacement = input(); replacement.chapters[0].lessons[0].src = 'https://example.com/replaced.mp4';
    const edited = (await request(app).put(`/api/courses/manage/${course.id}`).set(admin).send({ revision: archived.revision, course: replacement })).body.data;
    await request(app).put(`/api/courses/manage/${course.id}/status`).set(admin).send({ revision: edited.revision, status: 'published' });
    expect((await request(app).get('/api/courses/progress').set(learner)).body.data.courses[course.id].lessons['lesson-1']).toBeUndefined();
  });
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
