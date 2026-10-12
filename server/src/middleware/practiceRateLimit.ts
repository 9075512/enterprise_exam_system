/**
 * 练题限流中间件（IP + 设备指纹维度的固定窗口计数）——零依赖、进程内存储。
 *
 * 键 = `sha1(IP + '|' + X-Device-Fp)`（架构共享约定 §10-15）；按分组（登录 / 题库 / 判分）设不同阈值。
 * 单机（≥100 并发）足够；方案乙单实例场景足够。多实例时替换为 redis（接口不变）。
 *
 * 阈值来自 env（`PRACTICE_RATE_*_PER_MIN`）；设为 ≤0 表示关闭该分组限流。
 */
import crypto from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { env } from '../config/env.js';
import { practiceRateLimited } from '../utils/errors.js';
import { clientIp } from './practiceLoginGuard.js';

/** 限流分组。 */
export type PracticeRateGroup =
  | 'login'
  | 'banks'
  | 'check'
  | 'session'
  | 'progress'
  | 'wrongbook'
  | 'favorites'
  | 'report'
  | 'daily';

/** 固定窗口长度（毫秒）。 */
export const PRACTICE_RATE_WINDOW_MS = 60 * 1000;

/** 各分组每分钟上限。 */
function limitOf(group: PracticeRateGroup): number {
  switch (group) {
    case 'login':
      return env.PRACTICE_RATE_LOGIN_PER_MIN;
    case 'check':
      return env.PRACTICE_RATE_CHECK_PER_MIN;
    case 'session':
      return env.PRACTICE_RATE_SESSION_PER_MIN;
    case 'progress':
      return env.PRACTICE_RATE_PROGRESS_PER_MIN;
    case 'wrongbook':
      return env.PRACTICE_RATE_WRONGBOOK_PER_MIN;
    case 'favorites':
      return env.PRACTICE_RATE_FAVORITES_PER_MIN;
    case 'report':
      return env.PRACTICE_RATE_REPORT_PER_MIN;
    case 'daily':
      return env.PRACTICE_RATE_DAILY_PER_MIN;
    case 'banks':
    default:
      return env.PRACTICE_RATE_BANKS_PER_MIN;
  }
}

interface Window {
  /** 窗口起始时间戳（毫秒） */
  start: number;
  /** 窗口内计数 */
  count: number;
}

const windows = new Map<string, Window>();

/** 组装限流键（分组 + IP + 设备指纹）。 */
function buildKey(req: Request, group: PracticeRateGroup): string {
  const fp = String(req.headers['x-device-fp'] ?? '');
  const raw = `${group}:${clientIp(req)}|${fp}`;
  return crypto.createHash('sha1').update(raw).digest('hex');
}

/** 惰性清理过期窗口（仅在 map 较大时触发，避免每次遍历）。 */
function prune(now: number): void {
  if (windows.size < 5000) return;
  for (const [key, win] of windows) {
    if (now - win.start >= PRACTICE_RATE_WINDOW_MS) windows.delete(key);
  }
}

/** 生成某分组的限流中间件。 */
export function practiceRateLimit(group: PracticeRateGroup) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const limit = limitOf(group);
    if (limit <= 0) {
      next();
      return;
    }
    const key = buildKey(req, group);
    const now = Date.now();
    const win = windows.get(key);
    if (!win || now - win.start >= PRACTICE_RATE_WINDOW_MS) {
      windows.set(key, { start: now, count: 1 });
      prune(now);
      next();
      return;
    }
    if (win.count >= limit) {
      next(practiceRateLimited());
      return;
    }
    win.count += 1;
    next();
  };
}
