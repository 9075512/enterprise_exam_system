/**
 * 成绩复核 —— zod 校验 schema（中文错误信息）。
 */
import { z } from 'zod';
import { optionalIdQuery, paginationQuery } from '../../utils/pagination.js';

/** 发起复核申请入参。 */
export const applyAppealSchema = z.object({
  recordId: z.string().min(1, '请指定考试记录'),
  reason: z.string().max(500, '申请说明不能超过 500 个字符').optional().default(''),
});

/** 复核通过（改分）入参。 */
export const approveAppealSchema = z.object({
  newScore: z.coerce.number().min(0, '复核分数不能为负'),
  comment: z.string().max(500, '复核意见不能超过 500 个字符').optional().default(''),
});

/** 复核驳回入参。 */
export const rejectAppealSchema = z.object({
  comment: z.string().min(1, '请填写复核意见').max(500, '复核意见不能超过 500 个字符'),
});

/**
 * 管理员复核列表查询入参（可按状态 / 考试过滤）。
 *
 * v1.9④：新增 `examId` —— 支持从「考试管理」行操作直达某场考试的成绩复核队列。
 */
export const appealListQuerySchema = z.object({
  status: z.enum(['pending', 'approved', 'rejected']).optional(),
  examId: optionalIdQuery('考试筛选值不合法'),
  ...paginationQuery,
});

export type ApplyAppealInput = z.infer<typeof applyAppealSchema>;
export type ApproveAppealInput = z.infer<typeof approveAppealSchema>;
export type RejectAppealInput = z.infer<typeof rejectAppealSchema>;
