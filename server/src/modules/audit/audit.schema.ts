/**
 * 操作审计日志 —— zod 查询校验（中文错误信息）。
 */
import { z } from 'zod';
import { paginationQuery } from '../../utils/pagination.js';
import { ALL_AUDIT_ACTIONS, ALL_AUDIT_TARGET_TYPES } from './audit.service.js';

/** 审计日志查询参数。 */
export const auditListQuerySchema = z.object({
  action: z.enum(ALL_AUDIT_ACTIONS as [string, ...string[]]).optional(),
  targetType: z.enum(ALL_AUDIT_TARGET_TYPES as [string, ...string[]]).optional(),
  keyword: z.string().trim().max(64, '关键字不能超过 64 字').optional(),
  from: z.string().trim().optional(),
  to: z.string().trim().optional(),
  ...paginationQuery,
});

/** 审计日志导出参数（v1.7②；过滤条件与列表接口一致）。 */
export const auditExportQuerySchema = z.object({
  format: z.enum(['xlsx', 'csv'], { errorMap: () => ({ message: '导出格式不合法' }) }).optional().default('xlsx'),
  columns: z.string().trim().optional(),
  tzOffset: z.coerce
    .number()
    .int('时区偏移必须为整数')
    .min(-1440, '时区偏移超出范围')
    .max(1440, '时区偏移超出范围')
    .optional(),
  action: z.enum(ALL_AUDIT_ACTIONS as [string, ...string[]]).optional(),
  targetType: z.enum(ALL_AUDIT_TARGET_TYPES as [string, ...string[]]).optional(),
  keyword: z.string().trim().max(64, '关键字不能超过 64 字').optional(),
  from: z.string().trim().optional(),
  to: z.string().trim().optional(),
});

/** 审计日志清理入参（v1.7②；retentionDays 省略 = 取系统设置）。 */
export const auditCleanupSchema = z.object({
  retentionDays: z.coerce
    .number()
    .int('保留天数必须为整数')
    .min(0, '保留天数不能为负')
    .max(3650, '保留天数不能超过 3650 天')
    .optional(),
});
