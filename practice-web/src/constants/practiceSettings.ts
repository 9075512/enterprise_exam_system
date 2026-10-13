/**
 * 练题配置默认值（前端侧单一事实来源）。
 *
 * 必须与后端 `server/src/modules/practice/practiceSettings.defaults.ts` 保持一致（跨端约定）。
 * 默认值与「引入该配置项之前」的硬编码行为一致，保证后端不可用或配置未初始化时练题表现不变。
 */
import type { PracticeConfig, PracticeSettings } from '@/types';

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

/**
 * 练题端公开配置默认值（`GET /api/practice/config` 不可用时的兜底）。
 * 与后端默认值一致 → 接口失败时练题端表现与「引入配置项之前」完全相同。
 */
export const PRACTICE_CONFIG_DEFAULTS: PracticeConfig = {
  defaultPracticeMode: 'sequence',
  sessionMinCount: 1,
  sessionMaxCount: 50,
  showAnswer: true,
  showAnalysis: true,
  reportEnabled: true,
  wrongBookEnabled: true,
  favoriteEnabled: true,
  dailyEnabled: true,
};

/** 每日一练题量可选范围。 */
export const DAILY_COUNT_MIN = 1;
export const DAILY_COUNT_MAX = 50;

/** 收藏上限可选范围。 */
export const FAVORITE_LIMIT_MIN = 1;
export const FAVORITE_LIMIT_MAX = 2000;

/** 抽题范围选项（管理端下拉用）。 */
export const DAILY_BANK_SCOPE_OPTIONS: Array<{ label: string; value: PracticeSettings['dailyBankScope'] }> = [
  { label: '优先用户已练过的题库（不足时自动补充其他开放题库）', value: 'practiced' },
  { label: '全部开放题库', value: 'all' },
];
