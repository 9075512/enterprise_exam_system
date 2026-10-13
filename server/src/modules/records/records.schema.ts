/**
 * 考试记录模块 —— zod 校验 schema（中文错误信息）。
 */
import { z } from 'zod';
import { paginationQuery } from '../../utils/pagination.js';

/** 暂存答案入参。 */
export const saveAnswersSchema = z.object({
  answers: z.record(z.string(), z.array(z.coerce.number().int())),
});

/** 切屏事件入参。 */
export const cheatEventSchema = z.object({
  awaySeconds: z.coerce.number(),
});

/** 交卷入参。 */
export const submitSchema = z.object({
  auto: z.boolean().optional().default(false),
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
