import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import jpeg from 'jpeg-js';
import { access, mkdir, readdir, rmdir, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { app } from '../app.js';
import { prepareTestDb } from './db.js';
import { examContent } from './examFixtures.js';
import { signToken } from '../middleware/auth.js';
import { closePool, pool, query } from '../db/pool.js';
import { DEFAULT_SETTINGS } from '../modules/settings/settings.defaults.js';
import { captureRoot, cleanupExpired, discardPhoto, resolveCaptureConfig, validatePhoto } from '../modules/captures/captures.service.js';
import { migrateCaptures } from '../db/capturesMigration.js';
import type { RowDataPacket } from 'mysql2/promise';
import * as archive from '../modules/maintenance/maintenance.repo.js';
import { nowDb } from '../utils/datetime.js';

const admin = signToken({ sub: 'user-admin', role: 'admin', departmentId: '' });
const author = signToken({ sub: 'user-author', role: 'author', departmentId: '' });
const student = signToken({ sub: 'user-zhangsan', role: 'examinee', departmentId: 'dept-rd' });
const other = signToken({ sub: 'user-wangwu', role: 'examinee', departmentId: 'dept-rd' });
const outsider = signToken({ sub: 'user-lisi', role: 'examinee', departmentId: 'dept-mkt' });
const headers = (token: string) => ({ Authorization: `Bearer ${token}` });
const jpg = jpeg.encode({ width: 4, height: 3, data: Buffer.alloc(4 * 3 * 4, 255) }, 70).data;
let examId = ''; let recordId = ''; let entryId = ''; let periodicId = '';
let payload: Record<string, unknown>;

beforeAll(async () => { await prepareTestDb(); });
afterAll(async () => {
  const rows = await query<RowDataPacket[]>('SELECT storage_key FROM exam_captures');
  await Promise.all(rows.map(row => discardPhoto(String(row.storage_key))));
  await closePool();
});

describe('考试抓拍', () => {
  it('全局默认关闭；单场覆盖、零/越界校验与继承', async () => {
    expect(resolveCaptureConfig(null, DEFAULT_SETTINGS)).toEqual({ enabled: false, intervalMinutes: 5, cameraPolicy: 'required', retentionDays: 30 });
    expect(resolveCaptureConfig({ enabled: true, intervalMinutes: 2, cameraPolicy: 'optional' }, DEFAULT_SETTINGS)).toMatchObject({ enabled: true, intervalMinutes: 2, cameraPolicy: 'optional' });
    expect(resolveCaptureConfig({ enabled: null, intervalMinutes: null, cameraPolicy: null }, { ...DEFAULT_SETTINGS, captureEnabled: true })).toMatchObject({ enabled: true, intervalMinutes: 5 });
    for (const change of [{ captureIntervalMinutes: 0 }, { captureIntervalMinutes: 61 }, { captureRetentionDays: 366 }, { captureCameraPolicy: 'ignore' }]) {
      expect((await request(app).put('/api/settings').set(headers(admin)).send({ ...DEFAULT_SETTINGS, ...change })).status).toBe(400);
    }
    payload = { name: '抓拍测试', ...(await examContent('paper-demo')), departmentIds: ['dept-rd'], startTime: new Date(Date.now() - 60000).toISOString(), endTime: new Date(Date.now() + 3600000).toISOString(), durationMinutes: 60, passScore: 60, maxAttempts: 2,
      captureSettings: { enabled: true, intervalMinutes: null, cameraPolicy: null } };
    const created = await request(app).post('/api/exams').set(headers(admin)).send(payload);
    expect(created.status, created.text).toBe(200); examId = created.body.data.id;
    expect(created.body.data.captureSettings).toMatchObject({ enabled: true, intervalMinutes: null });
    expect((await request(app).post('/api/exams').set(headers(admin)).send({ ...payload, captureSettings: { intervalMinutes: 61 } })).status).toBe(400);
  });
  it('配置接口隔离参与范围；旧答卷即使全局启用也保持关闭', async () => {
    expect((await request(app).get(`/api/exams/${examId}/capture-config`).set(headers(outsider))).status).toBe(403);
    const config = await request(app).get(`/api/exams/${examId}/capture-config`).set(headers(student));
    expect(config.body.data).toMatchObject({ enabled: true, intervalMinutes: 5, cameraPolicy: 'required' });
    const old = await request(app).post('/api/exams/exam-demo/start').set(headers(student));
    expect(old.status, old.text).toBe(200);
    await query('DELETE FROM exam_capture_sessions WHERE record_id = ?', [old.body.data.id]);
    await request(app).put('/api/settings').set(headers(admin)).send({ ...DEFAULT_SETTINGS, captureEnabled: true });
    const continued = await request(app).post('/api/exams/exam-demo/start').set(headers(student));
    expect(continued.body.data.captureConfig.enabled).toBe(false);
    await request(app).put('/api/settings').set(headers(admin)).send(DEFAULT_SETTINGS);
  });
  it('必拍缺图、伪造JPEG和超限均不产生新答卷', async () => {
    expect((await request(app).post(`/api/exams/${examId}/start`).set(headers(student))).status).toBe(400);
    expect((await request(app).post(`/api/exams/${examId}/start`).set(headers(student)).field('captureId', 'bad-image').attach('file', Buffer.from('fake jpeg'), { filename: 'fake.jpg', contentType: 'image/jpeg' })).status).toBe(400);
    expect((await request(app).post(`/api/exams/${examId}/start`).set(headers(student)).attach('file', Buffer.alloc(2 * 1024 * 1024 + 1), { filename: 'huge.jpg', contentType: 'image/jpeg' })).status).toBe(400);
    const rows = await query<RowDataPacket[]>('SELECT COUNT(*) AS n FROM exam_records WHERE exam_id = ?', [examId]);
    expect(Number(rows[0].n)).toBe(0);
  });
  it('首照成功后才开考；重复开考和照片请求幂等', async () => {
    const before = Date.now();
    const start = () => request(app).post(`/api/exams/${examId}/start`).set(headers(student)).field('captureId', 'entry-1').attach('file', jpg, { filename: 'entry.jpg', contentType: 'image/jpeg' });
    const first = await start(); expect(first.status, first.text).toBe(200); recordId = first.body.data.id;
    expect(new Date(first.body.data.startedAt).getTime()).toBeGreaterThanOrEqual(before - 1000);
    const again = await start(); expect(again.body.data.id).toBe(recordId); expect(again.body.data.startedAt).toBe(first.body.data.startedAt);
    const list = await request(app).get(`/api/records/${recordId}/captures`).set(headers(admin));
    expect(list.body.data.total).toBe(1); entryId = list.body.data.items[0].id;
    expect(list.body.data.config).toMatchObject({ intervalMinutes: 5, retentionDays: 30 });
  });
  it('照片元数据保存失败时回滚答卷并删除已写入的文件', async () => {
    const exam = await request(app).post('/api/exams').set(headers(admin)).send(payload);
    const before = (await readdir(captureRoot)).sort();
    await query("CREATE TRIGGER capture_test_failure BEFORE INSERT ON exam_captures FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'capture test persistence failure'");
    try {
      const failed = await request(app).post(`/api/exams/${exam.body.data.id}/start`).set(headers(student)).field('captureId', 'rollback-photo').attach('file', jpg, { filename: 'capture.jpg', contentType: 'image/jpeg' });
      expect(failed.status).toBe(500);
      const records = await query<RowDataPacket[]>('SELECT COUNT(*) AS n FROM exam_records WHERE exam_id = ?', [exam.body.data.id]);
      expect(Number(records[0].n)).toBe(0); expect((await readdir(captureRoot)).sort()).toEqual(before);
    } finally { await query('DROP TRIGGER capture_test_failure'); }
  });
  it('配置在作答时冻结，全局和单场后续修改不改变本次规则', async () => {
    await request(app).put('/api/settings').set(headers(admin)).send({ ...DEFAULT_SETTINGS, captureEnabled: true, captureIntervalMinutes: 1, captureCameraPolicy: 'optional', captureRetentionDays: 90 });
    const update = await request(app).put(`/api/exams/${examId}`).set(headers(admin)).send({ ...payload, captureSettings: { enabled: false, intervalMinutes: 2, cameraPolicy: 'optional' } });
    expect(update.status, update.text).toBe(200);
    const config = await request(app).get(`/api/exams/${examId}/capture-config`).set(headers(student));
    expect(config.body.data).toEqual({ enabled: true, intervalMinutes: 5, cameraPolicy: 'required', retentionDays: 30 });
    const detail = await request(app).get(`/api/records/${recordId}`).set(headers(student));
    expect(detail.body.data.captureConfig).toEqual(config.body.data);
    await request(app).put('/api/settings').set(headers(admin)).send(DEFAULT_SETTINGS);
  });
  it('本人上传、重试去重；拒绝他人上传、错误参数、空文件', async () => {
    const post = (token = student) => request(app).post(`/api/records/${recordId}/captures`).set(headers(token)).field('captureId', 'periodic-1').field('kind', 'periodic').attach('file', jpg, { filename: 'capture.jpg', contentType: 'image/jpeg' });
    const first = await post(); expect(first.status, first.text).toBe(200); periodicId = first.body.data.id;
    expect((await post()).body.data.id).toBe(periodicId);
    expect((await post(other)).status).toBe(403);
    expect((await request(app).post(`/api/records/${recordId}/captures`).set(headers(student)).send({ captureId: 'empty' })).status).toBe(400);
    expect((await request(app).post(`/api/records/${recordId}/captures`).set(headers(student)).send({ captureId: '../bad' })).status).toBe(400);
    const list = await request(app).get(`/api/records/${recordId}/captures`).set(headers(admin)); expect(list.body.data.total).toBe(2);
  });
  it('照片和分页记录只允许管理员查看，图片禁止缓存，无签名旁路', async () => {
    for (const token of [student, other, author]) {
      expect((await request(app).get(`/api/records/${recordId}/captures`).set(headers(token))).status).toBe(403);
      expect((await request(app).get(`/api/records/${recordId}/captures/${entryId}/image`).set(headers(token))).status).toBe(403);
    }
    expect((await request(app).get(`/api/records/${recordId}/captures/${entryId}/image?t=anything`)).status).toBe(401);
    const image = await request(app).get(`/api/records/${recordId}/captures/${entryId}/image`).set(headers(admin));
    expect(image.status).toBe(200); expect(image.headers['cache-control']).toContain('no-store'); expect(image.body).toEqual(jpg);
    expect((await request(app).get(`/api/records/wrong-record/captures/${entryId}/image`).set(headers(admin))).status).toBe(404);
    expect((await request(app).get(`/api/records/${recordId}/captures?page=0`).set(headers(admin))).status).toBe(400);
  });
  it('异常事件幂等，恢复事件更新状态，实时监考返回真实摘要', async () => {
    const post = (eventId: string, status: string) => request(app).post(`/api/records/${recordId}/captures/events`).set(headers(student)).send({ eventId, status, reason: '设备状态' });
    expect((await post('camera-down', 'interrupted')).status).toBe(200);
    await post('camera-back', 'ready'); await post('camera-down', 'interrupted');
    const monitor = await request(app).get(`/api/exams/${examId}/monitor`).set(headers(admin));
    expect(monitor.status, monitor.text).toBe(200);
    expect(monitor.body.data.rows.find((r: { recordId: string }) => r.recordId === recordId).captureSummary).toMatchObject({ count: 2, cameraStatus: 'ready', enabled: true });
  });
  it('可选模式无摄像头允许开考并留下原因，关闭模式无需图片', async () => {
    const optional = await request(app).post('/api/exams').set(headers(admin)).send({ ...payload, captureSettings: { enabled: true, cameraPolicy: 'optional' } });
    const start = await request(app).post(`/api/exams/${optional.body.data.id}/start`).set(headers(student)).send({ reason: '没有摄像头' });
    expect(start.status, start.text).toBe(200);
    const list = await request(app).get(`/api/records/${start.body.data.id}/captures`).set(headers(admin));
    expect(list.body.data.events[0].reason).toBe('没有摄像头'); expect(list.body.data.total).toBe(0);
    const closed = await request(app).post('/api/exams').set(headers(admin)).send({ ...payload, captureSettings: { enabled: false } });
    const disabled = await request(app).post(`/api/exams/${closed.body.data.id}/start`).set(headers(student)); expect(disabled.status).toBe(200);
    expect((await request(app).post(`/api/records/${disabled.body.data.id}/captures/events`).set(headers(student)).send({ eventId: 'off', status: 'ready' })).status).toBe(400);
  });
  it('抓拍异常不影响暂存和交卷，交卷后拒绝继续上传或上报', async () => {
    expect((await request(app).put(`/api/records/${recordId}/answers`).set(headers(student)).send({ answers: {} })).status).toBe(200);
    expect((await request(app).post(`/api/records/${recordId}/submit`).set(headers(student)).send({ auto: true })).status).toBe(200);
    expect((await request(app).post(`/api/records/${recordId}/captures`).set(headers(student)).field('captureId', 'after-submit').attach('file', jpg, { filename: 'photo.jpg', contentType: 'image/jpeg' })).status).toBe(409);
    expect((await request(app).post(`/api/records/${recordId}/captures/events`).set(headers(student)).send({ eventId: 'after-submit', status: 'ready' })).status).toBe(409);
  });
  it('归档不丢抓拍关联，到期拒绝读取并清理文件，保留过期元数据', async () => {
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction(); await archive.insertArchive([recordId], nowDb(), conn); await archive.deleteRecords([recordId], conn); await conn.commit();
    } finally { conn.release(); }
    expect((await request(app).get(`/api/records/${recordId}/captures`).set(headers(admin))).body.data.total).toBe(2);
    await query('UPDATE exam_captures SET expires_at = DATE_SUB(UTC_TIMESTAMP(3), INTERVAL 1 DAY) WHERE id = ?', [periodicId]);
    expect((await request(app).get(`/api/records/${recordId}/captures/${periodicId}/image`).set(headers(admin))).status).toBe(404);
    const rows = await query<RowDataPacket[]>('SELECT storage_key FROM exam_captures WHERE id = ?', [periodicId]);
    const filePath = path.join(captureRoot, String(rows[0].storage_key));
    // Simulate a filesystem deletion failure, then restore it for the next cleanup run.
    await unlink(filePath); await mkdir(filePath);
    try {
      await cleanupExpired();
      const pending = await query<RowDataPacket[]>('SELECT deleted_at FROM exam_captures WHERE id = ?', [periodicId]);
      expect(pending[0].deleted_at).toBeNull();
    } finally { await rmdir(filePath); await writeFile(filePath, jpg); }
    await cleanupExpired(); await cleanupExpired();
    await expect(access(path.join(captureRoot, String(rows[0].storage_key)))).rejects.toThrow();
    const list = await request(app).get(`/api/records/${recordId}/captures`).set(headers(admin));
    expect(list.body.data.items.find((p: { id: string }) => p.id === periodicId).expired).toBe(true);
    expect((await request(app).get(`/api/records/${recordId}/captures/${entryId}/image`).set(headers(admin))).status).toBe(200);
  });
  it('升级旧库可重复执行，不更改答卷和照片', async () => {
    await query('ALTER TABLE exams DROP COLUMN capture_settings');
    await query('ALTER TABLE exam_captures DROP COLUMN removed_at, DROP COLUMN removed_by, DROP COLUMN removed_by_name');
    await migrateCaptures(pool); await migrateCaptures(pool);
    const rows = await query<RowDataPacket[]>('SELECT COUNT(*) AS n FROM exam_captures WHERE record_id = ?', [recordId]); expect(Number(rows[0].n)).toBe(2);
    expect((await request(app).get(`/api/records/${recordId}/captures`).set(headers(admin))).status).toBe(200);
  });
  it('图片解码拒绝伪造内容和不支持的类型', () => {
    expect(() => validatePhoto({ buffer: jpg, size: jpg.length, mimetype: 'image/jpeg' })).not.toThrow();
    expect(() => validatePhoto({ buffer: jpg, size: jpg.length, mimetype: 'image/png' })).toThrow();
    expect(() => validatePhoto({ buffer: Buffer.from('not a JPEG'), size: 10, mimetype: 'image/jpeg' })).toThrow();
  });
});

