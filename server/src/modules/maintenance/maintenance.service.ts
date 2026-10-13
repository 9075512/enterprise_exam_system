/**
 * 系统维护 —— 业务逻辑层（v1.7④ T5）。
 *
 * - `getStats()`：核心表行数 + 归档量，供管理端「系统维护」页展示；
 * - `archive()`：把早于保留期的历史成绩（已交卷）搬入归档表，减轻业务表体积。
 *   存在成绩复核申请的记录会被跳过（外键约束 + 合规留痕），并在结果中计数。
 */
import * as repo from './maintenance.repo.js';
import { withTransaction } from '../../db/pool.js';
import { badRequest } from '../../utils/errors.js';
import { nowDb, toDbDate } from '../../utils/datetime.js';
import { getSettings } from '../settings/settings.service.js';
import * as auditService from '../audit/audit.service.js';
import type { ArchiveInput } from './maintenance.schema.js';
import type { ArchiveAutoRunDto, ArchiveResultDto, MaintenanceStatsDto } from '../../types/domain.js';

/** 未配置 `archiveRetentionDays` 时手动归档的默认保留期（天）。 */
export const DEFAULT_ARCHIVE_DAYS = 365;
/** 单次归档默认上限（防止长事务）。 */
export const DEFAULT_ARCHIVE_LIMIT = 2000;

/** 统计口径中的核心表（表名固定白名单，避免任意表名拼接）。 */
const MONITORED_TABLES: Array<{ name: string; label: string }> = [
  { name: 'departments', label: '科室' },
  { name: 'users', label: '账号' },
  { name: 'question_banks', label: '题库' },
  { name: 'questions', label: '试题' },
  { name: 'papers', label: '试卷' },
  { name: 'exams', label: '考试' },
  { name: 'exam_records', label: '考试记录' },
  { name: 'notifications', label: '站内信' },
  { name: 'audit_logs', label: '操作审计' },
  { name: 'login_logs', label: '登录日志' },
  { name: 'user_sessions', label: '登录会话' },
  { name: 'exam_records_archive', label: '历史成绩归档' },
];

/** 维护统计（核心表行数 + 归档量 + 当前保留期设置）。 */
export async function getStats(): Promise<MaintenanceStatsDto> {
  const settings = await getSettings();
  const tables = [];
  for (const t of MONITORED_TABLES) {
    tables.push({ name: t.name, label: t.label, rows: await repo.countTable(t.name) });
  }
  return {
    tables,
    archiveTotal: await repo.countArchive(),
    retentionDays: settings.archiveRetentionDays,
    autoEnabled: settings.archiveAutoEnabled,
    autoHour: settings.archiveAutoHour,
    lastAutoArchive: lastAutoRun,
    generatedAt: new Date().toISOString(),
  };
}

/**
 * 历史成绩归档（admin / 系统自动）。
 * 归档截止 = 当前时间 − 保留天数；仅处理「考试已结束且早于截止」的已交卷记录。
 * 结果中的 `skipped` 为因存在成绩复核申请而保留在业务表的记录数。
 */
export async function archive(
  input: ArchiveInput,
  actor: { id: string; name?: string },
  extraDetail: Record<string, unknown> = {},
): Promise<ArchiveResultDto> {
  const settings = await getSettings();
  const days =
    input.days ?? (settings.archiveRetentionDays > 0 ? settings.archiveRetentionDays : DEFAULT_ARCHIVE_DAYS);
  if (!Number.isInteger(days) || days < 1 || days > 3650) {
    throw badRequest('归档保留天数必须在 1~3650 天之间');
  }
  const limit = input.limit ?? DEFAULT_ARCHIVE_LIMIT;

  const cutoff = toDbDate(new Date(Date.now() - days * 24 * 60 * 60 * 1000));
  const [ids, skipped] = await Promise.all([
    repo.listArchivableIds(cutoff, limit),
    repo.countSkippedByAppeal(cutoff),
  ]);

  let archived = 0;
  if (ids.length > 0) {
    const archivedAt = nowDb();
    await withTransaction(async (conn) => {
      await repo.insertArchive(ids, archivedAt, conn);
      await repo.deleteRecords(ids, conn);
    });
    archived = ids.length;
  }

  const archiveTotal = await repo.countArchive();
  await auditService.record({
    actorId: actor.id,
    actorName: actor.name,
    action: 'system.archive',
    targetType: 'system',
    targetId: 'exam_records_archive',
    targetName: '历史成绩归档',
    detail: { days, archived, skipped, archiveTotal, limit, ...extraDetail },
  });

  return { archived, skipped, cutoff, archiveTotal };
}

