/** 鉴权 API（§4.5 鉴权） */
import { get, post, put } from './http';
import type { LoginResult, User } from '@/types';

/**
 * 登录签发 JWT。
 *
 * `skipAuthRedirect`：登录失败的 401 表示「账号或密码不正确」，**不是会话失效**。
 * 若走全局 401 流程，会（1）弹错误的「登录状态已失效」文案，
 * （2）触发全局登出回调，（3）把 401 闸门锁死导致后续登录失败彻底静默无提示。
 * 跳过全局流程后，由响应拦截器统一弹出后端真实文案。
 */
export function login(username: string, password: string): Promise<LoginResult> {
  return post<LoginResult>('/auth/login', { username, password }, { skipAuthRedirect: true });
}

/**
 * 登出（无状态，后端仅校验后返回 ok）。
 *
 * - 显式携带 Token：调用方此时通常已清空本地会话，不能再依赖拦截器从 localStorage 取。
 * - `skipAuthRedirect`：登出本身的 401 不应再触发「登录已失效」提示与全局登出流程，
 *   否则会与全局回调互相触发形成递归。
 * - `suppressErrorToast`：登出是「尽力而为」的通知，失败无需打扰用户。
 */
export function logout(token: string): Promise<null> {
  return post<null>('/auth/logout', undefined, {
    headers: { Authorization: `Bearer ${token}` },
    skipAuthRedirect: true,
    suppressErrorToast: true,
  });
}

/** 获取当前用户 */
export function fetchMe(): Promise<User> {
  return get<User>('/auth/me');
}

/** 修改本人密码 */
export function changePassword(oldPassword: string, newPassword: string): Promise<null> {
  return put<null>('/auth/password', { oldPassword, newPassword });
}
