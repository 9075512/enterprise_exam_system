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

  /* ---------------- v1.9⑤ 新增（默认值 = 引入前的硬编码行为） ---------------- */
  /** 默认顺序出题（与 v1.9 之前练题端默认一致） */
  defaultPracticeMode: 'sequence',
  /** 单次题量下限默认 1 */
  sessionMinCount: 1,
  /** 单次题量上限默认 50（与 v1.9 之前练题端步进器上限一致） */
  sessionMaxCount: 50,
  /** 默认展示正确答案 */
  showAnswer: true,
  /** 默认展示解析 */
  showAnalysis: true,
  /** 默认按自然日 00:00 切分业务日（与历史行为一致） */
  dailyResetHour: 0,
  /** 默认最少抽 1 题（低于 1 视为无题可练，恒不触发） */
  dailyMinQuestionCount: 1,
  /** 默认不自动移出错题本 */
  wrongAutoRemoveStreak: 0,
  /** 默认开启学习报告入口 */
  reportEnabled: true,
  /** 默认开启错题本入口 */
  wrongBookEnabled: true,
  /** 默认开启收藏夹功能 */
  favoriteEnabled: true,

  /* ---------------- v2.0⑤ 新增 ---------------- */
  /** 默认开启打卡与成就模块 */
  achievementEnabled: true,
};
