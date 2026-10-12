/**
 * 纯函数单测：src/utils/format.ts
 */
import { describe, it, expect } from 'vitest';
import { formatScore, formatSeconds, formatPercent, formatClock, optionLetter } from './format';

describe('formatScore', () => {
  it('整数不带小数点', () => {
    expect(formatScore(60)).toBe('60');
    expect(formatScore(0)).toBe('0');
  });

  it('保留 1 位小数（四舍五入）', () => {
    expect(formatScore(33.333)).toBe('33.3');
    expect(formatScore(59.96)).toBe('60');
    expect(formatScore(0.25)).toBe('0.3');
  });
});

describe('formatSeconds', () => {
  it('不足 1 分钟仅显示秒', () => {
    expect(formatSeconds(0)).toBe('0 秒');
    expect(formatSeconds(59)).toBe('59 秒');
  });

  it('分+秒组合，且四舍五入', () => {
    expect(formatSeconds(65)).toBe('1 分 5 秒');
    expect(formatSeconds(59.6)).toBe('1 分 0 秒');
    expect(formatSeconds(120)).toBe('2 分 0 秒');
  });

  it('负数归零', () => {
    expect(formatSeconds(-5)).toBe('0 秒');
  });
});

describe('formatPercent', () => {
  it('0~1 比例转百分比整数', () => {
    expect(formatPercent(0)).toBe('0%');
    expect(formatPercent(0.5)).toBe('50%');
    expect(formatPercent(0.126)).toBe('13%');
    expect(formatPercent(1)).toBe('100%');
  });
});

describe('formatClock', () => {
  it('秒数 → HH:mm:ss', () => {
    expect(formatClock(0)).toBe('00:00:00');
    expect(formatClock(59)).toBe('00:00:59');
    expect(formatClock(3661)).toBe('01:01:01');
  });
});

describe('optionLetter', () => {
  it('索引 → 选项字母', () => {
    expect(optionLetter(0)).toBe('A');
    expect(optionLetter(3)).toBe('D');
  });
});