describe('管理员删除考试抓拍', () => {
  let activeRecord = ''; let activeExam = ''; let photoId = '';
  const list = () => request(app).get(`/api/records/${activeRecord}/captures`).set(headers(admin));
  const remove = (id: string, token = admin) => request(app).delete(`/api/records/${activeRecord}/captures/${id}`).set(headers(token));
  const batch = (ids: string[], token = admin) => request(app).post(`/api/records/${activeRecord}/captures/batch-delete`).set(headers(token)).send({ captureIds: ids });
  async function upload(id: string) {
    const response = await request(app).post(`/api/records/${activeRecord}/captures`).set(headers(student)).field('captureId', id).attach('file', jpg, { filename: 'capture.jpg', contentType: 'image/jpeg' });
    expect(response.status, response.text).toBe(200); return response.body.data.id as string;
  }
  it('准备独立的进行中答卷', async () => {
    const exam = await request(app).post('/api/exams').set(headers(admin)).send({ ...payload, captureSettings: { enabled: true } });
    expect(exam.status, exam.text).toBe(200); activeExam = exam.body.data.id;
    const start = await request(app).post(`/api/exams/${activeExam}/start`).set(headers(student)).field('captureId', 'manual-entry').attach('file', jpg, { filename: 'entry.jpg', contentType: 'image/jpeg' });
    expect(start.status, start.text).toBe(200); activeRecord = start.body.data.id;
    photoId = (await list()).body.data.items[0].id;
  });
  it('拒绝未登录、考生和出题人删除，校验空数组和超限', async () => {
    expect((await request(app).delete(`/api/records/${activeRecord}/captures/${photoId}`)).status).toBe(401);
    expect((await request(app).post(`/api/records/${activeRecord}/captures/batch-delete`).send({ captureIds: [photoId] })).status).toBe(401);
    for (const token of [student, other, author]) {
      expect((await remove(photoId, token)).status).toBe(403);
      expect((await batch([photoId], token)).status).toBe(403);
    }
    expect((await batch([])).status).toBe(400);
    expect((await batch(Array(51).fill(photoId))).status).toBe(400);
  });
  it('不存在或跨答卷的照片使整批失败，不删除任何有效照片', async () => {
    expect((await batch([photoId, entryId])).status).toBe(404);
    expect((await batch([photoId, 'missing-photo'])).status).toBe(404);
    expect((await remove('missing-photo')).status).toBe(404);
    expect((await list()).body.data.items[0].status).toBe('available');
    expect((await request(app).get(`/api/records/${activeRecord}/captures/${photoId}/image`).set(headers(admin))).status).toBe(200);
  });
  it('单张删除清理文件并保留操作者和时间，不改变监考采集摘要', async () => {
    const before = await request(app).get(`/api/exams/${activeExam}/monitor`).set(headers(admin));
    const summary = before.body.data.rows.find((row: { recordId: string }) => row.recordId === activeRecord).captureSummary;
    const [file] = await query<RowDataPacket[]>('SELECT storage_key FROM exam_captures WHERE id = ?', [photoId]);
    const deleted = await remove(photoId); expect(deleted.status, deleted.text).toBe(200);
    expect(deleted.body.data).toEqual({ deletedCount: 1, alreadyDeletedCount: 0 });
    await expect(access(path.join(captureRoot, file.storage_key))).rejects.toThrow();
    const photos = (await list()).body.data;
    expect(photos.total).toBe(1);
    expect(photos.items[0]).toMatchObject({ id: photoId, status: 'deleted', expired: false, deletedBy: { id: 'user-admin' } });
    expect(photos.items[0].deletedBy.name).toBeTruthy(); expect(photos.items[0].deletedAt).toBeTruthy();
    expect((await request(app).get(`/api/records/${activeRecord}/captures/${photoId}/image`).set(headers(admin))).status).toBe(404);
    const after = await request(app).get(`/api/exams/${activeExam}/monitor`).set(headers(admin));
    expect(after.body.data.rows.find((row: { recordId: string }) => row.recordId === activeRecord).captureSummary).toEqual(summary);
    const logs = await query<RowDataPacket[]>("SELECT actor_id, detail FROM audit_logs WHERE action = 'capture.delete' AND target_id = ?", [activeRecord]);
    expect(logs).toHaveLength(1); expect(logs[0].actor_id).toBe('user-admin');
    expect(typeof logs[0].detail === 'string' ? JSON.parse(logs[0].detail) : logs[0].detail).toMatchObject({ count: 1, captureIds: [photoId] });
  });
  it('重复删除和上传重试不恢复图片，后续新抓拍正常', async () => {
    expect((await remove(photoId)).body.data).toEqual({ deletedCount: 0, alreadyDeletedCount: 1 });
    expect(await upload('manual-entry')).toBe(photoId);
    expect((await list()).body.data.items[0].status).toBe('deleted');
    const id = await upload('new-after-delete'); expect(id).not.toBe(photoId);
    const logs = await query<RowDataPacket[]>("SELECT id FROM audit_logs WHERE action = 'capture.delete' AND target_id = ?", [activeRecord]);
    expect(logs).toHaveLength(1);
  });
  it('批量去重，文件缺失视为已清理；删除失败立即禁止读取并可重试清理', async () => {
    const missing = await upload('missing-file'); const pending = await upload('retry-cleanup');
    const files = await query<RowDataPacket[]>('SELECT id, storage_key FROM exam_captures WHERE id IN (?, ?)', [missing, pending]);
    const missingPath = path.join(captureRoot, files.find(row => row.id === missing)!.storage_key);
    const pendingPath = path.join(captureRoot, files.find(row => row.id === pending)!.storage_key);
    await unlink(missingPath); await unlink(pendingPath); await mkdir(pendingPath);
    try {
      const response = await batch([missing, pending, pending]); expect(response.status, response.text).toBe(200);
      expect(response.body.data.deletedCount).toBe(2);
      const [row] = await query<RowDataPacket[]>('SELECT removed_at, deleted_at FROM exam_captures WHERE id = ?', [pending]);
      expect(row.removed_at).toBeTruthy(); expect(row.deleted_at).toBeNull();
      expect((await request(app).get(`/api/records/${activeRecord}/captures/${pending}/image`).set(headers(admin))).status).toBe(404);
    } finally { await rmdir(pendingPath); await writeFile(pendingPath, jpg); }
    await cleanupExpired(); await cleanupExpired();
    await expect(access(pendingPath)).rejects.toThrow();
    const [row] = await query<RowDataPacket[]>('SELECT deleted_at FROM exam_captures WHERE id = ?', [pending]); expect(row.deleted_at).toBeTruthy();
    expect((await list()).body.data.items.find((item: { id: string }) => item.id === pending).status).toBe('deleted');
  });
  it('已交卷和归档答卷均可删除，事件与答卷关联保留', async () => {
    const closedPhoto = await upload('closed-photo'); const archivedPhoto = await upload('archived-photo');
    await request(app).post(`/api/records/${activeRecord}/captures/events`).set(headers(student)).send({ eventId: 'before-delete', status: 'ready' });
    const eventTotal = (await list()).body.data.eventTotal;
    expect((await request(app).post(`/api/records/${activeRecord}/submit`).set(headers(student))).status).toBe(200);
    expect((await remove(closedPhoto)).status).toBe(200);
    const conn = await pool.getConnection();
    try { await conn.beginTransaction(); await archive.insertArchive([activeRecord], nowDb(), conn); await archive.deleteRecords([activeRecord], conn); await conn.commit(); }
    finally { conn.release(); }
    expect((await remove(archivedPhoto)).status).toBe(200);
    const photos = (await list()).body.data; expect(photos.eventTotal).toBe(eventTotal);
    expect(photos.items.find((item: { id: string }) => item.id === archivedPhoto).status).toBe('deleted');
  });
});
