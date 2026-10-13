/** 登录日志 API（v1.7③ 账号安全加固） */
import { get } from './http';
import type { LoginLog, Page } from '@/types';

/** 登录日志查询参数（来源 source：admin / practice）。 */
export interface LoginLogParams {
  username?: string;
  /** '' = 全部；'1' = 仅成功；'0' = 仅失败 */
  success?: '' | '0' | '1';
  source?: string;
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
}

/** 登录日志列表（分页 + 过滤） */
export function listLoginLogs(params: LoginLogParams): Promise<Page<LoginLog>> {
  return get<Page<LoginLog>>('/login-logs', params as Record<string, unknown>);
}
