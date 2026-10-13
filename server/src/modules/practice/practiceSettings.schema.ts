/**
 * 练题配置 —— zod 校验 schema（完整对象，所有字段必填，中文文案）。
 *
 * 范围口径（越界 → 1001）：
 *   dailyQuestionCount 1~50 / favoriteLimit 1~2000
 *   dailyTypes ⊆ {single, multiple, judge}（去重后最多 3 项；空数组 = 全部题型）
 *   dailyBankScope ∈ {practiced, all}
 *   defaultPracticeMode ∈ {sequence, random}
 *   sessionMinCount / sessionMaxCount 1~100，且 sessionMaxCount >= sessionMinCount
 *   dailyResetHour 0~23 / dailyMinQuestionCount 1~50 / wrongAutoRemoveStreak 0~20
 */
import { z } from 'zod';

/** 题型枚举（与 questions.type 一致）。 */
const QUESTION_TYPES = ['single', 'multiple', 'judge'] as const;

/** 单次练习题量上下限边界。 */
export const SESSION_COUNT_MIN = 1;
export const SESSION_COUNT_MAX = 100;

/** 练题配置校验（PUT /api/settings/practice 入参，所有字段必填）。 */
export const practiceSettingsSchema = z
  .object({
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

    /* ---------------- v1.9⑤ 新增 ---------------- */

    defaultPracticeMode: z.enum(['sequence', 'random'], {
      invalid_type_error: '默认练题方式不合法',
    }),

    sessionMinCount: z
      .number({ invalid_type_error: `单次题量下限必须为 ${SESSION_COUNT_MIN}~${SESSION_COUNT_MAX}` })
      .int(`单次题量下限必须为 ${SESSION_COUNT_MIN}~${SESSION_COUNT_MAX}`)
      .min(SESSION_COUNT_MIN, `单次题量下限必须为 ${SESSION_COUNT_MIN}~${SESSION_COUNT_MAX}`)
      .max(SESSION_COUNT_MAX, `单次题量下限必须为 ${SESSION_COUNT_MIN}~${SESSION_COUNT_MAX}`),

    sessionMaxCount: z
      .number({ invalid_type_error: `单次题量上限必须为 ${SESSION_COUNT_MIN}~${SESSION_COUNT_MAX}` })
      .int(`单次题量上限必须为 ${SESSION_COUNT_MIN}~${SESSION_COUNT_MAX}`)
      .min(SESSION_COUNT_MIN, `单次题量上限必须为 ${SESSION_COUNT_MIN}~${SESSION_COUNT_MAX}`)
      .max(SESSION_COUNT_MAX, `单次题量上限必须为 ${SESSION_COUNT_MIN}~${SESSION_COUNT_MAX}`),

    showAnswer: z.boolean({ invalid_type_error: '答案展示开关必须为布尔值' }),
    showAnalysis: z.boolean({ invalid_type_error: '解析展示开关必须为布尔值' }),

    dailyResetHour: z
      .number({ invalid_type_error: '每日一练重置时点必须为 0~23' })
      .int('每日一练重置时点必须为 0~23')
      .min(0, '每日一练重置时点必须为 0~23')
      .max(23, '每日一练重置时点必须为 0~23'),

    dailyMinQuestionCount: z
      .number({ invalid_type_error: '每日一练最少题量必须为 1~50' })
      .int('每日一练最少题量必须为 1~50')
      .min(1, '每日一练最少题量必须为 1~50')
      .max(50, '每日一练最少题量必须为 1~50'),

    wrongAutoRemoveStreak: z
      .number({ invalid_type_error: '错题自动移除阈值必须为 0~20' })
      .int('错题自动移除阈值必须为 0~20')
      .min(0, '错题自动移除阈值必须为 0~20')
      .max(20, '错题自动移除阈值必须为 0~20'),

    reportEnabled: z.boolean({ invalid_type_error: '学习报告开关必须为布尔值' }),
    wrongBookEnabled: z.boolean({ invalid_type_error: '错题本开关必须为布尔值' }),
    favoriteEnabled: z.boolean({ invalid_type_error: '收藏夹开关必须为布尔值' }),
  })
  .refine((v) => v.sessionMaxCount >= v.sessionMinCount, {
    message: '单次题量上限不能小于下限',
    path: ['sessionMaxCount'],
  });

/** PUT /api/settings/practice 入参类型。 */
export type PracticeSettingsInput = z.infer<typeof practiceSettingsSchema>;
