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
import type { AuditAction, AuditLogDto, AuditTargetType, Page } from '../../types/domain.js';

/** 审计动作 → 中文文案（前端展示层另有一份镜像，见 src/constants）。 */
export const AUDIT_ACTION_LABELS: Record<AuditAction, string> = {
  'user.create': '新建用户',
  'user.update': '编辑用户',
  'user.delete': '删除用户',
  'user.reset_password': '重置密码',
  'exam.create': '新建考试',
  'exam.update': '编辑考试',
  'exam.delete': '删除考试',
  'bank.create': '新建题库',
  'bank.update': '编辑题库',
  'bank.delete': '删除题库',
  'bank.migrate': '迁移试题',
  'permission.update': '更新菜单权限',
  'appeal.approve': '复核通过（改分）',
  'appeal.reject': '复核驳回',
  'exam.exception_update': '设置特殊安排',
};

/** 审计目标类型 → 中文文案。 */
export const AUDIT_TARGET_TYPE_LABELS: Record<AuditTargetType, string> = {
  user: '用户',
  exam: '考试',
  bank: '题库',
  permission: '菜单权限',
  appeal: '成绩复核',
};

/** 全部审计动作 key（查询过滤白名单）。 */
export const ALL_AUDIT_ACTIONS: readonly string[] = Object.keys(AUDIT_ACTION_LABELS);

/** 全部审计目标类型 key。 */
export const ALL_AUDIT_TARGET_TYPES: readonly string[] = Object.keys(AUDIT_TARGET_TYPE_LABELS);

/** 审计记录入参（actor 姓名由服务端按 id 解析，日志自包含）。 */
export interface AuditEntry {
  actorId: string;
  action: AuditAction;
  targetType: AuditTargetType;
  targetId?: string;
  targetName?: string;
  detail?: Record<string, unknown>;
}

/**
 * 写入一条审计日志（fail-open：任何失败仅打印，不向上抛）。
 * actor 姓名按 actorId 反查；查不到时回退 actorId（保证日志可读）。
 */
export async function record(entry: AuditEntry): Promise<void> {
  try {
    const actor = await usersRepo.findById(entry.actorId);
    await repo.insert({
      id: genId('audit-'),
      actorId: entry.actorId,
      actorName: actor?.name ?? entry.actorId,
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

/** 审计日志列表（admin，分页 + 过滤）。 */
export async function list(
  filter: { action?: string; targetType?: string; keyword?: string; from?: string; to?: string },
  page?: number,
  pageSize?: number,
): Promise<Page<AuditLogDto>> {
  const paging = normalizePaging(page, pageSize);
  const [rows, total] = await Promise.all([
    repo.list(
      {
        action: filter.action,
        targetType: filter.targetType,
        keyword: filter.keyword,
        from: filter.from ? toDbDate(normalizeDateInput(filter.from, true)) : undefined,
        to: filter.to ? toDbDate(normalizeDateInput(filter.to, false)) : undefined,
      },
      paging,
    ),
    repo.count({
      action: filter.action,
      targetType: filter.targetType,
      keyword: filter.keyword,
      from: filter.from ? toDbDate(normalizeDateInput(filter.from, true)) : undefined,
      to: filter.to ? toDbDate(normalizeDateInput(filter.to, false)) : undefined,
    }),
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
