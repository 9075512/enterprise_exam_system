/** 鉴权 API（§4.5 鉴权 / v1.7③ 账号安全） */
import { del, get, post, put } from './http';
import type { AccountSecurityPolicy, LoginOutcome, LoginResult, LoginSession, RecoveryCodes, User } from '@/types';

/**
 * 登录签发 JWT（v1.7③：失败达阈值后需附图形验证码；开启 2FA 的账号返回挑战令牌）。
 *
 * `skipAuthRedirect`：登录失败的 401 表示「账号或密码不正确」，**不是会话失效**。
 * 若走全局 401 流程，会（1）弹错误的「登录状态已失效」文案，
 * （2）触发全局登出回调，（3）把 401 闸门锁死导致后续登录失败彻底静默无提示。
 * 跳过全局流程后，由响应拦截器统一弹出后端真实文案。
 */
export function login(
  username: string,
  password: string,
  captcha?: { captchaId: string; captcha: string },
): Promise<LoginOutcome> {
  return post<LoginOutcome>(
    '/auth/login',
    { username, password, captchaId: captcha?.captchaId, captcha: captcha?.captcha },
    { skipAuthRedirect: true },
  );
}

/** 两步验证第二步：用挑战令牌 + 6 位验证码换取正式 Token */
export function verifyTwoFactor(challengeToken: string, code: string): Promise<LoginResult> {
  return post<LoginResult>('/auth/2fa/verify', { challengeToken, code }, { skipAuthRedirect: true });
}

/** 获取图形验证码（登录失败达阈值后需要） */
export function fetchCaptcha(): Promise<{ captchaId: string; image: string }> {
  return get<{ captchaId: string; image: string }>('/auth/captcha');
}

/**
 * 登出（撤销当前会话，v1.7③）。
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

/** 修改本人密码（须满足密码策略） */
export function changePassword(oldPassword: string, newPassword: string): Promise<null> {
  return put<null>('/auth/password', { oldPassword, newPassword });
}

/* ------------------------------ 账号安全（v1.7③） ------------------------------ */

/** 账号安全策略与两步验证状态（v1.8② 增 twoFactorEnabled / recoveryCodesRemaining） */
export function twoFactorPolicy(): Promise<AccountSecurityPolicy> {
  return get<AccountSecurityPolicy>('/auth/2fa/policy');
}

/** 生成两步验证密钥（未启用） */
export function setupTwoFactor(): Promise<{ secret: string; otpauthUrl: string }> {
  return post<{ secret: string; otpauthUrl: string }>('/auth/2fa/setup');
}

/** 验证验证码后启用两步验证，返回一次性下发的恢复码（v1.8②） */
export function enableTwoFactor(code: string): Promise<RecoveryCodes> {
  return post<RecoveryCodes>('/auth/2fa/enable', { code });
}

/** 重新生成恢复码（需密码 + 验证码；作废旧码，v1.8②） */
export function regenerateRecoveryCodes(password: string, code: string): Promise<RecoveryCodes> {
  return post<RecoveryCodes>('/auth/2fa/recovery-codes', { password, code });
}

/** 关闭两步验证（密码 + 验证码） */
export function disableTwoFactor(password: string, code: string): Promise<null> {
  return post<null>('/auth/2fa/disable', { password, code });
}

/** 我的登录设备列表 */
export function listSessions(): Promise<LoginSession[]> {
  return get<LoginSession[]>('/auth/sessions');
}

/** 下线指定设备 */
export function revokeSession(id: string): Promise<null> {
  return del<null>(`/auth/sessions/${id}`);
}

/** 下线除当前设备外的全部设备 */
export function revokeOtherSessions(): Promise<{ count: number }> {
  return del<{ count: number }>('/auth/sessions');
}
