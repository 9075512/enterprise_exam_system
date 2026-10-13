/**
 * 操作审计日志 —— 业务逻辑层。
 * 关键操作（用户 / 考试 / 题库 / 菜单权限）的写操作由各 service 在成功后调用 `record()` 落日志。
 * 设计：fail-open —— 审计写入失败绝不阻断主业务（打印错误日志即可）。
 */
import * as repo from './audit.repo.js';
import * as usersRepo from '../users/users.repo.js';
import { genId } from '../../utils/id.js';
import { nowDb, fromDbDate, toDbDate } from '../../utils/datetime.js';
import { parseJsonColumn } from '../../utils/json.js';
import { normalizePaging, buildPage } from '../../utils/pagination.js';
import { buildExportBuffer } from '../../utils/excelExport.js';
import { buildCsvBuffer } from '../../utils/csvExport.js';
import type { ExportColumn } from '../../utils/excelExport.js';
import { badRequest } from '../../utils/errors.js';
import { getSettings } from '../settings/settings.service.js';
import {
  AUDIT_EXPORT_COLUMNS,
  AUDIT_EXPORT_KEYS,
  DEFAULT_AUDIT_EXPORT_KEYS,
} from './audit.columns.js';
import type { AuditExportRow } from './audit.columns.js';
import type { AuditAction, AuditLogDto, AuditTargetType, Page } from '../../types/domain.js';

/** 审计动作 → 中文文案（前端展示层另有一份镜像，见 src/constants）。 */
export const AUDIT_ACTION_LABELS: Record<AuditAction, string> = {
  'user.create': '新建用户',
  'user.update': '编辑用户',
  'user.delete': '删除用户',
  'user.reset_password': '重置密码',
  'user.change_password': '修改本人密码',
  'user.two_factor_enable': '开启两步验证',
  'user.two_factor_disable': '关闭两步验证',
  'user.two_factor_reset': '重置两步验证',
  'user.force_logout': '强制下线设备',
  'exam.create': '新建考试',
  'exam.update': '编辑考试',
  'exam.delete': '删除考试',
  'bank.create': '新建题库',
  'bank.update': '编辑题库',
  'bank.delete': '删除题库',
  'bank.migrate': '迁移试题',
  'bank.author_grant': '批量授权出题人',
  'bank.author_revoke': '批量取消出题人授权',
  'bank.clone': '复制题库',
  'permission.update': '更新菜单权限',
  'appeal.approve': '复核通过（改分）',
  'appeal.reject': '复核驳回',
  'exam.exception_update': '设置特殊安排',
  'exam.extend_time': '监考加时',
  'record.force_submit': '监考强制交卷',
  'system.archive': '历史成绩归档',
  'audit.export': '导出审计日志',
  'audit.cleanup': '清理过期审计日志',
};

/** 审计目标类型 → 中文文案。 */
export const AUDIT_TARGET_TYPE_LABELS: Record<AuditTargetType, string> = {
  user: '用户',
  exam: '考试',
  bank: '题库',
  permission: '菜单权限',
  appeal: '成绩复核',
  audit: '审计日志',
  record: '考试记录',
  system: '系统维护',
};

/** 动作 key → 中文文案（未收录 key 原样返回，兼容历史数据）。 */
export function labelOfAction(action: string): string {
  return AUDIT_ACTION_LABELS[action as AuditAction] ?? action;
}

/** 目标类型 key → 中文文案（未收录 key 原样返回）。 */
export function labelOfTargetType(targetType: string): string {
  return AUDIT_TARGET_TYPE_LABELS[targetType as AuditTargetType] ?? targetType;
}

/** 全部审计动作 key（查询过滤白名单）。 */
export const ALL_AUDIT_ACTIONS: readonly string[] = Object.keys(AUDIT_ACTION_LABELS);

/** 全部审计目标类型 key。 */
export const ALL_AUDIT_TARGET_TYPES: readonly string[] = Object.keys(AUDIT_TARGET_TYPE_LABELS);

/** 审计记录入参（actor 姓名由服务端按 id 解析，日志自包含）。 */
export interface AuditEntry {
  actorId: string;
  /** 显式指定 actor 名称（用于系统任务等无对应账号的场景；优先级高于按 id 反查的兜底） */
  actorName?: string;
  action: AuditAction;
  targetType: AuditTargetType;
  targetId?: string;
  targetName?: string;
  detail?: Record<string, unknown>;
}

/**
 * 写入一条审计日志（fail-open：任何失败仅打印，不向上抛）。
 * actor 姓名按 actorId 反查；查不到时回退显式 actorName，最后回退 actorId（保证日志可读）。
 */
