/**
 * 练题配置默认值（单一事实来源之一）。
 *
 * 与前端 `src/constants/practiceSettings.ts` 的 `PRACTICE_SETTINGS_DEFAULTS` 保持一致（跨端约定）。
 * 默认值与「引入该配置项之前」的硬编码行为一致，保证配置未初始化时练题表现不变。
 */
import type { PracticeSettings } from '../../types/domain.js';

/** 练题配置默认值。 */
export const DEFAULT_PRACTICE_SETTINGS: PracticeSettings = {
  /** 每日一练默认开启 */
  dailyEnabled: true,
  /** 每日一练默认题量 */
  dailyQuestionCount: 10,
  /** 默认不限制题型（空 = 全部题型） */
  dailyTypes: [],
  /** 默认优先从用户已练过的题库抽题 */
  dailyBankScope: 'practiced',
  /** 收藏夹默认上限 */
  favoriteLimit: 500,
};
