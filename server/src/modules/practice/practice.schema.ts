/**
 * 练题模块 —— zod 校验 schema（中文错误信息，复用全局 zodLocale 兜底）。
 */
import { z } from 'zod';
import { paginationQuery } from '../../utils/pagination.js';

/** 题目列表每页上限（比通用 100 更小，降低批量爬取面）。 */
export const PRACTICE_QUESTION_MAX_PAGE_SIZE = 50;

/** 练题登录入参（验证码可选；失败达阈值后由守卫强制要求）。 */
export const practiceLoginSchema = z.object({
  username: z.string().min(1, '请输入账号'),
  password: z.string().min(1, '请输入密码'),
  captchaId: z.string().optional(),
  captcha: z.string().optional(),
});

/** 题库题目列表查询入参（筛选 + 分页）。 */
export const practiceQuestionsQuerySchema = z.object({
  type: z.preprocess(
    (v) => (v === '' ? undefined : v),
    z.enum(['single', 'multiple', 'judge'], { errorMap: () => ({ message: '题型不合法' }) }).optional(),
  ),
  subject: z.string().optional().default(''),
  page: paginationQuery.page,
  pageSize: z.coerce
    .number({ invalid_type_error: '每页条数必须为数字' })
    .int('每页条数必须为整数')
    .min(1, '每页至少 1 条')
    .max(PRACTICE_QUESTION_MAX_PAGE_SIZE, `每页最多 ${PRACTICE_QUESTION_MAX_PAGE_SIZE} 条`)
    .optional()
    .default(20),
});

/** 按 id 批量取题查询入参（逗号分隔，最多 100 个）。 */
export const practiceQuestionsByIdsQuerySchema = z.object({
  ids: z
    .string()
    .min(1, '缺少题目 id')
    .transform((s) => s.split(',').map((x) => x.trim()).filter((x) => x !== ''))
    .refine((arr) => arr.length > 0, '缺少题目 id')
    .refine((arr) => arr.length <= 100, '一次最多查询 100 道题'),
});

/** 生成练习序列入参。 */
export const practiceSessionSchema = z.object({
  bankId: z.string().min(1, '请选择题库'),
  /** 练题方式；缺省时由后端按「练题端设置 → 默认练题方式」兜底（v1.9⑤） */
  mode: z.enum(['sequence', 'random'], { errorMap: () => ({ message: '练题方式不合法' }) }).optional(),
  count: z
    .number({ invalid_type_error: '题量必须为数字' })
    .int('题量必须为整数')
    .min(1, '题量至少 1 题')
    .max(100, '题量最多 100 题')
    .optional(),
  types: z
    .array(z.enum(['single', 'multiple', 'judge'], { errorMap: () => ({ message: '题型不合法' }) }))
    .max(3, '题型数量不合法')
    .optional(),
});

/** 单题判分入参。 */
export const practiceCheckSchema = z.object({
  sessionToken: z.string().min(1, '缺少练习会话'),
  questionId: z.string().min(1, '缺少题目 id'),
  answer: z
    .array(z.number({ invalid_type_error: '作答必须为数字数组' }).int('作答必须为整数'), {
      invalid_type_error: '作答必须为数组',
    })
    .max(20, '作答项过多'),
});

/** 查询练题进度入参。 */
export const practiceProgressQuerySchema = z.object({
  bankId: z.string().min(1, '请选择题库'),
});

/**
 * 保存练题进度入参。
 * 说明：**不接受**客户端计数（doneCount/correctCount 一律由服务端基于 practice_answers 重算）；
 * 仅接受题库与「上次练到的题目」用于续练定位。
 */
export const practiceProgressPutSchema = z.object({
  bankId: z.string().min(1, '请选择题库'),
  lastQuestionId: z.string().nullable().optional(),
});

/** 错题本列表查询入参（分页）。 */
export const practiceWrongBookQuerySchema = z.object({
  page: paginationQuery.page,
  pageSize: z.coerce
    .number({ invalid_type_error: '每页条数必须为数字' })
    .int('每页条数必须为整数')
    .min(1, '每页至少 1 条')
    .max(PRACTICE_QUESTION_MAX_PAGE_SIZE, `每页最多 ${PRACTICE_QUESTION_MAX_PAGE_SIZE} 条`)
    .optional()
    .default(20),
});

/** 从错题本生成练习序列入参（可选按题库过滤）。 */
export const practiceWrongReansSchema = z.object({
  bankId: z.string().optional(),
});

/* ============================================================
 * 二期增量：收藏夹 / 每日一练 / 学习报告
 * ============================================================ */

/** 收藏 / 取消收藏入参。 */
export const practiceFavoriteBodySchema = z.object({
  questionId: z.string().min(1, '缺少题目 id'),
});

/** 收藏夹列表查询入参（分页 + 可选按题库筛选）。 */
export const practiceFavoriteListQuerySchema = z.object({
  page: paginationQuery.page,
  pageSize: z.coerce
    .number({ invalid_type_error: '每页条数必须为数字' })
    .int('每页条数必须为整数')
    .min(1, '每页至少 1 条')
    .max(PRACTICE_QUESTION_MAX_PAGE_SIZE, `每页最多 ${PRACTICE_QUESTION_MAX_PAGE_SIZE} 条`)
    .optional()
    .default(20),
  bankId: z.string().optional().default(''),
});

/** 收藏题目 id 列表查询入参（可选按题库过滤）。 */
export const practiceFavoriteIdsQuerySchema = z.object({
  bankId: z.string().optional().default(''),
});

/** 收藏题目路径参数。 */
export const practiceFavoriteParamsSchema = z.object({
  questionId: z.string().min(1, '缺少题目 id'),
});

/** 从收藏夹生成练习序列入参（可选按题库过滤）。 */
export const practiceFavoriteReansSchema = z.object({
  bankId: z.string().optional(),
});

/** 学习报告趋势查询入参（仅支持 7 / 30 天）。 */
export const practiceReportTrendQuerySchema = z.object({
  days: z.coerce
    .number({ invalid_type_error: '统计天数必须为数字' })
    .int('统计天数必须为整数')
    .refine((n) => n === 7 || n === 30, '统计天数仅支持 7 或 30')
    .optional()
    .default(7),
});

export type PracticeLoginInput = z.infer<typeof practiceLoginSchema>;
export type PracticeSessionInput = z.infer<typeof practiceSessionSchema>;

export const practiceSessionFinishSchema = z.object({
  status: z.enum(['completed', 'exited']),
});
export type PracticeCheckInput = z.infer<typeof practiceCheckSchema>;
export type PracticeProgressPutInput = z.infer<typeof practiceProgressPutSchema>;
export type PracticeFavoriteInput = z.infer<typeof practiceFavoriteBodySchema>;
export type PracticeFavoriteListQuery = z.infer<typeof practiceFavoriteListQuerySchema>;
