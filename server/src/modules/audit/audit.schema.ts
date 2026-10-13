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
