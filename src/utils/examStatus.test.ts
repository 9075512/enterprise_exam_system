/**
 * 纯函数单测：src/utils/examStatus.ts（时间窗左闭右闭）
 */
import { describe, it, expect } from 'vitest';
import { getExamStatus } from './examStatus';
import { getExamStatus as fromRules } from '@/services/examRules';

const exam = {
  startTime: '2026-01-01T10:00:00.000Z',
  endTime: '2026-01-01T11:00:00.000Z',
};

describe('getExamStatus', () => {
  it('now < startTime → not_started', () => {
    expect(getExamStatus(exam, new Date('2026-01-01T09:59:59.999Z'))).toBe('not_started');
  });

  it('now == startTime → ongoing（左闭）', () => {
    expect(getExamStatus(exam, new Date('2026-01-01T10:00:00.000Z'))).toBe('ongoing');
  });

  it('now 处于窗口内 → ongoing', () => {
    expect(getExamStatus(exam, new Date('2026-01-01T10:30:00.000Z'))).toBe('ongoing');
  });

  it('now == endTime → ongoing（右闭）', () => {
    expect(getExamStatus(exam, new Date('2026-01-01T11:00:00.000Z'))).toBe('ongoing');
  });

  it('now > endTime → ended', () => {
    expect(getExamStatus(exam, new Date('2026-01-01T11:00:00.001Z'))).toBe('ended');
  });

  it('examRules re-export 与 utils 实现一致', () => {
    expect(fromRules(exam, new Date('2026-01-01T11:00:00.001Z'))).toBe('ended');
  });
});
