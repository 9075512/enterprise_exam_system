/**
 * 题库模块 —— zod 校验 schema（中文错误信息）。
 */
import { z } from 'zod';
import { paginationQuery } from '../../utils/pagination.js';

/** 新建 / 编辑题库入参。 */
export const bankSchema = z.object({
  name: z.string().min(1, '题库名称不能为空'),
  description: z.string().optional().default(''),
  category: z.string().optional().default('未分类'),
  /** 对外开放练题开关（默认关闭，安全默认） */
  allowPractice: z.boolean({ invalid_type_error: '对外开放练题开关必须为布尔值' }).optional().default(false),
  /** 授权出题人 id 列表（仅 admin 生效；author 新建/编辑时忽略） */
  authorIds: z.array(z.string()).optional(),
});

/** 列表查询入参。 */
export const bankListQuerySchema = z.object({
  category: z.string().optional().default(''),
  keyword: z.string().optional().default(''),
});

/** 题库内试题列表查询入参（筛选 + 分页）。 */
export const bankQuestionsQuerySchema = z.object({
  type: z.preprocess(
    (v) => (v === '' ? undefined : v),
    z
      .enum(['single', 'multiple', 'judge', 'fill', 'short'], { errorMap: () => ({ message: '题型不合法' }) })
      .optional(),
  ),
  subject: z.string().optional().default(''),
  /** 知识点标签过滤（v1.7②） */
  tag: z.string().optional().default(''),
  keyword: z.string().optional().default(''),
  ...paginationQuery,
});

/** 试题迁移到其他题库入参。 */
export const migrateQuestionsSchema = z.object({
  targetBankId: z.string().min(1, '目标题库不能为空'),
  questionIds: z
    .array(z.string().min(1, '试题 ID 不能为空'), { invalid_type_error: '试题列表不能为空' })
    .min(1, '请至少选择一道试题'),
});

export type BankInput = z.infer<typeof bankSchema>;
