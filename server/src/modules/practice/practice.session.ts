/**
 * 练题练习会话 —— 无状态签名（零新表）。
 *
 * `sessionToken` 载荷 `{ sub:userId, bankId, qids, mode }`，用独立密钥 `PRACTICE_SESSION_SECRET`
 * 以 HS256 签发，TTL = `PRACTICE_SESSION_TTL`（秒）。会话**不落库**；
 * `check` 时必须验签、`sub` 与练题登录态一致、`questionId ∈ qids`、未过期，
 * 以杜绝遍历 `questionId` 暴力取答案。
 */
import jwt from 'jsonwebtoken';
import { env } from '../../config/env.js';

/** 会话载荷。 */
export interface PracticeSessionPayload {
  /** 用户 id（内网 users.id），须与练题登录态一致 */
  sub: string;
  /** 归属题库 id；错题本跨库复习时为空串 */
  bankId: string;
  /** 会话内题目 id 列表 */
  qids: string[];
  /** 练题方式 */
  mode: 'sequence' | 'random';
}

/** 签发练习会话令牌。 */
export function signSessionToken(payload: PracticeSessionPayload): string {
  return jwt.sign(payload, env.PRACTICE_SESSION_SECRET, {
    algorithm: 'HS256',
    expiresIn: env.PRACTICE_SESSION_TTL,
  } as jwt.SignOptions);
}

/** 校验并解析练习会话令牌（失败返回 null）。 */
export function verifySessionToken(token: string): PracticeSessionPayload | null {
  try {
    const decoded = jwt.verify(token, env.PRACTICE_SESSION_SECRET, { algorithms: ['HS256'] });
    if (typeof decoded === 'string') return null;
    const p = decoded as unknown as PracticeSessionPayload;
    if (!p.sub || typeof p.bankId !== 'string' || !Array.isArray(p.qids)) return null;
    return p;
  } catch {
    return null;
  }
}