export async function record(entry: AuditEntry): Promise<void> {
  try {
    const actor = await usersRepo.findById(entry.actorId);
    await repo.insert({
      id: genId('audit-'),
      actorId: entry.actorId,
      actorName: actor?.name ?? entry.actorName ?? entry.actorId,
      action: entry.action,
      targetType: entry.targetType,
      targetId: entry.targetId ?? '',
      targetName: entry.targetName ?? '',
      detail: entry.detail ?? {},
      createdAt: nowDb(),
    });
  } catch (err) {
    // 审计失败不得阻断主业务
    console.error('[audit] 写入审计日志失败：', err);
  }
}

/** 查询过滤入参（列表 / 导出共用）。 */
export interface AuditFilterInput {
  action?: string;
  targetType?: string;
  keyword?: string;
  from?: string;
  to?: string;
}

/** 把对外过滤入参转成 repo 层过滤条件（日期补全整天边界）。 */
function toRepoFilter(filter: AuditFilterInput): repo.AuditListFilter {
  return {
    action: filter.action,
    targetType: filter.targetType,
    keyword: filter.keyword,
    from: filter.from ? toDbDate(normalizeDateInput(filter.from, true)) : undefined,
    to: filter.to ? toDbDate(normalizeDateInput(filter.to, false)) : undefined,
  };
}

/** 审计日志列表（admin，分页 + 过滤）。 */
export async function list(
  filter: AuditFilterInput,
  page?: number,
  pageSize?: number,
): Promise<Page<AuditLogDto>> {
  const paging = normalizePaging(page, pageSize);
  const repoFilter = toRepoFilter(filter);
  const [rows, total] = await Promise.all([
    repo.list(repoFilter, paging),
    repo.count(repoFilter),
  ]);
  return buildPage(rows.map(mapRow), total, paging.page, paging.pageSize);
}

/**
 * 归一化日期输入：
 * - 纯日期 'YYYY-MM-DD' → 起始补 'T00:00:00'、截止补 'T23:59:59.999'（覆盖整天）；
 * - 其余原样返回（由 toDbDate 处理）。
 */
function normalizeDateInput(value: string, isStart: boolean): string {
  const trimmed = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return isStart ? `${trimmed}T00:00:00.000Z` : `${trimmed}T23:59:59.999Z`;
  }
  return trimmed;
}

/** 行 → DTO。 */
function mapRow(row: repo.AuditLogRow): AuditLogDto {
  return {
    id: row.id,
    actorId: row.actor_id,
    actorName: row.actor_name,
    action: row.action as AuditAction,
    targetType: row.target_type as AuditTargetType,
    targetId: row.target_id,
    targetName: row.target_name,
    detail: parseJsonColumn<Record<string, unknown>>(row.detail, {}),
    createdAt: fromDbDate(row.created_at) ?? '',
  };
}

/* ============================ 导出 / 保留归档（v1.7②） ============================ */

/** 单次导出条数上限（防内存与响应体过大）。 */
export const MAX_AUDIT_EXPORT_ROWS = 20000;

/** 默认时区偏移（东八区，分钟）；前端每次都会显式传 tzOffset，仅作兜底。 */
const DEFAULT_TZ_OFFSET = 480;

const pad2 = (n: number): string => String(n).padStart(2, '0');

/**
 * 把 ISO(UTC) 时间按给定时区偏移格式化为 'YYYY-MM-DD HH:mm'（与成绩导出口径一致）。
 * 空值/非法值返回 ''。
 */
function formatLocal(iso: string | null, tzOffsetMinutes: number): string {
  if (!iso) return '';
  const ms = new Date(iso).getTime();
  if (Number.isNaN(ms)) return '';
  const d = new Date(ms + tzOffsetMinutes * 60000);
  return (
    `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}` +
    ` ${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}`
  );
}

