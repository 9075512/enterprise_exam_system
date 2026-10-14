/**
 * 考生「复核记录」时间线（设计稿 pages/exam-scores.html「复核记录」卡）。
 *
 * 把本人复核申请（ScoreAppeal[]）展开为时间线条目：
 *   - 每条申请恒有一条「提交复核申请」；
 *   - 已处理（approved / rejected）追加一条结果条目；
 *   - 待处理（pending）不追加（状态由列表「复核状态」列表达）。
 * 条目按时间**倒序**（最新在上），与设计稿示例一致。
 */
import dayjs from 'dayjs';
import { formatScore } from '@/utils/format';
import type { ScoreAppeal } from '@/types';

/** 圆点语义：'' 中性 / is-done 通过 / is-err 驳回（对应设计稿 .tl.is-done / .tl.is-err） */
export type AppealTimelineTone = '' | 'is-done' | 'is-err';

export interface AppealTimelineItem {
  /** 稳定 key */
  id: string;
  /** 主标题 */
  title: string;
  /** 副说明（时间 · 说明） */
  detail: string;
  /** 圆点语义 */
  tone: AppealTimelineTone;
  /** 排序用时间（ISO 字符串） */
  at: string;
}

/** 设计稿时间线的时间格式：MM-DD HH:mm */
export function formatTimelineTime(value: string | null): string {
  if (!value) return '';
  const d = dayjs(value);
  return d.isValid() ? d.format('MM-DD HH:mm') : '';
}

/** 拼接副文案（时间与说明，空段自动省略） */
function joinDetail(at: string, note?: string): string {
  return [formatTimelineTime(at), (note ?? '').trim()].filter(Boolean).join(' · ');
}

/** 复核申请 → 时间线条目（按时间倒序）。 */
export function buildAppealTimeline(appeals: ScoreAppeal[]): AppealTimelineItem[] {
  const items: AppealTimelineItem[] = [];
  for (const a of appeals) {
    items.push({
      id: `${a.id}-apply`,
      title: '提交复核申请',
      detail: joinDetail(a.appliedAt, a.examName),
      tone: '',
      at: a.appliedAt,
    });

    if (a.status === 'approved') {
      const at = a.reviewedAt ?? a.appliedAt;
      items.push({
        id: `${a.id}-approved`,
        title: `复核通过 · ${formatScore(a.originalScore)} → ${formatScore(a.newScore ?? a.originalScore)} 分`,
        detail: joinDetail(at, a.reviewComment),
        tone: 'is-done',
        at,
      });
    } else if (a.status === 'rejected') {
      const at = a.reviewedAt ?? a.appliedAt;
      items.push({
        id: `${a.id}-rejected`,
        title: '复核未通过 · 维持原分',
        detail: joinDetail(at, a.reviewComment),
        tone: 'is-err',
        at,
      });
    }
  }
  return items.sort((x, y) => new Date(y.at).getTime() - new Date(x.at).getTime());
}
