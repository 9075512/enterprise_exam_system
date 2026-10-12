/**
 * 练题登录守卫（登录失败锁定 + 验证码）——零依赖、进程内存储。
 *
 * 键 = 账号 + IP（架构共享约定 §10-15）。行为：
 * ① 累计失败次数达到 `PRACTICE_LOGIN_MAX_FAILS` → 临时锁定（指数退避，封顶 24h），返回 1011/429；
 * ② 累计失败次数达到 `PRACTICE_CAPTCHA_AFTER_FAILS` → 要求并校验验证码（自研轻量算术验证码），
 *    缺失或错误返回 1012/400。
 *
 * 说明：内存锁定在多实例下需共享存储；方案乙（单练题实例）场景足够。多实例时替换为 redis（接口不变）。
 */
import crypto from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { env } from '../config/env.js';
import { practiceCaptchaRequired, practiceLoginLocked } from '../utils/errors.js';

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
export function captchaRequired(username: string, ip: string): boolean {
  return getFailState(loginKey(username, ip)).count >= env.PRACTICE_CAPTCHA_AFTER_FAILS;
}

/* ------------------------------ 自研算术验证码（零依赖） ------------------------------ */

interface CaptchaEntry {
  /** 正确答案 */
  answer: number;
  /** 过期时间戳（毫秒） */
  expiresAt: number;
}

const captchaStore = new Map<string, CaptchaEntry>();
/** 验证码有效期（毫秒） */
const CAPTCHA_TTL_MS = 5 * 60 * 1000;

/** 下发一枚算术验证码（一次性，5 分钟有效）。 */
export function issueCaptcha(): { captchaId: string; question: string } {
  const a = Math.floor(Math.random() * 9) + 1; // 1..9
  const b = Math.floor(Math.random() * 9) + 1; // 1..9
  const plus = Math.random() < 0.5;
  const x = plus ? a : Math.max(a, b);
  const y = plus ? b : Math.min(a, b);
  const answer = plus ? x + y : x - y;
  const op = plus ? '+' : '-';
  const captchaId = crypto.randomBytes(12).toString('hex');
  captchaStore.set(captchaId, { answer, expiresAt: Date.now() + CAPTCHA_TTL_MS });
  return { captchaId, question: `${x} ${op} ${y} = ?` };
}

/** 校验验证码（一次性：校验后即作废）。 */
export function verifyCaptcha(captchaId: string, value: string): boolean {
  const entry = captchaStore.get(captchaId);
  if (!entry) return false;
  captchaStore.delete(captchaId);
  if (entry.expiresAt < Date.now()) return false;
  const n = Number.parseInt(String(value).trim(), 10);
  return !Number.isNaN(n) && n === entry.answer;
}

/**
 * 登录接口前置守卫：锁定校验 + 验证码校验。
 * 需在 `validate(loginSchema)` 之后使用（此时 `req.body` 已解析为带默认值的对象）。
 */
export function practiceLoginGuard(req: Request, _res: Response, next: NextFunction): void {
  const body = (req.body ?? {}) as { username?: string; captchaId?: string; captcha?: string };
  const username = String(body.username ?? '');
  const ip = clientIp(req);

  const remain = lockedRemainingMs(username, ip);
  if (remain > 0) {
    const minutes = Math.max(1, Math.ceil(remain / 60000));
    next(practiceLoginLocked(`登录失败次数过多，请 ${minutes} 分钟后再试`));
    return;
  }

  if (captchaRequired(username, ip)) {
    if (!body.captchaId || !body.captcha || !verifyCaptcha(body.captchaId, body.captcha)) {
      next(practiceCaptchaRequired('请输入验证码'));
      return;
    }
  }
  next();
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
