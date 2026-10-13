/**
 * 考试记录模块 —— zod 校验 schema（中文错误信息）。
 */
import { z } from 'zod';
import { optionalIdQuery, paginationQuery } from '../../utils/pagination.js';

/** 暂存答案入参（客观题为选项索引数组；填空/简答为文本数组）。 */
export const saveAnswersSchema = z.object({
  answers: z.record(z.string(), z.array(z.union([z.number(), z.string()]))),
});

/** 切屏事件入参。 */
export const cheatEventSchema = z.object({
  awaySeconds: z.coerce.number(),
});

/** 交卷入参。 */
export const submitSchema = z.object({
  auto: z.boolean().optional().default(false),
});

/** 人工阅卷入参（逐题主观分）。 */
export const reviewSchema = z.object({
  subjectiveScores: z.record(z.string(), z.number()),
});

/** 我的成绩列表入参（可选按考试名称关键字筛选）。 */
export const myRecordsQuerySchema = z.object({
  ...paginationQuery,
  keyword: z.string().trim().max(50, '关键字长度不能超过 50 个字符').optional(),
});

/** 某场考试全部记录入参（examId 必填）。 */
export const examRecordsQuerySchema = z.object({
  examId: z.string().min(1, '请指定考试'),
  ...paginationQuery,
});

/** 切屏审查入参（examId 必填，无分页）。 */
export const cheatQuerySchema = z.object({
  examId: z.string().min(1, '请指定考试'),
});

/**
 * 待阅卷列表入参（分页 + 可选按考试过滤）。
 *
 * v1.9④：新增 `examId` —— 支持从「考试管理」行操作直达某场考试的待阅卷队列，
 * 补考/复核/阅卷三类考务队列都能落到具体考试维度。
 */
export const pendingQuerySchema = z.object({
  ...paginationQuery,
  examId: optionalIdQuery('考试筛选值不合法'),
});
