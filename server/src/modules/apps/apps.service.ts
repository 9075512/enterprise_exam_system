import { z } from 'zod';
import type { RowDataPacket } from 'mysql2/promise';
import { query, runQuery, withTransaction } from '../../db/pool.js';
import { badRequest, conflict, notFound } from '../../utils/errors.js';
import { fromDbDateSafe } from '../../utils/datetime.js';
import * as audit from '../audit/audit.service.js';
import { assertApkExists } from './apps.files.js';

export const releaseSchema = z.object({
  appName: z.string().trim().min(1).max(60).default('卓达智学'),
  versionName: z.string().trim().regex(/^\d+\.\d+\.\d+(?:[-+][A-Za-z0-9.-]+)?$/, '版本号格式示例：1.0.2').max(40),
  versionCode: z.coerce.number().int().min(1).max(2100000000),
  minAndroid: z.string().trim().regex(/^\d{1,2}(?:\.\d{1,2})?$/, '最低安卓版本格式示例：8.0').default('8.0'),
  releaseNotes: z.string().trim().min(1, '请填写更新说明').max(5000),
}).strict();
export const revisionSchema = z.object({ revision: z.coerce.number().int().positive() });
export interface AppRelease {
  id: string; appName: string; versionName: string; versionCode: number; minAndroid: string;
  releaseNotes: string; fileSize: number; sha256: string; status: 'draft' | 'published' | 'withdrawn';
  revision: number; downloadCount: number; createdAt: string; publishedAt: string | null; downloadUrl: string;
}
export function dto(row: RowDataPacket): AppRelease {
  return { id: row.id, appName: row.app_name === '卓达学习' ? '卓达智学' : row.app_name, versionName: row.version_name, versionCode: Number(row.version_code),
    minAndroid: row.min_android, releaseNotes: row.release_notes, fileSize: Number(row.file_size), sha256: row.sha256,
    status: row.status, revision: row.revision, downloadCount: Number(row.download_count),
    createdAt: fromDbDateSafe(row.created_at), publishedAt: row.published_at ? fromDbDateSafe(row.published_at) : null,
    downloadUrl: `/api/apps/releases/${row.id}/download` };
}
export async function latest(): Promise<AppRelease | null> {
  const rows = await query<RowDataPacket[]>("SELECT * FROM app_releases WHERE status = 'published' ORDER BY version_code DESC LIMIT 1");
  return rows[0] ? dto(rows[0]) : null;
}
export async function list() {
  const rows = await query<RowDataPacket[]>('SELECT * FROM app_releases ORDER BY version_code DESC');
  return rows.map(dto);
}
export async function create(input: z.infer<typeof releaseSchema>, file: { id: string; key: string; size: number; sha256: string }, actorId: string) {
  try {
    await query(`INSERT INTO app_releases (id, app_name, version_name, version_code, min_android, release_notes,
      file_key, file_size, sha256, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))`,
    [file.id, input.appName, input.versionName, input.versionCode, input.minAndroid, input.releaseNotes, file.key, file.size, file.sha256, actorId]);
  } catch (error) {
    if ((error as { code?: string }).code === 'ER_DUP_ENTRY') throw conflict('内部版本号已存在，请使用新的 versionCode');
    throw error;
  }
  await audit.record({ actorId, action: 'content.create', targetType: 'system', targetId: file.id, targetName: `App ${input.versionName}`, detail: { sha256: file.sha256 } });
  return { id: file.id, ...input, fileSize: file.size, sha256: file.sha256, status: 'draft' as const,
    revision: 1, downloadCount: 0, createdAt: new Date().toISOString(), publishedAt: null,
    downloadUrl: `/api/apps/releases/${file.id}/download` };
}
export async function update(id: string, revision: number, input: z.infer<typeof releaseSchema>, actorId: string) {
  await withTransaction(async conn => {
    const rows = await runQuery<RowDataPacket[]>(conn, 'SELECT * FROM app_releases WHERE id = ? FOR UPDATE', [id]);
    const row = rows[0];
    if (!row) throw notFound('版本不存在');
    if (row.revision !== revision) throw conflict('版本已被其他管理员修改，请刷新后重试');
    if (row.version_code !== input.versionCode || row.version_name !== input.versionName) throw badRequest('版本号不可修改，请上传新版本');
    await conn.query('UPDATE app_releases SET app_name = ?, min_android = ?, release_notes = ?, revision = revision + 1, updated_at = UTC_TIMESTAMP(3) WHERE id = ?', [input.appName, input.minAndroid, input.releaseNotes, id]);
  });
  await audit.record({ actorId, action: 'content.update', targetType: 'system', targetId: id, targetName: `App ${input.versionName}` });
}
export async function setStatus(id: string, revision: number, status: 'published' | 'withdrawn', actorId: string) {
  await withTransaction(async conn => {
    // Ordered range lock serializes releases, including concurrent publish requests.
    const rows = await runQuery<RowDataPacket[]>(conn, 'SELECT * FROM app_releases ORDER BY version_code FOR UPDATE');
    const row = rows.find(item => item.id === id);
    if (!row) throw notFound('版本不存在');
    if (row.revision !== revision) throw conflict('版本已被修改，请刷新后重试');
    if (status === 'published') {
      const current = rows.filter(item => item.status === 'published').sort((a, b) => b.version_code - a.version_code)[0];
      if (current && current.version_code > row.version_code) throw conflict('发布版本的内部版本号不能低于当前下载版本');
      await assertApkExists(row.file_key);
    }
    await conn.query(`UPDATE app_releases SET status = ?, revision = revision + 1, updated_at = UTC_TIMESTAMP(3),
      published_at = IF(? = 'published', UTC_TIMESTAMP(3), published_at) WHERE id = ?`, [status, status, id]);
  });
  await audit.record({ actorId, action: 'content.update', targetType: 'system', targetId: id, targetName: 'App 发布状态', detail: { status } });
}
