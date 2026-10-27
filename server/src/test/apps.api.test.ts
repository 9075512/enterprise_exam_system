import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { readFile, rm, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import type { RowDataPacket } from 'mysql2/promise';
import { app } from '../app.js';
import { prepareTestDb } from './db.js';
import { query, closePool } from '../db/pool.js';
import { signToken } from '../middleware/auth.js';
import { appStorage, apkPath, prepareAppStorage } from '../modules/apps/apps.files.js';
import { checkAppReleaseSchema, ensureAppReleaseSchema } from '../modules/apps/apps.schema.js';

const fixture = fileURLToPath(new URL('./fixtures/learner-1.0.2.apk', import.meta.url));
const admin = { Authorization: 'Bearer ' + signToken({ sub: 'user-admin', role: 'admin', departmentId: '' }) };
const learner = { Authorization: 'Bearer ' + signToken({ sub: 'user-zhangsan', role: 'examinee', departmentId: 'dept-rd' }) };
const author = { Authorization: 'Bearer ' + signToken({ sub: 'user-author', role: 'author', departmentId: '' }) };
let release: { id: string; revision: number; downloadUrl: string };
async function upload(code = 10002, name = '1.0.2') {
  return request(app).post('/api/apps/manage').set(admin).field('appName', '卓达智学').field('versionName', name)
    .field('versionCode', code).field('minAndroid', '8.0').field('releaseNotes', '新登录页\n手机导航优化').attach('file', fixture);
}
beforeAll(async () => { await prepareTestDb(); await prepareAppStorage(); });
afterAll(async () => {
  const rows = await query<RowDataPacket[]>('SELECT file_key FROM app_releases');
  for (const row of rows) await rm(apkPath(row.file_key), { force: true });
  await closePool();
});
describe('App distribution lifecycle', () => {
  it('checks existing schema without DDL and detects a deployment with a missing table', async () => {
    await checkAppReleaseSchema();
    await ensureAppReleaseSchema();
    await query('RENAME TABLE app_releases TO app_releases_readiness_test');
    try { await expect(checkAppReleaseSchema()).rejects.toMatchObject({ code: 'ER_NO_SUCH_TABLE' }); }
    finally { await query('RENAME TABLE app_releases_readiness_test TO app_releases'); }
    await checkAppReleaseSchema();
  });
  it('serves a public empty state while protecting management from anonymous and learner/author accounts', async () => {
    expect((await request(app).get('/api/apps/latest')).body.data).toBeNull();
    expect((await request(app).get('/api/apps/manage')).status).toBe(401);
    expect((await request(app).get('/api/apps/manage').set(learner)).status).toBe(403);
    expect((await request(app).get('/api/apps/manage').set(author)).status).toBe(403);
    expect((await request(app).post('/api/apps/manage').set(learner)).status).toBe(403);
  });
  it('saves an actual APK as a non-public draft and calculates its checksum', async () => {
    const res = await upload(); expect(res.status, JSON.stringify(res.body)).toBe(200);
    release = res.body.data;
    expect(res.body.data.status).toBe('draft');
    expect(res.body.data.sha256).toBe(createHash('sha256').update(await readFile(fixture)).digest('hex'));
    expect((await request(app).get(release.downloadUrl)).status).toBe(404);
    expect((await request(app).get('/api/apps/latest')).body.data).toBeNull();
    expect(JSON.stringify(res.body.data)).not.toContain('file_key');
  });
  it('rejects duplicate version codes and malformed archives without leaving orphan uploads', async () => {
    const before = (await readdir(appStorage)).sort();
    expect((await upload()).status).toBe(409);
    const invalid = await request(app).post('/api/apps/manage').set(admin).field('versionName', '1.0.3').field('versionCode', '10003').field('releaseNotes', 'test').attach('file', Buffer.from('not-a-zip'), 'broken.apk');
    expect(invalid.status).toBe(400);
    expect((await readdir(appStorage)).sort()).toEqual(before);
  });
  it('publishes atomically and returns the original APK bytes with a download filename', async () => {
    const result = await request(app).put(`/api/apps/manage/${release.id}/status`).set(admin).send({ revision: 1, status: 'published' });
    expect(result.status, JSON.stringify(result.body)).toBe(200);
    const latest = (await request(app).get('/api/apps/latest')).body.data;
    expect(latest.id).toBe(release.id); expect(latest.revision).toBe(2);
    expect(Date.parse(latest.publishedAt)).toBeLessThanOrEqual(Date.now() + 1000);
    const download = await request(app).get(release.downloadUrl).buffer(true).parse((res, callback) => {
      const chunks: Buffer[] = []; res.on('data', chunk => chunks.push(Buffer.from(chunk))); res.on('end', () => callback(null, Buffer.concat(chunks)));
    });
    expect(download.status).toBe(200); expect(download.headers['content-disposition']).toContain('zhuoda-learner-1.0.2.apk');
    expect(download.body).toEqual(await readFile(fixture));
    await new Promise(resolve => setTimeout(resolve, 30));
    expect((await request(app).get('/api/apps/manage').set(admin)).body.data[0].downloadCount).toBe(1);
  });
  it('rejects stale edits, invalid statuses and mutable version codes', async () => {
    expect((await request(app).put(`/api/apps/manage/${release.id}/status`).set(admin).send({ revision: 1, status: 'withdrawn' })).status).toBe(409);
    expect((await request(app).put(`/api/apps/manage/${release.id}/status`).set(admin).send({ revision: 2, status: 'arbitrary' })).status).toBe(400);
    const input = { appName: '卓达智学', versionName: '1.0.3', versionCode: 10003, minAndroid: '8.0', releaseNotes: 'edit', revision: 2 };
    expect((await request(app).put(`/api/apps/manage/${release.id}`).set(admin).send(input)).status).toBe(400);
  });
  it('withdraws a version and immediately prevents public file downloads', async () => {
    expect((await request(app).put(`/api/apps/manage/${release.id}/status`).set(admin).send({ revision: 2, status: 'withdrawn' })).status).toBe(200);
    expect((await request(app).get(release.downloadUrl)).status).toBe(404);
    expect((await request(app).get('/api/apps/latest')).body.data).toBeNull();
  });
  it('keeps the higher published build as latest and blocks accidental downgrades', async () => {
    const newer = await upload(10003, '1.0.3'); expect(newer.status).toBe(200);
    expect((await request(app).put(`/api/apps/manage/${newer.body.data.id}/status`).set(admin).send({ revision: 1, status: 'published' })).status).toBe(200);
    expect((await request(app).put(`/api/apps/manage/${release.id}/status`).set(admin).send({ revision: 3, status: 'published' })).status).toBe(409);
    expect((await request(app).get('/api/apps/latest')).body.data.id).toBe(newer.body.data.id);
  });
});
