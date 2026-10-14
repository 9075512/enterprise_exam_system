/**
 * 考生「复核记录」时间线（v3.3）—— 纯函数单测。
 *
 * 口径：每条申请恒有一条「提交复核申请」；已处理追加结果条目（通过 is-done / 驳回 is-err）；
 * 待处理不追加；条目按时间倒序合并。
 */
import { describe, it, expect } from 'vitest';

import { buildAppealTimeline, formatTimelineTime } from './appealTimeline';
import type { ScoreAppeal } from '@/types';

function appeal(partial: Partial<ScoreAppeal>): ScoreAppeal {
  return {
    id: 'ap-1',
    recordId: 'rec-1',
    examId: 'exam-1',
    examName: '财务内控专项考试',
    userId: 'u-1',
    userName: '张三',
    username: 'zhangsan',
    departmentName: '财务部',
    status: 'pending',
    reason: '第 15 题判分有误',
    originalScore: 61,
    newScore: null,
    reviewComment: '',
    appliedAt: '2026-08-28 15:20:00',
    reviewedBy: null,
    reviewedAt: null,
    ...partial,
  };
}

describe('v3.3 复核记录时间线', () => {
  it('复核通过：展开为「提交 + 通过」两条，结果在上（时间倒序）', () => {
    const items = buildAppealTimeline([
      appeal({
        status: 'approved',
        newScore: 66,
        reviewComment: '第 15 题参考答案有误，统一加 5 分',
        reviewedAt: '2026-09-29 10:12:00',
      }),
    ]);
    expect(items).toHaveLength(2);
    expect(items[0].title).toBe('复核通过 · 61 → 66 分');
    expect(items[0].tone).toBe('is-done');
    expect(items[0].detail).toBe('09-29 10:12 · 第 15 题参考答案有误，统一加 5 分');
    expect(items[1].title).toBe('提交复核申请');
    expect(items[1].tone).toBe('');
    expect(items[1].detail).toBe('08-28 15:20 · 财务内控专项考试');
  });

  it('复核驳回：结果条目为 is-err 且标「维持原分」', () => {
    const items = buildAppealTimeline([
      appeal({ status: 'rejected', reviewComment: '经核查作答与评分一致', reviewedAt: '2026-08-29 09:40:00' }),
    ]);
    expect(items).toHaveLength(2);
    expect(items[0].title).toBe('复核未通过 · 维持原分');
    expect(items[0].tone).toBe('is-err');
    expect(items[0].detail).toBe('08-29 09:40 · 经核查作答与评分一致');
  });

  it('待处理：仅一条「提交复核申请」，不追加结果条目', () => {
    const items = buildAppealTimeline([appeal({ status: 'pending' })]);
    expect(items).toHaveLength(1);
    expect(items[0].title).toBe('提交复核申请');
    expect(items[0].tone).toBe('');
  });

  it('多场考试：跨申请按时间倒序合并', () => {
    const items = buildAppealTimeline([
      appeal({ id: 'ap-a', status: 'approved', newScore: 90, appliedAt: '2026-06-01 09:00:00', reviewedAt: '2026-06-02 09:00:00' }),
      appeal({ id: 'ap-b', status: 'pending', appliedAt: '2026-08-01 09:00:00' }),
    ]);
    expect(items.map((i) => i.id)).toEqual(['ap-b-apply', 'ap-a-approved', 'ap-a-apply']);
  });

  it('空数组 / 副文案缺段处理', () => {
    expect(buildAppealTimeline([])).toEqual([]);
    // 无复核意见时副文案只保留时间
    const items = buildAppealTimeline([appeal({ status: 'rejected', reviewedAt: '2026-08-29 09:40:00' })]);
    expect(items[0].detail).toBe('08-29 09:40');
  });

  it('formatTimelineTime：空值与非法值返回空串', () => {
    expect(formatTimelineTime(null)).toBe('');
    expect(formatTimelineTime('2026-09-29 10:12:00')).toBe('09-29 10:12');
  });
});
