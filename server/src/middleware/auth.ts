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

/** 令牌解析结果：成功返回用户，失败返回可选的提示文案。 */
type ResolveResult = { ok: true; user: AuthUser } | { ok: false; message?: string };

/** 解析 `Authorization: Bearer` 为当前用户（不含响应逻辑，供强弱两档中间件复用）。 */
async function resolveUser(req: Request): Promise<ResolveResult> {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) return { ok: false };
  const token = header.slice('Bearer '.length).trim();
  if (!token) return { ok: false };
  try {
    const decoded = jwt.verify(token, env.JWT_SECRET, { algorithms: ['HS256'] });
    if (typeof decoded === 'string' || !decoded.sub) return { ok: false };
    const payload = decoded as unknown as JwtPayload;
    // 两步验证挑战令牌不可作为访问令牌
    if (payload.scope === '2fa') return { ok: false };
    // 会话校验：带 jti 的令牌必须对应有效会话（支持强制下线）
    if (payload.jti) {
      const { valid, lastSeenAt } = await checkSession(payload.jti);
      if (!valid) return { ok: false, message: '登录状态已失效，请重新登录' };
      void touchSession(payload.jti, lastSeenAt).catch(() => {
        /* 活跃时间刷新失败不影响鉴权 */
      });
    }
    return {
      ok: true,
      user: {
        id: String(decoded.sub),
        role: payload.role,
        departmentId: payload.departmentId ?? '',
        sessionId: payload.jti ?? '',
      },
    };
  } catch {
    return { ok: false };
  }
}

/**
 * 鉴权守卫：无 Token / Token 非法或过期 → 1002/401。
 * 成功时挂载 `req.user = { id, role, departmentId, sessionId }`。
 */
export async function authRequired(req: Request, _res: Response, next: NextFunction): Promise<void> {
  const result = await resolveUser(req);
  if (!result.ok) {
    next(unauthorized(result.message));
    return;
  }
  req.user = result.user;
  next();
}

/**
 * 可选鉴权（v1.8④ U4）：有合法 Bearer 则挂载 `req.user`；无/非法则**静默放行**（保持 undefined）。
 *
 * 用途：附件读取接口既要支持程序化访问（带 Bearer，校验归属/角色），
 * 又要支持浏览器 `<img src>`（**无法带 header**，改由签名 URL 通道鉴权）。
 */
export async function authOptional(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await resolveUser(req);
    if (result.ok) req.user = result.user;
  } catch {
    /* 可选鉴权失败不影响后续流程 */
  }
  next();
}
