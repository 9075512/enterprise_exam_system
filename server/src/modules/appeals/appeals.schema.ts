/**
 * 成绩复核 —— zod 校验 schema（中文错误信息）。
 */
import { z } from 'zod';

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

export type ApplyAppealInput = z.infer<typeof applyAppealSchema>;
export type ApproveAppealInput = z.infer<typeof approveAppealSchema>;
export type RejectAppealInput = z.infer<typeof rejectAppealSchema>;
