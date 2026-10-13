/**
 * 登录会话 / 设备 —— 业务逻辑层（v1.7③ T2）。
 *
 * 说明（兼容性）：升级前的存量 Token 不含 `jti`，`authRequired` 对「无 jti」的令牌按兼容放行，
 * 重新登录后即纳入会话管理。因此本模块只管理「带 jti 的新会话」。
 */
import * as repo from './sessions.repo.js';
import { env } from '../../config/env.js';
import { genId } from '../../utils/id.js';
import { fromDbDateSafe, nowDb, toDbDate } from '../../utils/datetime.js';
import type { SessionDto } from '../../types/domain.js';

/** 把 `12h` / `30m` / `7d` / 秒数 解析为毫秒（解析失败回退 12 小时）。 */
export function parseDurationMs(raw: string): number {
  const v = String(raw ?? '').trim();
  const m = /^(\d+)\s*([smhd])?$/i.exec(v);
  if (!m) return 12 * 60 * 60 * 1000;
  const n = Number(m[1]);
  const unit = (m[2] ?? 's').toLowerCase();
  const factor = unit === 'd' ? 86400000 : unit === 'h' ? 3600000 : unit === 'm' ? 60000 : 1000;
  return n * factor;
}

/** 会话有效期（毫秒），与 JWT 过期时间一致。 */
export function sessionTtlMs(): number {
  return parseDurationMs(env.JWT_EXPIRES_IN);
}

/** 创建会话，返回 jti。 */
export async function createSession(userId: string, ip: string, userAgent: string): Promise<string> {
  const id = genId('sess-');
  const now = new Date();
  await repo.insert({
    id,
    userId,
    ip: ip.slice(0, 64),
    userAgent,
    createdAt: toDbDate(now),
    expiresAt: toDbDate(new Date(now.getTime() + sessionTtlMs())),
  });
  return id;
}

/** 校验会话是否有效（未撤销 + 未过期）并返回最后活跃时间。 */
export async function checkSession(jti: string): Promise<{ valid: boolean; lastSeenAt: string }> {
  const row = await repo.findActive(jti);
  if (!row) return { valid: false, lastSeenAt: '' };
  const expires = fromDbDateSafe(row.expires_at);
  const valid = !!expires && new Date(expires).getTime() > Date.now();
  return { valid, lastSeenAt: fromDbDateSafe(row.last_seen_at) };
}

/** 刷新最后活跃时间（超过 5 分钟才写库，避免每请求一次写入）。 */
export async function touchSession(jti: string, lastSeenAt: string): Promise<void> {
  const last = new Date(lastSeenAt).getTime();
  if (!Number.isNaN(last) && Date.now() - last < 5 * 60 * 1000) return;
  await repo.touch(jti, nowDb());
}

/** 撤销单个会话。 */
export async function revokeSession(jti: string): Promise<number> {
  return repo.revoke(jti, nowDb());
}

/** 撤销某用户全部会话（可排除当前）。 */
export async function revokeAll(userId: string, exceptId?: string): Promise<number> {
  return repo.revokeAllByUser(userId, nowDb(), exceptId);
}

/** 我的登录设备列表。 */
export async function listMySessions(userId: string, currentJti: string): Promise<SessionDto[]> {
  const rows = await repo.listActiveByUser(userId, nowDb());
  return rows.map((r) => ({
    id: r.id,
    ip: r.ip,
    userAgent: r.user_agent,
    createdAt: fromDbDateSafe(r.created_at),
    lastSeenAt: fromDbDateSafe(r.last_seen_at),
    current: r.id === currentJti,
  }));
}

/** 校验某会话是否属于该用户（防越权下线他人设备）。 */
export async function sessionBelongsTo(jti: string, userId: string): Promise<boolean> {
  const row = await repo.findActive(jti);
  return !!row && row.user_id === userId;
}
