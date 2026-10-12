/**
 * 纯函数单测：src/utils/datetime.ts
 * 断言与本地时区无关：校验空值占位、格式形状与组合一致性。
 */
import { describe, it, expect } from 'vitest';
import { formatDateTime, formatRange, toDateInputValue } from './datetime';

const ISO = '2026-03-04T05:06:07.000Z';

describe('formatDateTime', () => {
  it('空值显示占位符', () => {
    expect(formatDateTime(null)).toBe('—');
    expect(formatDateTime(undefined)).toBe('—');
    expect(formatDateTime('')).toBe('—');
  });

  it('ISO → YYYY-MM-DD HH:mm 形状', () => {
    expect(formatDateTime(ISO)).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/);
  });
});

describe('formatRange', () => {
  it('时间窗展示为「起 ~ 止」', () => {
    const start = '2026-03-04T05:06:07.000Z';
    const end = '2026-03-05T07:08:09.000Z';
    expect(formatRange(start, end)).toBe(`${formatDateTime(start)} ~ ${formatDateTime(end)}`);
    expect(formatRange(start, end)).toContain(' ~ ');
  });
});

describe('toDateInputValue', () => {
  it('ISO → datetime-local 值形状', () => {
    expect(toDateInputValue(ISO)).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
  });
});
