/**
 * v1.8③ U3 —— 归档自动定时任务 集成测试。
 *
 * 覆盖：
 *  1) 设置默认值（自动归档默认关闭、默认 03:00）；
 *  2) `GET /maintenance/stats` 暴露 autoEnabled / autoHour / lastAutoArchive；
 *  3) 到点判定：开关关闭不执行、时点不符不执行、到点执行且**每天只执行一次**；
 *  4) `POST /maintenance/archive/auto-run`：忽略开关与时点立即执行；保留天数为 0 时跳过；
 *  5) 自动归档审计留痕（actor = 系统自动、detail.auto = true）；仅 admin 可访问。
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../app.js';
import { prepareTestDb } from './db.js';
import { closePool } from '../db/pool.js';
import { signToken } from '../middleware/auth.js';
import { maybeRunAutoArchive } from '../modules/maintenance/maintenance.service.js';
import { DEFAULT_SETTINGS } from '../modules/settings/settings.defaults.js';
import type { ArchiveAutoRunDto, MaintenanceStatsDto, Page, AuditLogDto } from '../types/domain.js';

const bearer = (token: string): { Authorization: string } => ({ Authorization: `Bearer ${token}` });

const admin = signToken({ sub: 'user-admin', role: 'admin', departmentId: '' });
const author = signToken({ sub: 'user-author', role: 'author', departmentId: '' });

async function getSettings(): Promise<Record<string, unknown>> {
  const res = await request(app).get('/api/settings').set(bearer(admin));
  expect(res.body.code).toBe(0);
  return res.body.data as Record<string, unknown>;
}

async function putSettings(overrides: Record<string, unknown>): Promise<void> {
  const base = await getSettings();
  const res = await request(app).put('/api/settings').set(bearer(admin)).send({ ...base, ...overrides });
  expect(res.body.code).toBe(0);
}

beforeAll(async () => {
  await prepareTestDb();
});

afterAll(async () => {
  await closePool();
});

describe('U3 自动归档设置与统计', () => {
  it('默认值：自动归档默认关闭、默认 03:00', async () => {
    const s = await getSettings();
    expect(s.archiveAutoEnabled).toBe(false);
    expect(s.archiveAutoHour).toBe(3);
    // 设置项已纳入默认值（键存在且为安全默认）
    expect(DEFAULT_SETTINGS.archiveAutoEnabled).toBe(false);
    expect(DEFAULT_SETTINGS.archiveAutoHour).toBe(3);
  });

  it('stats 暴露 autoEnabled / autoHour / lastAutoArchive', async () => {
    const res = await request(app).get('/api/maintenance/stats').set(bearer(admin));
    expect(res.body.code).toBe(0);
    const stats = res.body.data as MaintenanceStatsDto;
    expect(typeof stats.autoEnabled).toBe('boolean');
    expect(typeof stats.autoHour).toBe('number');
    expect(stats.lastAutoArchive === null || typeof stats.lastAutoArchive === 'object').toBe(true);
  });

  it('统计接口仅 admin 可访问（出题人 → 1003）', async () => {
    const res = await request(app).get('/api/maintenance/stats').set(bearer(author));
    expect(res.body.code).toBe(1003);
  });
});

describe('U3 到点判定与每天一次', () => {
  it('开关关闭时不执行', async () => {
    await putSettings({ archiveAutoEnabled: false, archiveRetentionDays: 365, archiveAutoHour: new Date().getHours() });
    const res = await maybeRunAutoArchive(new Date());
    expect(res).toBeNull();
  });

  it('时点不符时不执行', async () => {
    const otherHour = (new Date().getHours() + 1) % 24;
    await putSettings({ archiveAutoEnabled: true, archiveRetentionDays: 365, archiveAutoHour: otherHour });
    const res = await maybeRunAutoArchive(new Date());
    expect(res).toBeNull();
  });

  it('到点执行一次，且同日不重复执行', async () => {
    await putSettings({ archiveAutoEnabled: true, archiveRetentionDays: 365, archiveAutoHour: new Date().getHours() });

    const first = await maybeRunAutoArchive(new Date());
    expect(first).not.toBeNull();
    expect(first!.triggered).toBe(true);
    expect(first!.reason).toBe('scheduled');
    expect(first!.ok).toBe(true);
    expect(first!.days).toBe(365);

    // 同日再次判定 → 跳过（每天至多一次）
    const second = await maybeRunAutoArchive(new Date());
    expect(second).toBeNull();
  });
});

describe('U3 立即执行与保留期守卫', () => {
  it('POST /archive/auto-run 忽略开关与时点立即执行，并写审计（actor=系统自动）', async () => {
    // 故意把开关关掉与时点错开，验证「立即执行」不受其约束
    await putSettings({ archiveAutoEnabled: false, archiveAutoHour: (new Date().getHours() + 2) % 24, archiveRetentionDays: 90 });

    const res = await request(app).post('/api/maintenance/archive/auto-run').set(bearer(admin));
    expect(res.body.code).toBe(0);
    const run = res.body.data as ArchiveAutoRunDto;
    expect(run.triggered).toBe(true);
    expect(run.reason).toBe('manual');
    expect(run.days).toBe(90);
    expect(run.ok).toBe(true);

    // 审计留痕：系统 actor + auto 标记
    const logs = await request(app)
      .get('/api/audit-logs')
      .query({ action: 'system.archive', pageSize: 20 })
      .set(bearer(admin));
    expect(logs.body.code).toBe(0);
    const page = logs.body.data as Page<AuditLogDto>;
    const autoEntry = page.list.find((l) => l.detail?.auto === true);
    expect(autoEntry).toBeTruthy();
    expect(autoEntry!.actorName).toBe('系统自动');
  });

  it('保留天数为 0 时自动归档跳过执行', async () => {
    await putSettings({ archiveRetentionDays: 0 });
    const res = await request(app).post('/api/maintenance/archive/auto-run').set(bearer(admin));
    expect(res.body.code).toBe(0);
    const run = res.body.data as ArchiveAutoRunDto;
    expect(run.triggered).toBe(false);
    expect(run.reason).toBe('retention-disabled');
  });

  it('立即执行仅 admin 可用（出题人 → 1003）', async () => {
    const res = await request(app).post('/api/maintenance/archive/auto-run').set(bearer(author));
    expect(res.body.code).toBe(1003);
  });
});
