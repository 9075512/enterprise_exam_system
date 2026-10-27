import { randomUUID } from 'node:crypto';
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import jpeg from 'jpeg-js';
import { env } from '../../config/env.js';
import { runQuery, withTransaction, type SqlExecutor } from '../../db/pool.js';
import { nowDb, toDbDate, fromDbDateSafe } from '../../utils/datetime.js';
import { badRequest, conflict, fileInvalid, forbidden, notFound } from '../../utils/errors.js';
import { parseJsonColumn } from '../../utils/json.js';
import { getSettings } from '../settings/settings.service.js';
import * as recordsRepo from '../records/records.repo.js';
import * as examsRepo from '../exams/exams.repo.js';
import * as participants from '../exams/examParticipants.service.js';
import * as audit from '../audit/audit.service.js';
import * as usersRepo from '../users/users.repo.js';
import * as repo from './captures.repo.js';
import type { CaptureConfig, CaptureSettings, CaptureSummary, SystemSettings } from '../../types/domain.js';
import { cameraEventSchema, captureInputSchema } from './captures.schema.js';

export const DISABLED_CAPTURE: CaptureConfig = { enabled: false, intervalMinutes: 5, cameraPolicy: 'required', retentionDays: 30 };
export const captureRoot = path.resolve(fileURLToPath(new URL('../../..', import.meta.url)), env.CAPTURE_STORAGE_DIR);
export const MAX_CAPTURE_BYTES = 2 * 1024 * 1024;
export type CaptureFile = { buffer: Buffer; mimetype: string; size: number };
export interface CaptureStartInput { file?: CaptureFile; captureId?: string; reason?: string }
export interface PreparedCapture { storageKey: string; size: number }

