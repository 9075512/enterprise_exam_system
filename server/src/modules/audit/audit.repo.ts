/**
 * 操作审计日志 —— 数据访问层。
 * audit_logs 表自包含（actor 弱关联无外键），被审计对象/操作者删除后日志仍可读。
 */
import type { RowDataPacket, ResultSetHeader } from 'mysql2/promise';
import { query } from '../../db/pool.js';
import { toJsonColumn } from '../../utils/json.js';
import type { AuditAction, AuditTargetType } from '../../types/domain.js';

/** `audit_logs` 表原始行。 */
export interface AuditLogRow extends RowDataPacket {
  id: string;
  actor_id: string;
  actor_name: string;
  action: string;
  target_type: string;
  target_id: string;
  target_name: string;
  detail: unknown;
  created_at: string;
}

/** 写入审计日志的入参。 */
export interface AuditInsert {
  id: string;
  actorId: string;
  actorName: string;
  action: AuditAction;
  targetType: AuditTargetType;
  targetId: string;
  targetName: string;
  detail: Record<string, unknown>;
  createdAt: string;
}

/** 审计日志列表过滤条件。 */
export interface AuditListFilter {
  action?: string;
  targetType?: string;
  /** 关键字：模糊匹配操作者姓名 / 目标名称 */
  keyword?: string;
  /** 起始时刻（含，DB 可写格式 'YYYY-MM-DD HH:mm:ss.SSS'） */
  from?: string;
  /** 截止时刻（含，DB 可写格式） */
  to?: string;
}

const COLUMNS =
  'id, actor_id, actor_name, action, target_type, target_id, target_name, detail, created_at';

/** 构造 WHERE 条件（list / count 共用）。 */
function buildWhere(filter: AuditListFilter): { where: string; params: Array<string | number> } {
  const conditions: string[] = [];
  const params: Array<string | number> = [];
  if (filter.action) {
    conditions.push('action = ?');
    params.push(filter.action);
  }
  if (filter.targetType) {
    conditions.push('target_type = ?');
    params.push(filter.targetType);
  }
  if (filter.keyword && filter.keyword.trim() !== '') {
    conditions.push('(actor_name LIKE ? OR target_name LIKE ?)');
    const like = `%${filter.keyword.trim()}%`;
    params.push(like, like);
  }
  if (filter.from) {
    conditions.push('created_at >= ?');
    params.push(filter.from);
  }
  if (filter.to) {
    conditions.push('created_at <= ?');
    params.push(filter.to);
  }
  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  return { where, params };
}

/** 插入一条审计日志。 */
export async function insert(entry: AuditInsert): Promise<void> {
  await query<RowDataPacket[]>(
    `INSERT INTO audit_logs
       (id, actor_id, actor_name, action, target_type, target_id, target_name, detail, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      entry.id,
      entry.actorId,
      entry.actorName,
      entry.action,
      entry.targetType,
      entry.targetId,
      entry.targetName,
      toJsonColumn(entry.detail),
      entry.createdAt,
    ],
  );
}

/** 审计日志列表（按时间倒序，分页）。 */
export async function list(
  filter: AuditListFilter,
  paging: { offset: number; pageSize: number },
): Promise<AuditLogRow[]> {
  const { where, params } = buildWhere(filter);
  return query<AuditLogRow[]>(
    `SELECT ${COLUMNS} FROM audit_logs ${where} ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`,
    [...params, paging.pageSize, paging.offset],
  );
}

/** 审计日志总数。 */
export async function count(filter: AuditListFilter): Promise<number> {
  const { where, params } = buildWhere(filter);
  const rows = await query<RowDataPacket[]>(`SELECT COUNT(*) AS c FROM audit_logs ${where}`, params);
  return Number(rows[0]?.c ?? 0);
}

/**
 * 导出用：按过滤条件取全部匹配日志（按时间倒序），最多 `limit` 条（防内存爆掉）。
 * 与 `list` 共用同一套 WHERE，保证「列表所见 = 导出所得」。
 */
export async function listForExport(filter: AuditListFilter, limit: number): Promise<AuditLogRow[]> {
  const { where, params } = buildWhere(filter);
  return query<AuditLogRow[]>(
    `SELECT ${COLUMNS} FROM audit_logs ${where} ORDER BY created_at DESC, id DESC LIMIT ?`,
    [...params, limit],
  );
}

/** 删除 `created_at < before`（DB 可写格式）的日志，返回删除条数。 */
export async function deleteBefore(before: string): Promise<number> {
  const result = await query<ResultSetHeader>(`DELETE FROM audit_logs WHERE created_at < ?`, [before]);
  return result.affectedRows ?? 0;
}
