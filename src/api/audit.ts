/** 操作审计日志 API（§v1.6④ 数据运营与审计） */
import { get } from './http';
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
