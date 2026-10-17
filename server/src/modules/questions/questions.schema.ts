/**
 * 试题模块 —— zod 校验 schema（中文错误信息）。
 */
import { z } from 'zod';
import { paginationQuery } from '../../utils/pagination.js';

const typeEnum = z.enum(['single', 'multiple', 'judge', 'fill', 'short'], {
  errorMap: () => ({ message: '题型不合法' }),
});

/** 题目难度枚举（v3.2）。 */
const difficultyEnum = z.enum(['low', 'medium', 'high'], {
  errorMap: () => ({ message: '题目难度不合法' }),
});

/** 兼容 `bankIds=a&bankIds=b` 与 `bankIds=a,b` 两种传参。 */
const bankIdsQuery = z.preprocess(
  (v) => {
    if (v === undefined || v === null || v === '') return undefined;
    if (Array.isArray(v)) return v.map((x) => String(x));
    return String(v)
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  },
  z.array(z.string()).optional(),
);

const typeQuery = z.preprocess((v) => (v === '' ? undefined : v), typeEnum.optional());

/** 新建 / 编辑试题入参。 */
export const questionSchema = z.object({
  bankId: z.string().optional(),
  type: typeEnum,
  stem: z.string().min(1, '题干不能为空'),
  options: z.array(z.string()).optional().default([]),
  // 客观题为选项索引 number[]；填空/简答为文本 string[]（service 层按题型归一化）
  answer: z.array(z.union([z.number(), z.string()])).optional().default([]),
  defaultScore: z.coerce.number().optional().default(10),
  analysis: z.string().optional().default(''),
  subject: z.string().optional().default(''),
  subjectId: z.string().min(1).max(64).nullable().optional(),
  status: z.enum(['active', 'disabled']).optional(),
  // 题目难度（v3.2；null / 省略 = 未标注）
  difficulty: difficultyEnum.nullish(),
  // 知识点标签（v1.7②；最多 10 个，单个 ≤32 字，service 层再归一化）
  tags: z.array(z.string()).max(10, '知识点标签最多 10 个').optional().default([]),
  // 评分细则（v1.7③ S1；仅简答题生效，service 层按分值降序去重并限 10 档）
  rubric: z
    .array(
      z.object({
        score: z.coerce.number().min(0, '档位分值不能为负'),
        label: z.string().optional().default(''),
        description: z.string().optional().default(''),
      }),
    )
    .max(10, '评分细则最多 10 档')
    .optional()
    .default([]),
});

/** 全局试题池列表入参（组卷用）。 */
export const questionListQuerySchema = z.object({
  bankIds: bankIdsQuery,
  type: typeQuery,
  difficulty: z.preprocess((v) => (v === '' ? undefined : v), difficultyEnum.optional()),
  subject: z.string().optional().default(''),
  subjectId: z.string().optional(),
  status: z.preprocess((v) => (v === '' ? undefined : v), z.enum(['active', 'disabled']).optional()),
  tag: z.string().optional().default(''),
  keyword: z.string().optional().default(''),
  ...paginationQuery,
});

/** 科目列表入参。 */
export const subjectsQuerySchema = z.object({
  bankIds: bankIdsQuery,
});

/** 批量编辑试题入参（科目由题库唯一决定）。 */
export const batchEditSchema = z
  .object({
    ids: z.array(z.string().min(1, '试题 ID 不能为空')).min(1, '请至少选择一道试题').max(500, '单次最多批量编辑 500 道试题'),
    tags: z.array(z.string()).max(10, '知识点标签最多 10 个').optional(),
    tagsMode: z.enum(['append', 'replace'], { errorMap: () => ({ message: '标签写入模式不合法' }) }).optional(),
    defaultScore: z.coerce.number().positive('分值必须为正数').optional(),
    // 题目难度（v3.2；null = 清除该字段）
    difficulty: difficultyEnum.nullish(),
  })
  .refine(
    (v) =>
      v.tags !== undefined ||
      v.defaultScore !== undefined ||
      v.difficulty !== undefined,
    { message: '请至少选择一个要修改的字段' },
  );

export type QuestionInput = z.infer<typeof questionSchema>;

export const questionBatchSchema = z.object({
  ids: z.array(z.string().min(1).max(64)).min(1).max(500),
  action: z.enum(['enable', 'disable', 'migrate', 'delete', 'validate']),
  targetBankId: z.string().max(64).optional(),
});
