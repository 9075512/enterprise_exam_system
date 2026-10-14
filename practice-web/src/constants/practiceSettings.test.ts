/**
 * 练题配置默认值测试。
 * 护栏：`PRACTICE_CONFIG_DEFAULTS`（公开配置兜底）与 `PRACTICE_SETTINGS_DEFAULTS`（完整设置）
 * 的公共键必须一一对应且值一致 —— 任一侧新增配置项漏同步时在此失败。
 */
import { describe, expect, it } from 'vitest';
import {
  DAILY_COUNT_MAX,
  DAILY_COUNT_MIN,
  FAVORITE_LIMIT_MAX,
  FAVORITE_LIMIT_MIN,
  PRACTICE_CONFIG_DEFAULTS,
  PRACTICE_SETTINGS_DEFAULTS,
} from './practiceSettings';

describe('practiceSettings 默认值', () => {
  it('CONFIG_DEFAULTS 的每个键都必须存在于 SETTINGS_DEFAULTS 且值一致', () => {
    for (const [key, value] of Object.entries(PRACTICE_CONFIG_DEFAULTS)) {
      expect(PRACTICE_SETTINGS_DEFAULTS, `缺少配置项: ${key}`).toHaveProperty(key);
      expect(
        PRACTICE_SETTINGS_DEFAULTS[key as keyof typeof PRACTICE_SETTINGS_DEFAULTS],
        `默认值不一致: ${key}`,
      ).toBe(value);
    }
  });

  it('每日一练题量范围合法（min ≤ 默认值 ≤ max）', () => {
    expect(DAILY_COUNT_MIN).toBeLessThanOrEqual(DAILY_COUNT_MAX);
    expect(PRACTICE_SETTINGS_DEFAULTS.dailyQuestionCount).toBeGreaterThanOrEqual(DAILY_COUNT_MIN);
    expect(PRACTICE_SETTINGS_DEFAULTS.dailyQuestionCount).toBeLessThanOrEqual(DAILY_COUNT_MAX);
  });

  it('收藏上限范围合法（min ≤ 默认值 ≤ max）', () => {
    expect(FAVORITE_LIMIT_MIN).toBeLessThanOrEqual(FAVORITE_LIMIT_MAX);
    expect(PRACTICE_SETTINGS_DEFAULTS.favoriteLimit).toBeGreaterThanOrEqual(FAVORITE_LIMIT_MIN);
    expect(PRACTICE_SETTINGS_DEFAULTS.favoriteLimit).toBeLessThanOrEqual(FAVORITE_LIMIT_MAX);
  });
});
