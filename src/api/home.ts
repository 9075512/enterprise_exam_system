/**
 * 考试端首页 API（v2.0②）。
 *
 * 一次拉取首页所需统计 / 趋势 / 待办 / 快捷入口，
 * 取代此前「exams/my + records/my + 未读数」三次并发后再本地即时计算的做法。
 */
import { get } from './http';
import type { HomeSummary } from '@/types';

/** 考生首页聚合数据 */
export function getSummary(): Promise<HomeSummary> {
  return get<HomeSummary>('/home/summary');
}
