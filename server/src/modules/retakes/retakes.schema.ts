/**
 * 补考 —— zod 校验 schema。
 */
import { z } from 'zod';

/** 发起补考申请入参。 */
export const applyRetakeSchema = z.object({
  examId: z.string().min(1, '考试不能为空'),
  reason: z.string().max(255, '申请说明不能超过 255 个字符').optional().default(''),
});

/** 驳回入参。 */
export const rejectRetakeSchema = z.object({
  reason: z.string().min(1, '请填写驳回原因').max(255, '驳回原因不能超过 255 个字符'),
});

/** 列表查询入参（可按状态过滤）。 */
export const retakeListQuerySchema = z.object({
  status: z.enum(['pending', 'approved', 'rejected']).optional(),
  page: z.coerce.number().int().min(1).optional().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).optional().default(20),
});

export type ApplyRetakeInput = z.infer<typeof applyRetakeSchema>;
export type RejectRetakeInput = z.infer<typeof rejectRetakeSchema>;
