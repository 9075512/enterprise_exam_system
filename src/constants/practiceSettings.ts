/**
 * 练题配置默认值（前端侧单一事实来源）。
 *
 * 必须与后端 `server/src/modules/practice/practiceSettings.defaults.ts` 保持一致（跨端约定）。
 * 默认值与「引入该配置项之前」的硬编码行为一致，保证后端不可用或配置未初始化时练题表现不变。
 */
import type { PracticeSettings } from '@/types';

/** 练题配置默认值。 */
export const PRACTICE_SETTINGS_DEFAULTS: PracticeSettings = {
  dailyEnabled: true,
  dailyQuestionCount: 10,
  dailyTypes: [],
  dailyBankScope: 'practiced',
  favoriteLimit: 500,

  /* v1.9⑤ */
  defaultPracticeMode: 'sequence',
  sessionMinCount: 1,
  sessionMaxCount: 50,
  showAnswer: true,
  showAnalysis: true,
  dailyResetHour: 0,
  dailyMinQuestionCount: 1,
  wrongAutoRemoveStreak: 0,
  reportEnabled: true,
  wrongBookEnabled: true,
  favoriteEnabled: true,
};

/** 每日一练题量可选范围。 */
export const DAILY_COUNT_MIN = 1;
export const DAILY_COUNT_MAX = 50;

/** 收藏上限可选范围。 */
export const FAVORITE_LIMIT_MIN = 1;
export const FAVORITE_LIMIT_MAX = 2000;

/* ------------------------- v1.9⑤ 新增范围与选项 ------------------------- */

/** 单次练习题量上下限范围。 */
export const SESSION_COUNT_MIN = 1;
export const SESSION_COUNT_MAX = 100;

/** 每日一练最少抽题数范围。 */
export const DAILY_MIN_COUNT_MIN = 1;
export const DAILY_MIN_COUNT_MAX = 50;

/** 错题自动移除阈值范围（0 = 不自动移除）。 */
export const WRONG_AUTO_REMOVE_MIN = 0;
export const WRONG_AUTO_REMOVE_MAX = 20;

/** 每日一练重置时点范围。 */
export const DAILY_RESET_HOUR_MIN = 0;
export const DAILY_RESET_HOUR_MAX = 23;

/** 抽题范围选项（管理端下拉用）。 */
export const DAILY_BANK_SCOPE_OPTIONS: Array<{ label: string; value: PracticeSettings['dailyBankScope'] }> = [
  { label: '优先用户已练过的题库（不足时自动补充其他开放题库）', value: 'practiced' },
  { label: '全部开放题库', value: 'all' },
];

/** 默认练题方式选项。 */
export const DEFAULT_PRACTICE_MODE_OPTIONS: Array<{
  label: string;
  value: PracticeSettings['defaultPracticeMode'];
}> = [
  { label: '顺序练习（按题目录入顺序）', value: 'sequence' },
  { label: '随机练习（每次打乱顺序）', value: 'random' },
];
