/**
 * 题库模块 —— zod 校验 schema（中文错误信息）。
 */
import { z } from 'zod';
import { paginationQuery } from '../../utils/pagination.js';

/** 新建 / 编辑题库入参。 */
export const bankSchema = z.object({
  name: z.string().min(1, '题库名称不能为空'),
  description: z.string().optional().default(''),
  parentId: z.string().max(64).nullable().optional(),
  sortOrder: z.number().int().min(0).max(999999).optional().default(0),
  status: z.enum(['active', 'disabled']).optional().default('active'),
  /** 编辑请求沿用原默认；新增请求由 bankCreateSchema 默认开放练题。 */
  allowPractice: z.boolean({ invalid_type_error: '对外开放练题开关必须为布尔值' }).optional().default(false),
  /** 授权出题人 id 列表（仅 admin 生效；author 新建/编辑时忽略） */
  authorIds: z.array(z.string()).optional(),
});

/** 新增科目默认开放练题，仍允许显式关闭。 */
export const bankCreateSchema = bankSchema.extend({
  allowPractice: bankSchema.shape.allowPractice.default(true),
});

export const bankAccessSchema = z.object({
  permissionMode: z.enum(['inherit', 'override']),
  viewAll: z.boolean().optional().default(false),
  includeChildDepartments: z.boolean().optional().default(true),
  departmentIds: z.array(z.string().min(1).max(64)).max(5000).optional().default([]),
  userIds: z.array(z.string().min(1).max(64)).max(5000).optional().default([]),
  editorIds: z.array(z.string().min(1).max(64)).max(5000).optional().default([]),
});

/** 列表查询入参。 */
export const bankListQuerySchema = z.object({
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
  subjectId: z.string().optional(),
  status: z.preprocess((v) => (v === '' ? undefined : v), z.enum(['active', 'disabled']).optional()),
  /** 题目难度过滤（v3.2） */
  difficulty: z.preprocess(
    (v) => (v === '' ? undefined : v),
    z
      .enum(['low', 'medium', 'high'], { errorMap: () => ({ message: '题目难度不合法' }) })
      .optional(),
  ),
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

/**
 * 题库授权批量维护入参（v1.7③ S2，仅 admin）。
 * 三种选择器可组合：显式用户 id ∪（指定科室的成员 ∩ 角色过滤）∪ 指定角色的全部账号。
 * 至少需提供一种，否则 1001。
 */
export const bankAuthorsBatchSchema = z
  .object({
    /** 显式指定的用户 id（可手选） */
    userIds: z.array(z.string()).optional().default([]),
    /** 按科室圈选（与 userIds 取并集） */
    departmentId: z.string().optional().default(''),
    /** 是否包含子科室（默认 true） */
    includeSubDepartments: z.boolean().optional().default(true),
    /** 角色过滤：给定时仅圈选该角色的账号（在科室范围内生效；未给科室时表示「全部该角色账号」） */
    role: z
      .enum(['admin', 'author', 'examinee'], { errorMap: () => ({ message: '角色不合法' }) })
      .optional(),
  })
  .refine(
    (v) => (v.userIds?.length ?? 0) > 0 || v.departmentId !== '' || v.role !== undefined,
    { message: '请至少选择一名用户、一个科室或一个角色' },
  );

export type BankAuthorBatchInput = z.infer<typeof bankAuthorsBatchSchema>;

/**
 * 题库复制入参（v1.7④ S4）。
 * - `name`：新题库名称（省略 → 「原名（副本）」）
 * - `copyQuestions`：是否连同试题一起复制（默认是）
 * - `authorIds`：新题库授权出题人（仅 admin 生效；省略 → 继承源题库作者）
 */
export const bankCloneSchema = z.object({
  name: z.string().max(100, '题库名称不能超过 100 个字符').optional().default(''),
  copyQuestions: z.boolean({ invalid_type_error: '复制试题开关必须为布尔值' }).optional().default(true),
  authorIds: z.array(z.string()).optional(),
});

export type BankCloneInput = z.infer<typeof bankCloneSchema>;

/**
 * 批量设置「对外开放练题」开关入参（仅 admin；练题端设置页使用）。
 * 只改 `allow_practice` 一列，不动名称或描述，避免为改一个开关而提交整份题库表单。
 */
export const bankPracticeBatchSchema = z.object({
  bankIds: z
    .array(z.string().min(1, '题库 ID 不能为空'), { invalid_type_error: '请至少选择一个题库' })
    .min(1, '请至少选择一个题库'),
  allowPractice: z.boolean({ invalid_type_error: '对外开放练题开关必须为布尔值' }),
});

export type BankPracticeBatchInput = z.infer<typeof bankPracticeBatchSchema>;

export type BankInput = z.infer<typeof bankSchema>;
