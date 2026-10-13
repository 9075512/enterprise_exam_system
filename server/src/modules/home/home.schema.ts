/**
 * 考生首页个性化配置 —— zod 校验 schema（v2.0⑥）。
 *
 * 入参（PUT /api/home/configs/:departmentId）：
 *   shortcuts:          快捷入口配置数组（key 必须在固定目录内，服务层再做一次过滤）
 *   recommendedBankIds: 推荐练题题库 id 数组（去重后 ≤ MAX_RECOMMENDED_BANKS）
 *
 * 说明：`departmentId` 取值范围（'*' 或真实科室）依赖数据库，放在服务层校验（→ 1001）。
 */
import { z } from 'zod';

import { MAX_RECOMMENDED_BANKS } from './homeProfile.service.js';

/** 单条快捷入口配置。 */
const shortcutItemSchema = z.object({
  key: z.string({ invalid_type_error: '快捷入口 key 必须为字符串' }).min(1, '快捷入口 key 不能为空'),
  enabled: z.boolean({ invalid_type_error: '快捷入口启用状态必须为布尔值' }),
  text: z
    .string({ invalid_type_error: '快捷入口文案必须为字符串' })
    .max(12, '快捷入口文案最多 12 个字')
    .optional(),
});

/** 首页配置保存入参。 */
export const homeConfigBodySchema = z.object({
  shortcuts: z
    .array(shortcutItemSchema, { invalid_type_error: '快捷入口配置必须为数组' })
    .max(20, '快捷入口配置项过多'),
  recommendedBankIds: z
    .array(z.string({ invalid_type_error: '推荐题库 id 必须为字符串' }), {
      invalid_type_error: '推荐题库必须为数组',
    })
    .max(MAX_RECOMMENDED_BANKS, `推荐题库最多 ${MAX_RECOMMENDED_BANKS} 个`),
});

/** PUT /api/home/configs/:departmentId 入参类型。 */
export type HomeConfigBodyInput = z.infer<typeof homeConfigBodySchema>;

/**
 * 路径参数：科室 id（含全局默认哨兵 `*`）。
 * 只做长度与字符白名单约束，是否真实存在交由服务层判定（→ 1001）。
 */
export const homeConfigParamsSchema = z.object({
  departmentId: z
    .string({ invalid_type_error: '科室 id 不合法' })
    .min(1, '科室 id 不能为空')
    .max(64, '科室 id 过长')
    .regex(/^(\*|[A-Za-z0-9_-]+)$/, '科室 id 不合法'),
});

/** PUT / DELETE /api/home/configs/:departmentId 路径参数类型。 */
export type HomeConfigParamsInput = z.infer<typeof homeConfigParamsSchema>;