/* ============================ 自动归档定时任务（v1.8③ U3） ============================ */

/** 系统 actor（无对应账号，审计中显式标注名称）。 */
const SYSTEM_ACTOR = { id: 'system', name: '系统自动' };

/** 本进程内最近一次自动归档结果（进程重启后重置；持久记录见审计日志）。 */
let lastAutoRun: ArchiveAutoRunDto | null = null;
/** 已完成自动归档的日期（本地时区 YYYY-MM-DD），保证每天至多一次。 */
let lastAutoDate = '';
/** 单飞互斥：上一轮未结束则跳过本轮。 */
let running = false;

/** 查询本进程内最近一次自动归档结果。 */
export function getLastAutoRun(): ArchiveAutoRunDto | null {
  return lastAutoRun;
}

/** 本地时区的 YYYY-MM-DD。 */
function localDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * 执行一次自动归档（默认受开关与时点约束；`force` 用于「立即执行」）。
 * - 保留天数 ≤ 0（未启用自动归档的保留策略）→ 跳过并记录原因；
 * - 失败 fail-open（仅记录错误，不抛出到调用方）。
 */
export async function runAutoArchive(
  now: Date = new Date(),
  opts: { force?: boolean } = {},
): Promise<ArchiveAutoRunDto> {
  const settings = await getSettings();

  if (!opts.force && !settings.archiveAutoEnabled) {
    const skippedRun: ArchiveAutoRunDto = {
      at: new Date().toISOString(),
      triggered: false,
      reason: 'disabled',
      days: settings.archiveRetentionDays,
      archived: 0,
      skipped: 0,
      archiveTotal: await repo.countArchive(),
      ok: true,
    };
    return skippedRun;
  }

  const days = settings.archiveRetentionDays;
  if (!(days > 0)) {
    const skippedRun: ArchiveAutoRunDto = {
      at: new Date().toISOString(),
      triggered: false,
      reason: 'retention-disabled',
      days: 0,
      archived: 0,
      skipped: 0,
      archiveTotal: await repo.countArchive(),
      ok: true,
    };
    lastAutoRun = skippedRun;
    lastAutoDate = localDateKey(now);
    return skippedRun;
  }

  try {
    const result = await archive({ days }, SYSTEM_ACTOR, { auto: true });
    lastAutoRun = {
      at: new Date().toISOString(),
      triggered: true,
      reason: opts.force ? 'manual' : 'scheduled',
      days,
      archived: result.archived,
      skipped: result.skipped,
      archiveTotal: result.archiveTotal,
      ok: true,
    };
  } catch (err) {
    lastAutoRun = {
      at: new Date().toISOString(),
      triggered: true,
      reason: 'error',
      days,
      archived: 0,
      skipped: 0,
      archiveTotal: await repo.countArchive().catch(() => 0),
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
    console.error('[maintenance] 自动归档失败（已降级，不影响主流程）：', lastAutoRun.error);
  }
  lastAutoDate = localDateKey(now);
  return lastAutoRun;
}

/**
 * 到点检查：开关开启 + 当前小时命中 + 当天尚未执行 → 触发一次自动归档。
 * 供定时器每分钟调用（幂等：同一天只跑一次）。
 */
export async function maybeRunAutoArchive(now: Date = new Date()): Promise<ArchiveAutoRunDto | null> {
  if (running) return null;
  const settings = await getSettings();
  if (!settings.archiveAutoEnabled) return null;
  if (settings.archiveRetentionDays <= 0) return null;
  if (now.getHours() !== settings.archiveAutoHour) return null;
  if (lastAutoDate === localDateKey(now)) return null;

  running = true;
  try {
    return await runAutoArchive(now);
  } finally {
    running = false;
  }
}

/** 注册进程内定时器（每分钟检查一次；零依赖）。 */
export function startArchiveScheduler(): void {
  const timer = setInterval(() => {
    void maybeRunAutoArchive();
  }, 60_000);
  // 不阻塞进程退出
  timer.unref?.();
  console.log('[maintenance] 归档定时任务已注册（每分钟检查一次；默认关闭，需在「系统维护」开启）');
}
