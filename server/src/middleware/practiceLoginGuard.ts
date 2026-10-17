/**
 * 练题登录守卫（登录失败锁定 + 图形验证码）——零依赖、进程内存储。
 *
 * 键 = 账号 + IP（架构共享约定 §10-15）。行为：
 * ① 累计失败次数达到 `PRACTICE_LOGIN_MAX_FAILS` → 临时锁定（指数退避，封顶 24h），返回 1011/429；
 * ② 累计失败次数达到后台“系统设置”阈值 → 要求并校验**图形验证码**（v1.7③ T1，
 *    由 `utils/captcha` 统一提供），缺失或错误返回 1012/400。
 *
 * 说明：内存锁定在多实例下需共享存储；方案乙（单练题实例）场景足够。多实例时替换为 redis（接口不变）。
 */
import type { NextFunction, Request, Response } from 'express';
import { env } from '../config/env.js';
import { practiceCaptchaRequired, practiceLoginLocked } from '../utils/errors.js';
import { verifyCaptcha } from '../utils/captcha.js';
import { getSettings } from '../modules/settings/settings.service.js';

/** 取客户端 IP（优先反代注入的 X-Forwarded-For 首个地址，退化到 socket）。 */
export function clientIp(req: Request): string {
  const xff = req.headers['x-forwarded-for'];
  const raw = Array.isArray(xff) ? xff[0] : xff;
  const first = raw?.split(',')[0]?.trim();
  return first || req.socket.remoteAddress || 'unknown';
}

/** 登录失败锁定键 = 账号（小写）+ IP。 */
export function loginKey(username: string, ip: string): string {
  return `${username.trim().toLowerCase()}|${ip}`;
}

interface FailState {
  /** 累计失败次数 */
  count: number;
  /** 锁定截止时间戳（毫秒）；0 = 未锁定 */
  lockedUntil: number;
}

const failStore = new Map<string, FailState>();

/** 读取失败态（惰性初始化）。 */
function getFailState(key: string): FailState {
  return failStore.get(key) ?? { count: 0, lockedUntil: 0 };
}

/** 记录一次登录失败：计数 +1，达阈值则设置锁定截止（指数退避）。 */
export function recordLoginFailure(username: string, ip: string): void {
  const key = loginKey(username, ip);
  const state = getFailState(key);
  state.count += 1;
  if (state.count >= env.PRACTICE_LOGIN_MAX_FAILS) {
    const over = state.count - env.PRACTICE_LOGIN_MAX_FAILS;
    const baseMs = env.PRACTICE_LOGIN_LOCK_MINUTES * 60 * 1000;
    // 指数退避：base × 2^over，封顶 24h（over 上限 6 防止溢出）
    const lockMs = Math.min(baseMs * 2 ** Math.min(over, 6), 24 * 60 * 60 * 1000);
    state.lockedUntil = Date.now() + lockMs;
  }
  failStore.set(key, state);
}

/** 登录成功后清空失败计数（解除锁定与验证码要求）。 */
export function clearLoginFailures(username: string, ip: string): void {
  failStore.delete(loginKey(username, ip));
}

/** 该 账号+IP 剩余锁定时长（毫秒）；0 = 未锁定。 */
export function lockedRemainingMs(username: string, ip: string): number {
  const state = getFailState(loginKey(username, ip));
  return state.lockedUntil > Date.now() ? state.lockedUntil - Date.now() : 0;
}

/** 是否已触发验证码要求（失败次数达到软阈值）。 */
export function captchaRequired(username: string, ip: string, afterFails: number): boolean {
  return getFailState(loginKey(username, ip)).count >= afterFails;
}

/* ------------------------------ 图形验证码（v1.7③ T1：替换自研算术） ------------------------------ */

export { issueCaptcha, verifyCaptcha } from '../utils/captcha.js';

/**
 * 登录接口前置守卫：锁定校验 + 验证码校验。
 * 需在 `validate(loginSchema)` 之后使用（此时 `req.body` 已解析为带默认值的对象）。
 */
export async function practiceLoginGuard(req: Request, _res: Response, next: NextFunction): Promise<void> {
  const body = (req.body ?? {}) as { username?: string; captchaId?: string; captcha?: string };
  const username = String(body.username ?? '');
  const ip = clientIp(req);

  const remain = lockedRemainingMs(username, ip);
  if (remain > 0) {
    const minutes = Math.max(1, Math.ceil(remain / 60000));
    next(practiceLoginLocked(`登录失败次数过多，请 ${minutes} 分钟后再试`));
    return;
  }

  try {
    const settings = await getSettings();
    if (captchaRequired(username, ip, settings.loginCaptchaAfterFails)) {
      if (!body.captchaId || !body.captcha || !verifyCaptcha(body.captchaId, body.captcha)) {
        next(practiceCaptchaRequired('请输入验证码'));
        return;
      }
    }
    next();
  } catch (err) {
    next(err);
  }
}

/* ------------------------------ 登录审计日志 ------------------------------ */

/** 审计日志入参（**不记密码**）。 */
export interface LoginAuditInput {
  username: string;
  ip: string;
  userAgent: string;
  success: boolean;
  /** 失败原因（成功时为空） */
  reason?: string;
}

/**
 * 记录登录审计日志（成功/失败/来源 IP/UA/时间；**绝不记录密码**）。
 * 输出为结构化单行日志，便于采集/告警；生产可替换为写日志文件或审计表。
 */
export function recordLoginAudit(input: LoginAuditInput): void {
  const line = {
    at: new Date().toISOString(),
    event: 'practice_login',
    success: input.success,
    username: input.username,
    ip: input.ip,
    ua: input.userAgent,
    reason: input.reason ?? '',
  };
  // eslint-disable-next-line no-console
  console.log(`[practice-audit] ${JSON.stringify(line)}`);
}