/** 文件名安全化：替换 Windows / URL 非法字符。 */
function sanitizeFilename(name: string): string {
  return name.replace(/[\\/:*?"<>|]/g, '_');
}

/** detail 对象 → 可读摘要（'键=值' 以 '；' 连接；空对象返回 ''）。 */
export function stringifyDetail(detail: Record<string, unknown>): string {
  const parts: string[] = [];
  for (const [key, value] of Object.entries(detail ?? {})) {
    if (value === null || value === undefined) continue;
    const text = typeof value === 'object' ? JSON.stringify(value) : String(value);
    if (text === '') continue;
    parts.push(`${key}=${text}`);
  }
  return parts.join('；');
}

/** 解析导出列（省略 → 默认列集；非法 key → 1001；输出顺序恒为定义顺序）。 */
function resolveExportColumns(raw?: string): Array<ExportColumn<AuditExportRow>> {
  if (raw === undefined || raw.trim() === '') {
    const defaults = new Set(DEFAULT_AUDIT_EXPORT_KEYS);
    return AUDIT_EXPORT_COLUMNS.filter((c) => defaults.has(c.key));
  }
  const picked = new Set<string>();
  for (const part of raw.split(',')) {
    const key = part.trim();
    if (key) picked.add(key);
  }
  if (picked.size === 0) throw badRequest('请至少选择一个导出字段');
  const unknown = [...picked].filter((k) => !AUDIT_EXPORT_KEYS.has(k));
  if (unknown.length > 0) throw badRequest(`导出字段不合法：${unknown.join('、')}`);
  return AUDIT_EXPORT_COLUMNS.filter((c) => picked.has(c.key));
}

/** 审计日志导出结果。 */
export interface AuditExportResult {
  buffer: Buffer;
  filename: string;
  rowCount: number;
}

/**
 * 导出审计日志（.xlsx / .csv）。
 * @param filter   过滤条件（与列表接口完全一致）
 * @param format   'xlsx'（默认）| 'csv'
 * @param columns  逗号分隔的勾选列 key（省略 → 默认列集）
 * @param tzOffset 客户端时区偏移（分钟，东八区 = 480）
 */
export async function exportLogs(
  filter: AuditFilterInput,
  format: 'xlsx' | 'csv',
  columns?: string,
  tzOffset?: number,
): Promise<AuditExportResult> {
  const tz = tzOffset ?? DEFAULT_TZ_OFFSET;
  const picked = resolveExportColumns(columns);
  const rows = await repo.listForExport(toRepoFilter(filter), MAX_AUDIT_EXPORT_ROWS);

  const exportRows: AuditExportRow[] = rows.map((row) => ({
    createdAt: formatLocal(fromDbDate(row.created_at), tz),
    actorName: row.actor_name,
    actionLabel: labelOfAction(row.action),
    targetTypeLabel: labelOfTargetType(row.target_type),
    targetName: row.target_name,
    targetId: row.target_id,
    detail: stringifyDetail(parseJsonColumn<Record<string, unknown>>(row.detail, {})),
  }));

  const stamp = formatLocal(new Date().toISOString(), tz).replace(/[-: ]/g, '');
  const base = `审计日志-${stamp}`;

  if (format === 'csv') {
    const buffer = buildCsvBuffer(
      picked.map((c) => c.header),
      exportRows.map((r) => picked.map((c) => c.value(r))),
    );
    return { buffer, filename: `${base}.csv`, rowCount: exportRows.length };
  }

  const buffer = await buildExportBuffer([{ name: '审计日志', columns: picked, rows: exportRows }]);
  return { buffer, filename: `${base}.xlsx`, rowCount: exportRows.length };
}

/** 当前生效的审计保留天数（0 = 永久保留）。 */
export async function getRetentionDays(): Promise<number> {
  const settings = await getSettings();
  return Number(settings.auditRetentionDays ?? 0);
}

/** 清理结果。 */
export interface AuditCleanupResult {
  /** 保留天数（0 = 未执行清理） */
  retentionDays: number;
  /** 实际删除条数 */
  deletedCount: number;
  /** 清理阈值时刻（ISO；未清理为 null） */
  cutoff: string | null;
  /** 清理前日志总条数 */
  remainingCount: number;
}

/**
 * 按保留策略清理过期审计日志（仅 admin）。
 * - 默认取系统设置 `auditRetentionDays`；显式传 `retentionDays` 可覆盖；
 * - 0 或负数 → 视为「永久保留」，不删除任何日志；
 * - 清理动作本身也会写入一条审计日志（留痕），故 `remainingCount` 已含该条。
 * @param operatorId 操作者 id（用于留痕）
 * @param retentionDays 覆盖保留天数（省略 = 取系统设置）
 */
export async function cleanup(
  operatorId: string,
  retentionDays?: number,
): Promise<AuditCleanupResult> {
  const days = retentionDays ?? (await getRetentionDays());
  if (!Number.isFinite(days) || days <= 0) {
    const remaining = await repo.count({});
    return { retentionDays: 0, deletedCount: 0, cutoff: null, remainingCount: remaining };
  }
  const cutoffDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const cutoffDb = toDbDate(cutoffDate);
  const before = await repo.count({});
  const deletedCount = await repo.deleteBefore(cutoffDb);

  await record({
    actorId: operatorId,
    action: 'audit.cleanup',
    targetType: 'audit',
    targetId: 'audit_logs',
    targetName: '审计日志',
    detail: { retentionDays: days, deletedCount },
  });

  // 清理动作自身会新增 1 条日志（留痕）
  return {
    retentionDays: days,
    deletedCount,
    cutoff: cutoffDate.toISOString(),
    remainingCount: before - deletedCount + 1,
  };
}
