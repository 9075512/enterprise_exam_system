/**
 * 鉴权中间件：解析 `Authorization: Bearer <token>`，校验 JWT 并挂载 req.user。
 * JWT 载荷：{ sub: userId, role, departmentId }，HS256。
 */
import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { unauthorized } from '../utils/errors.js';
import type { AuthUser } from '../types/express.js';
import type { Role } from '../types/domain.js';

/** JWT 载荷结构（签发与校验共用）。 */
export interface JwtPayload {
  sub: string;
  role: Role;
  departmentId: string;
}

/** 签发令牌（供 authService 调用）。 */
export function signToken(payload: JwtPayload): string {
  return jwt.sign(payload, env.JWT_SECRET, {
    algorithm: 'HS256',
    expiresIn: env.JWT_EXPIRES_IN,
  } as jwt.SignOptions);
}

/**
 * 鉴权守卫：无 Token / Token 非法或过期 → 1002/401。
 * 成功时挂载 `req.user = { id, role, departmentId }`。
 */
export function authRequired(req: Request, _res: Response, next: NextFunction): void {
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
    const user: AuthUser = {
      id: String(decoded.sub),
      role: (decoded as unknown as JwtPayload).role,
      departmentId: (decoded as unknown as JwtPayload).departmentId ?? '',
    };
    req.user = user;
    next();
  } catch {
    next(unauthorized());
  }
}
