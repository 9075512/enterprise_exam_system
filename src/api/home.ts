/**
 * 考试端首页 API（v2.0②）。
 *
 * 一次拉取首页所需统计 / 趋势 / 待办 / 个性化入口，
 * 取代此前「exams/my + records/my + 未读数」三次并发后再本地即时计算的做法。
 */
import { get, put, del } from './http';
import type { HomeConfigOverview, HomeDeptConfig, HomeShortcutConfigItem, HomeSummary } from '@/types';

/** 考生首页聚合数据 */
export function getSummary(): Promise<HomeSummary> {
  return get<HomeSummary>('/home/summary');
}

/* ------------------------------ 管理端：首页配置（v2.0⑥） ------------------------------ */

/** 首页配置总览（快捷入口目录 + 科室列表 + 已配置项） */
export function getConfigs(): Promise<HomeConfigOverview> {
  return get<HomeConfigOverview>('/home/configs');
}

/**
 * 保存某科室（或 `*` 全局默认）的首页配置。
 * @param departmentId 科室 id；`*` 表示全局默认
 */
export function saveConfig(
  departmentId: string,
  payload: { shortcuts: HomeShortcutConfigItem[]; recommendedBankIds: string[] },
): Promise<HomeDeptConfig> {
  return put<HomeDeptConfig>(`/home/configs/${encodeURIComponent(departmentId)}`, payload);
}

/** 删除某科室配置（回到全局默认 / 内置默认） */
export function resetConfig(departmentId: string): Promise<null> {
  return del<null>(`/home/configs/${encodeURIComponent(departmentId)}`);
}
