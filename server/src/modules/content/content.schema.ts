/**
 * 内容运营（公告 / 轮播图）—— zod 校验（v1.9⑥）。
 *
 * 时间窗约定：
 * - `startAt` / `endAt` 均为**可选** ISO 8601 时刻，空串 / null 一律归一为「不限制」；
 * - 两者同时存在时必须 `endAt > startAt`（跨字段 refine，错误码 1001）。
 */
import { z } from 'zod';
import { paginationQuery, optionalIdQuery } from '../../utils/pagination.js';

/** 发布范围：仅考试端 / 仅练题端 / 两端 */
export const contentTargetSchema = z.enum(['exam', 'practice', 'both'], {
  invalid_type_error: '发布范围必须为 exam / practice / both',
});

/** 公告级别 */
export const announcementLevelSchema = z.enum(['normal', 'important'], {
  invalid_type_error: '公告级别必须为 normal / important',
});

/**
 * 可选时刻：空串 / null / undefined → undefined（= 不限制），
 * 否则必须是可被 Date 解析的字符串。
 */
const optionalDateTime = z.preprocess(
  (v) => (v === '' || v === null ? undefined : v),
  z
    .string({ invalid_type_error: '生效时间必须为时间字符串' })
    .trim()
    .min(1, '生效时间不能为空')
    .refine((v) => !Number.isNaN(Date.parse(v)), '生效时间格式不正确')
    .optional(),
);

/** 时间窗跨字段校验：结束必须晚于开始。 */
function checkWindow(
  data: { startAt?: string; endAt?: string },
  ctx: z.RefinementCtx,
): void {
  if (!data.startAt || !data.endAt) return;
  if (Date.parse(data.endAt) <= Date.parse(data.startAt)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['endAt'],
      message: '生效结束时间必须晚于开始时间',
    });
  }
}

/**
 * 可选布尔查询参数（`?enabled=false`）。
 *
 * ⚠️ 不可直接用 `z.coerce.boolean()`：JS 的 `Boolean('false') === true`，
 * 会把前端传来的字符串 `'false'` 误判为「只看启用项」。此处显式解析。
 */
const optionalBoolQuery = z.preprocess((v) => {
  if (v === undefined || v === '') return undefined;
  if (typeof v === 'boolean') return v;
  const s = String(v).toLowerCase();
  if (s === 'true' || s === '1') return true;
  if (s === 'false' || s === '0') return false;
  return v;
}, z.boolean({ invalid_type_error: '筛选开关必须为 true / false' }).optional());

/** 管理端列表过滤（page / pageSize + target / enabled / keyword）。 */
export const contentListQuerySchema = z.object({
  ...paginationQuery,
  target: contentTargetSchema.optional(),
  enabled: optionalBoolQuery,
  keyword: optionalIdQuery('关键字不合法'),
});

/** 公告新建 / 编辑入参（整对象提交）。 */
export const announcementBodySchema = z
  .object({
    title: z
      .string({ invalid_type_error: '公告标题不能为空' })
      .trim()
      .min(1, '公告标题不能为空')
      .max(120, '公告标题最多 120 个字'),
    /**
     * 公告正文（v2.0① 起支持富文本 + 图片）。
     * 入参为编辑器输出的 HTML；**服务端**用 `utils/richText.sanitizeRichText`
     * 白名单净化后落库（前端渲染不构成安全边界）。
     * 长度上限放宽到 20000，与净化上限保持一致。
     */
    content: z
      .string({ invalid_type_error: '公告内容不能为空' })
      .trim()
      .min(1, '公告内容不能为空')
      .max(20000, '公告内容最多 20000 个字符'),
    target: contentTargetSchema,
    level: announcementLevelSchema.optional().default('normal'),
    pinned: z.boolean({ invalid_type_error: '置顶开关必须为布尔值' }).optional().default(false),
    enabled: z.boolean({ invalid_type_error: '启停开关必须为布尔值' }).optional().default(true),
    startAt: optionalDateTime,
    endAt: optionalDateTime,
  })
  .superRefine(checkWindow);

/** 轮播图新建 / 编辑入参（整对象提交）。 */
export const bannerBodySchema = z
  .object({
    title: z
      .string({ invalid_type_error: '轮播图标题不能为空' })
      .trim()
      .min(1, '轮播图标题不能为空')
      .max(120, '轮播图标题最多 120 个字'),
    imageUrl: z
      .string({ invalid_type_error: '轮播图片不能为空' })
      .trim()
      .min(1, '请上传或填写轮播图片')
      .max(500, '图片地址最多 500 个字符'),
    linkUrl: z
      .string({ invalid_type_error: '跳转地址格式不正确' })
      .trim()
      .max(500, '跳转地址最多 500 个字符')
      .optional()
      .default(''),
    target: contentTargetSchema,
    sortOrder: z
      .number({ invalid_type_error: '排序值必须为整数' })
      .int('排序值必须为整数')
      .min(0, '排序值不能为负数')
      .max(9999, '排序值不能超过 9999')
      .optional()
      .default(0),
    enabled: z.boolean({ invalid_type_error: '启停开关必须为布尔值' }).optional().default(true),
    startAt: optionalDateTime,
    endAt: optionalDateTime,
  })
  .superRefine(checkWindow);

/** 考生侧内容聚合查询（考试端 / 练题端共用；scope 决定看哪一端的内容）。 */
export const contentFeedQuerySchema = z.object({
  scope: contentTargetSchema.exclude(['both']).optional().default('exam'),
});

/** id 路径参数。 */
export const contentIdParamsSchema = z.object({
  id: z.string().trim().min(1, '参数不合法'),
});

export type AnnouncementBodyInput = z.infer<typeof announcementBodySchema>;
export type BannerBodyInput = z.infer<typeof bannerBodySchema>;
export type ContentListQueryInput = z.infer<typeof contentListQuerySchema>;
