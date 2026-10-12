/** 系统设置 API（§4.5） */
import { get, put } from './http';
import type { PracticeSettings, PublicSettings, SystemSettings } from '@/types';

/** 公开设置（无需登录，登录页品牌展示用） */
export function getPublicSettings(): Promise<PublicSettings> {
  return get<PublicSettings>('/settings/public');
}

/** 完整设置（需登录，任意角色） */
export function getSettings(): Promise<SystemSettings> {
  return get<SystemSettings>('/settings');
}

/** 保存设置（仅 admin），返回保存后的完整设置 */
export function updateSettings(payload: SystemSettings): Promise<SystemSettings> {
  return put<SystemSettings>('/settings', payload);
}

/**
 * 公网练题配置（仅 admin）。
 * 与 `updateSettings` 独立：练题配置存于独立的单行表，避免两类配置互相覆盖。
 */
export function getPracticeSettings(): Promise<PracticeSettings> {
  return get<PracticeSettings>('/settings/practice');
}

/** 保存公网练题配置（仅 admin），返回保存后的配置 */
export function updatePracticeSettings(payload: PracticeSettings): Promise<PracticeSettings> {
  return put<PracticeSettings>('/settings/practice', payload);
}
