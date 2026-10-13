/**
 * 鉴权中间件：解析 `Authorization: Bearer <token>`，校验 JWT 并挂载 req.user。
 * JWT 载荷：{ sub: userId, role, departmentId, jti? }，HS256。
 *
 * v1.7③ T2 增补：
 * - `jti` = 登录会话 id；**带 jti 的令牌**会校验会话有效性（未撤销 + 未过期），
 *   从而支持「登录设备管理 / 强制下线」；**不带 jti 的旧令牌**按兼容放行（重新登录后即纳入管理）。
 * - `scope: '2fa'` 的挑战令牌**不可**作为访问令牌使用。
 */
import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { unauthorized } from '../utils/errors.js';
import { checkSession, touchSession } from '../modules/auth/sessions.service.js';
import type { AuthUser } from '../types/express.js';
import type { Role } from '../types/domain.js';

/** JWT 载荷结构（签发与校验共用）。 */
export interface JwtPayload {
  sub: string;
  role: Role;
  departmentId: string;
  /** 登录会话 id（v1.7③；旧令牌无此字段） */
  jti?: string;
  /** 令牌用途：'2fa' 表示两步验证挑战令牌（仅可用于 /auth/2fa/verify） */
  scope?: string;
}

/** 签发令牌（供 authService 调用）。 */
export function signToken(payload: JwtPayload): string {
  return jwt.sign(payload, env.JWT_SECRET, {
    algorithm: 'HS256',
    expiresIn: env.JWT_EXPIRES_IN,
  } as jwt.SignOptions);
}

/** 签发两步验证挑战令牌（5 分钟，scope=2fa，不能当作访问令牌）。 */
export function signChallengeToken(userId: string): string {
  return jwt.sign({ sub: userId, scope: '2fa' }, env.JWT_SECRET, {
    algorithm: 'HS256',
    expiresIn: '5m',
  } as jwt.SignOptions);
}

/** 校验挑战令牌，返回用户 id；非法/过期/用途不符返回 null。 */
export function verifyChallengeToken(token: string): string | null {
  try {
    const decoded = jwt.verify(token, env.JWT_SECRET, { algorithms: ['HS256'] });
    if (typeof decoded === 'string' || !decoded.sub) return null;
    if ((decoded as unknown as JwtPayload).scope !== '2fa') return null;
    return String(decoded.sub);
  } catch {
    return null;
  }
}

/**
 * 鉴权守卫：无 Token / Token 非法或过期 → 1002/401。
 * 成功时挂载 `req.user = { id, role, departmentId, sessionId }`。
 */
export async function authRequired(req: Request, _res: Response, next: NextFunction): Promise<void> {
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
  try {
    const decoded = jwt.verify(token, env.JWT_SECRET, { algorithms: ['HS256'] });
    if (typeof decoded === 'string' || !decoded.sub) {
      next(unauthorized());
      return;
    }
    const payload = decoded as unknown as JwtPayload;
    // 两步验证挑战令牌不可作为访问令牌
    if (payload.scope === '2fa') {
      next(unauthorized());
      return;
    }
    // 会话校验：带 jti 的令牌必须对应有效会话（支持强制下线）
    if (payload.jti) {
      const { valid, lastSeenAt } = await checkSession(payload.jti);
      if (!valid) {
        next(unauthorized('登录状态已失效，请重新登录'));
        return;
      }
      void touchSession(payload.jti, lastSeenAt).catch(() => {
        /* 活跃时间刷新失败不影响鉴权 */
      });
    }
    const user: AuthUser = {
      id: String(decoded.sub),
      role: payload.role,
      departmentId: payload.departmentId ?? '',
      sessionId: payload.jti ?? '',
    };
    req.user = user;
    next();
  } catch {
    next(unauthorized());
  }
}
