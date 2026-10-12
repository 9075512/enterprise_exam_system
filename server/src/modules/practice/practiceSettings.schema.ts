/**
 * 练题配置 —— zod 校验 schema（完整对象，所有字段必填，中文文案）。
 *
 * 范围口径（越界 → 1001）：
 *   dailyQuestionCount 1~50 / favoriteLimit 1~2000
 *   dailyTypes ⊆ {single, multiple, judge}（去重后最多 3 项；空数组 = 全部题型）
 *   dailyBankScope ∈ {practiced, all}
 */
import { z } from 'zod';

/** 题型枚举（与 questions.type 一致）。 */
const QUESTION_TYPES = ['single', 'multiple', 'judge'] as const;

/** 练题配置校验（PUT /api/settings/practice 入参，所有字段必填）。 */
export const practiceSettingsSchema = z.object({
  dailyEnabled: z.boolean({
    invalid_type_error: '每日一练开关必须为布尔值',
  }),

  dailyQuestionCount: z
    .number({ invalid_type_error: '每日一练题量必须为 1~50' })
    .int('每日一练题量必须为 1~50')
    .min(1, '每日一练题量必须为 1~50')
    .max(50, '每日一练题量必须为 1~50'),

  dailyTypes: z
    .array(z.enum(QUESTION_TYPES, { invalid_type_error: '每日一练题型范围不合法' }), {
      invalid_type_error: '每日一练题型范围不合法',
    })
    .max(3, '每日一练题型范围不合法')
    .default([]),

  dailyBankScope: z.enum(['practiced', 'all'], {
    invalid_type_error: '每日一练抽题范围不合法',
  }),

  favoriteLimit: z
    .number({ invalid_type_error: '收藏上限必须为 1~2000' })
    .int('收藏上限必须为 1~2000')
    .min(1, '收藏上限必须为 1~2000')
    .max(2000, '收藏上限必须为 1~2000'),
});

/** PUT /api/settings/practice 入参类型。 */
export type PracticeSettingsInput = z.infer<typeof practiceSettingsSchema>;
