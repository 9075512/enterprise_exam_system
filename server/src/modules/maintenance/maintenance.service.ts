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
import type { ArchiveResultDto, MaintenanceStatsDto } from '../../types/domain.js';

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
    generatedAt: new Date().toISOString(),
  };
}

/**
 * 历史成绩归档（admin）。
 * 归档截止 = 当前时间 − 保留天数；仅处理「考试已结束且早于截止」的已交卷记录。
 * 结果中的 `skipped` 为因存在成绩复核申请而保留在业务表的记录数。
 */
export async function archive(input: ArchiveInput, operatorId: string): Promise<ArchiveResultDto> {
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
    actorId: operatorId,
    action: 'system.archive',
    targetType: 'system',
    targetId: 'exam_records_archive',
    targetName: '历史成绩归档',
    detail: { days, archived, skipped, archiveTotal, limit },
  });

  return { archived, skipped, cutoff, archiveTotal };
}
