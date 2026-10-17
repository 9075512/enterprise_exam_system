/**
 * 练题鉴权守卫（兼容练题专属 JWT 与主系统 JWT）。
 *
 * - 独立练题端继续使用 `PRACTICE_JWT_SECRET`；
 * - 合并后的考试端可直接使用内网 JWT，无需二次登录；
 * - 校验通过挂载 `req.practiceUser = { id, role }`；
 * - 失败统一 1002/401。
 *
 * 练题登录态**仅解锁练题能力**，不得复用为内网后台凭证。
 */
import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { unauthorized } from '../utils/errors.js';
import { resolveUser } from './auth.js';
import { findUserStatusById } from '../modules/practice/practice.repo.js';
import type { PracticeAuthUser } from '../types/express.js';
import type { Role } from '../types/domain.js';

/** 练题 JWT 载荷结构（签发与校验共用）。 */
export interface PracticeJwtPayload {
  /** 用户 id（内网 users.id） */
  sub: string;
  /** 角色 */
  role: Role;
}

/** 签发练题登录令牌（HS256，独立 secret）。 */
export function signPracticeToken(payload: PracticeJwtPayload): string {
  return jwt.sign(payload, env.PRACTICE_JWT_SECRET, {
    algorithm: 'HS256',
    expiresIn: env.PRACTICE_JWT_EXPIRES_IN,
  } as jwt.SignOptions);
}

/**
 * 练题鉴权守卫：无 Token / Token 非法或过期 → 1002/401。
 * 成功时挂载 `req.practiceUser = { id, role }`。
 *
 * 注：验签通过后**追加一次轻量只读校验**（`SELECT status FROM users WHERE id = ?`），
 * 使内网停用/删除账号后其已签发的练题 token **即时失效**（返回 401/1002）。
 * 仅读 `users`，绝不写；账号不存在或 `status !== 'active'` 一律视为未认证。
 */
export async function practiceAuthRequired(req: Request, _res: Response, next: NextFunction): Promise<void> {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    next(unauthorized());
    return;
  }
  const token = header.slice('Bearer '.length).trim();
  if (!token) {
    next(unauthorized());
    return;
  }

  let user: PracticeAuthUser;
  try {
    const decoded = jwt.verify(token, env.PRACTICE_JWT_SECRET, { algorithms: ['HS256'] });
    if (typeof decoded === 'string' || !decoded.sub) {
      next(unauthorized());
      return;
    }
    user = { id: String(decoded.sub), role: (decoded as unknown as PracticeJwtPayload).role };
  } catch {
    // 合并到考试端后，主系统登录态也可直接访问练题接口；主系统令牌仍由
    // auth.resolveUser 完整校验（含 2FA scope 与登录会话撤销状态）。
    const resolved = await resolveUser(req);
    if (!resolved.ok) {
      next(unauthorized(resolved.message));
      return;
    }
    user = { id: resolved.user.id, role: resolved.user.role };
  }

  // 即时停用校验（只读 users）
  try {
    const status = await findUserStatusById(user.id);
    if (status !== 'active') {
      next(unauthorized());
      return;
    }
  } catch (err) {
    next(err);
    return;
  }

  req.practiceUser = user;
  next();
}
