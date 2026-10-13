/**
 * 系统维护 API（v1.7④ T5，仅 admin）。
 */
import { get, post } from './http';
import type { ArchiveResult, MaintenanceStats } from '@/types';

/** 核心表行数与归档量统计 */
export function stats(): Promise<MaintenanceStats> {
  return get<MaintenanceStats>('/maintenance/stats');
}

/** 执行历史成绩归档（days/limit 省略时取系统设置与内置默认） */
export function archive(payload: { days?: number; limit?: number } = {}): Promise<ArchiveResult> {
  return post<ArchiveResult>('/maintenance/archive', payload);
}
