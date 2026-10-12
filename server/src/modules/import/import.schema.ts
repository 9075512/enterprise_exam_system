/**
 * 导入模块 —— zod 校验 schema（中文错误信息）。
 */
import { z } from 'zod';
import { paginationQuery } from '../../utils/pagination.js';

/** 逐行问题明细。 */
const rowIssueSchema = z.object({
  row: z.coerce.number().int(),
  column: z.string().optional().default(''),
  value: z.string().optional().default(''),
  reason: z.string().optional().default(''),
});

/** preview 返回、可回传 commit 的合法行。 */
const validRowSchema = z.object({
  row: z.coerce.number().int(),
  type: z.enum(['single', 'multiple', 'judge'], { errorMap: () => ({ message: '题型不合法' }) }),
  stem: z.string().min(1, '题干不能为空'),
  options: z.array(z.string()).optional().default([]),
  answer: z.array(z.coerce.number().int()).optional().default([]),
  defaultScore: z.coerce.number().optional().default(10),
  analysis: z.string().optional().default(''),
  subject: z.string().optional().default(''),
});

/** preview 入参（bankId 来自 multipart body；文件由 multer 处理）。 */
export const previewBodySchema = z.object({
  bankId: z.string().min(1, '请选择目标题库'),
});

/** commit 入参（行数上限来自系统设置 settings.importMaxRows）。 */
export const createCommitSchema = (maxRows: number) =>
  z.object({
    bankId: z.string().min(1, '请选择目标题库'),
    fileName: z.string().optional().default(''),
    validRows: z.array(validRowSchema).min(1, '没有可导入的数据').max(maxRows, `单次导入不得超过 ${maxRows} 行`),
    errors: z.array(rowIssueSchema).optional().default([]),
  });

/** 批次列表查询入参。 */
export const batchListQuerySchema = z.object({
  bankId: z.string().optional().default(''),
  ...paginationQuery,
});

export type CommitInput = z.infer<ReturnType<typeof createCommitSchema>>;
