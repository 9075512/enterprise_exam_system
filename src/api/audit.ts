/** 操作审计日志 API（§v1.6④ 数据运营与审计） */
import { get, post } from './http';
import type { AuditLog, Page } from '@/types';

/** 审计日志查询参数（action/targetType 为后端白名单 key）。 */
export interface AuditListParams {
  action?: string;
  targetType?: string;
  keyword?: string;
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
}

/** 审计日志列表（分页 + 过滤） */
export function listAuditLogs(params: AuditListParams): Promise<Page<AuditLog>> {
  return get<Page<AuditLog>>('/audit-logs', params as Record<string, unknown>);
}

/** 审计日志保留策略（0 = 永久保留） */
export interface AuditRetention {
  retentionDays: number;
}

/** 清理结果 */
export interface AuditCleanupResult {
  retentionDays: number;
  deletedCount: number;
  cutoff: string | null;
  remainingCount: number;
}

/** 当前生效的审计日志保留天数 */
export function getRetention(): Promise<AuditRetention> {
  return get<AuditRetention>('/audit-logs/retention');
}

/**
 * 导出审计日志（xlsx / csv 二进制）。
 * - columns：导出字段 key（与后端 audit.columns.ts 白名单一致），省略 = 默认列集；
 * - tzOffset：本地时区相对 UTC 的偏移分钟（东八区 = 480）。
 * 注：后端返回裸二进制而非 {code,message,data}，拦截器会原样透传为 Blob。
 */
export function exportAuditLogs(
  params: AuditListParams,
  format: 'xlsx' | 'csv' = 'xlsx',
  columns?: string[],
): Promise<Blob> {
  const { page: _page, pageSize: _pageSize, ...filter } = params;
  return get<Blob>(
    '/audit-logs/export',
    {
      ...filter,
      format,
      columns: columns && columns.length > 0 ? columns.join(',') : undefined,
      tzOffset: -new Date().getTimezoneOffset(),
    },
    { responseType: 'blob' },
  );
}

/** 按保留策略清理过期审计日志（retentionDays 省略 = 取系统设置；0 = 不清理） */
export function cleanupAuditLogs(retentionDays?: number): Promise<AuditCleanupResult> {
  return post<AuditCleanupResult>('/audit-logs/cleanup', { retentionDays });
}