export function resolveCaptureConfig(overrides: CaptureSettings | null | undefined, settings: SystemSettings): CaptureConfig {
  return {
    enabled: overrides?.enabled ?? settings.captureEnabled,
    intervalMinutes: overrides?.intervalMinutes ?? settings.captureIntervalMinutes,
    cameraPolicy: overrides?.cameraPolicy ?? settings.captureCameraPolicy,
    retentionDays: settings.captureRetentionDays,
  };
}
export async function configForRecord(id: string, exec?: SqlExecutor): Promise<CaptureConfig> {
  const session = await repo.session(id, exec);
  return session ? parseJsonColumn<CaptureConfig>(session.config, { ...DISABLED_CAPTURE }) : { ...DISABLED_CAPTURE };
}
export async function configForExam(examId: string, userId: string) {
  await participants.assertParticipant(examId, userId);
  const active = await recordsRepo.findInProgressByExamAndUser(examId, userId);
  if (active) return configForRecord(active.id);
  const exam = await examsRepo.findById(examId);
  if (!exam) throw notFound('考试不存在');
  return resolveCaptureConfig(parseJsonColumn<CaptureSettings | null>(exam.capture_settings, null), await getSettings());
}
export function validatePhoto(file: CaptureFile): void {
  if (file.mimetype !== 'image/jpeg' || file.size <= 0 || file.size > MAX_CAPTURE_BYTES || file.buffer.length !== file.size) throw fileInvalid('抓拍仅支持不超过 2MB 的 JPEG 图片');
  try {
    const decoded = jpeg.decode(file.buffer, { maxResolutionInMP: 4, maxMemoryUsageInMB: 64, tolerantDecoding: false, useTArray: true });
    if (!decoded.width || !decoded.height || decoded.width > 4096 || decoded.height > 4096) throw new Error('Invalid dimensions');
  } catch { throw fileInvalid('抓拍图片内容无效或分辨率过大'); }
}
export async function preparePhoto(file: CaptureFile): Promise<PreparedCapture> {
  validatePhoto(file);
  await mkdir(captureRoot, { recursive: true });
  const storageKey = `${randomUUID()}.jpg`;
  try { await writeFile(path.join(captureRoot, storageKey), file.buffer, { flag: 'wx', mode: 0o600 }); }
  catch (error) { await discardPhoto(storageKey).catch(() => {}); throw error; }
  return { storageKey, size: file.size };
}
export async function discardPhoto(key: string) {
  if (!/^[a-f0-9-]{36}\.jpg$/.test(key)) throw new Error('Invalid capture storage key');
  try { await unlink(path.join(captureRoot, key)); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
}
export async function savePrepared(recordId: string, input: { captureId: string; kind: string }, photo: PreparedCapture, config: CaptureConfig, exec: SqlExecutor) {
  const id = randomUUID();
  const receivedAt = nowDb();
  await repo.insert({ id, recordId, ...input, ...photo, receivedAt,
    expiresAt: toDbDate(new Date(Date.now() + config.retentionDays * 86400000).toISOString()) }, exec);
  return id;
}
async function ownedActive(recordId: string, userId: string, exec: SqlExecutor) {
  // Serialize uploads/events for the same attempt and check live status, never an archived row.
  const rows = await runQuery<Array<{ user_id: string; status: string }>>(exec, 'SELECT user_id, status FROM exam_records WHERE id = ? FOR UPDATE', [recordId]);
  const record = rows[0];
  if (!record) throw notFound('考试记录不存在或已归档');
  if (record.user_id !== userId) throw forbidden('无权操作他人的抓拍记录');
  if (record.status !== 'in_progress') throw conflict('考试已交卷，不能继续抓拍');
  const config = await configForRecord(recordId, exec);
  if (!config.enabled) throw badRequest('本次作答未开启抓拍');
  return config;
}
export async function upload(recordId: string, userId: string, raw: unknown, file?: CaptureFile) {
  const input = captureInputSchema.parse(raw);
  if (!file) throw badRequest('缺少抓拍照片');
  let prepared: PreparedCapture | undefined;
  try {
    return await withTransaction(async exec => {
      const config = await ownedActive(recordId, userId, exec);
      const existing = await repo.findRetry(recordId, input.captureId, exec);
      if (existing) return { id: existing.id };
      prepared = await preparePhoto(file);
      const id = await savePrepared(recordId, input, prepared, config, exec);
      return { id };
    });
  } catch (error) {
    if (prepared) await discardPhoto(prepared.storageKey).catch(() => {});
    throw error;
  }
}
export async function addEvent(recordId: string, userId: string, raw: unknown) {
  const event = cameraEventSchema.parse(raw);
  await withTransaction(async exec => {
    await ownedActive(recordId, userId, exec);
    await repo.addEvent(recordId, event, exec);
  });
}
export async function list(recordId: string, page: number, pageSize: number) {
  if (!(await recordsRepo.findById(recordId))) throw notFound('考试记录不存在');
  const [photos, events, config] = await Promise.all([repo.page(recordId, page, pageSize), repo.events(recordId, page, pageSize), configForRecord(recordId)]);
  return { config, page, pageSize, total: photos.total, eventTotal: events.total,
    items: photos.rows.map(row => {
      const expired = new Date(fromDbDateSafe(row.expires_at)).getTime() <= Date.now() || Boolean(row.deleted_at && !row.removed_at);
      return { id: row.id, kind: row.kind, receivedAt: fromDbDateSafe(row.received_at), expiresAt: fromDbDateSafe(row.expires_at), expired,
        status: row.removed_at ? 'deleted' : expired ? 'expired' : 'available',
        deletedAt: row.removed_at ? fromDbDateSafe(row.removed_at) : null,
        deletedBy: row.removed_at ? { id: row.removed_by, name: row.removed_by_name } : null };
    }),
    events: events.rows.map(row => ({ status: row.status, reason: row.reason, receivedAt: fromDbDateSafe(row.received_at) })) };
}
export async function readImage(recordId: string, id: string) {
  const row = await repo.image(id, recordId);
  if (!row || row.removed_at || row.deleted_at || new Date(fromDbDateSafe(row.expires_at)).getTime() <= Date.now()) throw notFound('抓拍照片不存在、已删除或已过期');
  if (!/^[a-f0-9-]{36}\.jpg$/.test(row.storage_key)) throw notFound('抓拍照片不存在');
  try {
    const buffer = await readFile(path.join(captureRoot, row.storage_key));
    // Recheck after disk I/O so a concurrently committed removal cannot serve a stale image.
    const latest = await repo.image(id, recordId);
    if (!latest || latest.removed_at || latest.deleted_at || new Date(fromDbDateSafe(latest.expires_at)).getTime() <= Date.now()) throw notFound('抓拍照片不存在、已删除或已过期');
    return buffer;
  }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') throw notFound('抓拍照片文件不存在'); throw error; }
}
export async function remove(recordId: string, captureIds: string[], actorId: string) {
  if (!(await recordsRepo.findById(recordId))) throw notFound('考试记录不存在');
  const actor = await usersRepo.findById(actorId);
  if (!actor) throw forbidden('管理员账号不存在');
  const ids = [...new Set(captureIds)].sort();
  const result = await withTransaction(async exec => {
    const rows = await repo.lockPhotos(recordId, ids, exec);
    if (rows.length !== ids.length) throw notFound('照片不存在或不属于本次答卷');
    const fresh = rows.filter(row => !row.removed_at);
    for (const row of fresh) await repo.removePhoto(row.id, actorId, actor.name, exec);
    return { rows, fresh };
  });
  if (result.fresh.length) await audit.record({ actorId, actorName: actor.name, action: 'capture.delete', targetType: 'record', targetId: recordId,
    targetName: '考试抓拍', detail: { recordId, captureIds: result.fresh.map(row => row.id), count: result.fresh.length } });
  // Access is already revoked; failed physical deletions stay eligible for scheduled cleanup.
  for (const row of result.rows.filter(row => !row.deleted_at)) {
    try { await discardPhoto(row.storage_key); await repo.markDeleted(row.id); }
    catch (error) { console.error('[captures] 手动删除文件待重试', row.id, error); }
  }
  return { deletedCount: result.fresh.length, alreadyDeletedCount: result.rows.length - result.fresh.length };
}
export async function examSummaries(examId: string): Promise<Map<string, CaptureSummary>> {
  const rows = await repo.summaries(examId);
  return new Map(rows.map(row => {
    const config = parseJsonColumn<CaptureConfig>(row.config, { ...DISABLED_CAPTURE });
    const last = row.last_capture_at ? fromDbDateSafe(row.last_capture_at) : null;
    const overdue = config.enabled && (!last || Date.now() - new Date(last).getTime() > (config.intervalMinutes * 60 + 60) * 1000);
    return [String(row.record_id), { enabled: config.enabled, count: Number(row.capture_count), lastCaptureAt: last,
      cameraStatus: !config.enabled ? 'disabled' : overdue ? 'overdue' : String(row.camera_status) }];
  }));
}
let cleaning = false;
export async function cleanupExpired(): Promise<void> {
  if (cleaning) return;
  cleaning = true;
  try {
    // Bounded batches, failures remain eligible for the next scheduled run.
    for (let batch = 0; batch < 20; batch++) {
      const rows = await repo.expired();
      let removed = 0;
      for (const row of rows) {
        try { await discardPhoto(row.storage_key); await repo.markDeleted(row.id); removed++; }
        catch (error) { console.error('[captures] 清理照片失败', row.id, error); }
      }
      if (rows.length < 200 || removed === 0) break;
    }
  } finally { cleaning = false; }
}
export function startCaptureCleanup(): () => void {
  if (env.PRACTICE_ONLY) return () => {};
  const run = () => { void cleanupExpired().catch(error => console.error('[captures] 清理任务失败', error)); };
  run();
  const timer = setInterval(run, 3600000);
  timer.unref();
  return () => clearInterval(timer);
}
