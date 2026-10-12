/**
 * 试卷模块 —— zod 校验 schema（中文错误信息）。
 */
import { z } from 'zod';

/** 试卷中的题目引用。 */
const paperQuestionItem = z.object({
  questionId: z.string().min(1, '试题 id 不能为空'),
  score: z.coerce.number().positive('每题分值必须为正数'),
});

/** 新建 / 编辑试卷入参。 */
export const paperSchema = z.object({
  name: z.string().min(1, '试卷名称不能为空'),
  description: z.string().optional().default(''),
  bankIds: z.array(z.string()).min(1, '请至少选择一个题库'),
  questions: z.array(paperQuestionItem).min(1, '试卷至少需要一道题目'),
});

/** 按题型随机抽题：单题型规则。 */
const ruleItem = z.object({
  count: z.coerce.number().int().min(0, '抽题数量不能为负'),
  score: z.coerce.number().positive('每题分值必须为正数'),
});

/** 抽题入参。 */
export const drawSchema = z.object({
  bankIds: z.array(z.string()).min(1, '请至少选择一个题库'),
  rules: z
    .object({
      single: ruleItem.optional(),
      multiple: ruleItem.optional(),
      judge: ruleItem.optional(),
    })
    .refine((r) => Boolean(r.single || r.multiple || r.judge), {
      message: '请至少配置一种题型的抽题数量',
    }),
});

export type PaperInput = z.infer<typeof paperSchema>;
export type DrawInput = z.infer<typeof drawSchema>;
