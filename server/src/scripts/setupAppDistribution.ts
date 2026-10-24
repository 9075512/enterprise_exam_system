import { parseArgs } from 'node:util';
import { randomUUID } from 'node:crypto';
import { copyFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { closePool } from '../db/pool.js';
import { ensureAppReleaseSchema } from '../modules/apps/apps.schema.js';
import { apkPath, inspectApk, prepareAppStorage } from '../modules/apps/apps.files.js';
import { create, list, releaseSchema, setStatus } from '../modules/apps/apps.service.js';

const { values } = parseArgs({ options: { file: { type: 'string' }, version: { type: 'string' }, code: { type: 'string' }, notes: { type: 'string' }, publish: { type: 'boolean', default: false } } });
async function main() {
  await ensureAppReleaseSchema();
  console.log('App 版本表已就绪（已有表只读检查，不重置其他数据）');
  if (!values.file) return;
  const input = releaseSchema.parse({ versionName: values.version, versionCode: values.code, releaseNotes: values.notes || '重新设计移动端登录页\n优化手机导航与学习体验\n支持课程、练题、考试和成绩查询' });
  if (!/\.apk$/i.test(values.file)) throw new Error('请选择 APK 文件');
  const source = path.resolve(values.file);
  const info = await inspectApk(source);
  const existing = (await list()).find(item => item.versionCode === input.versionCode);
  if (existing) {
    if (existing.sha256 !== info.sha256) throw new Error('内部版本号已存在且安装包不同，请递增 versionCode');
    if (values.publish && existing.status !== 'published') await setStatus(existing.id, existing.revision, 'published', 'system-app-release');
    console.log(`v${existing.versionName} 已存在，未重复导入`); return;
  }
  await prepareAppStorage();
  const id = randomUUID(), key = `${id}.apk`;
  await copyFile(source, apkPath(key));
  let committed = false;
  try {
    const item = await create(input, { id, key, ...info }, 'system-app-release'); committed = true;
    if (values.publish) await setStatus(item.id, item.revision, 'published', 'system-app-release');
    console.log(`v${item.versionName} 已导入${values.publish ? '并发布' : '为草稿'}；SHA-256: ${item.sha256}`);
  } catch (error) { if (!committed) await rm(apkPath(key), { force: true }); throw error; }
}
main().catch(error => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; }).finally(closePool);
