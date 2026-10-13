/**
 * 鉴权模块 —— 业务逻辑层。
 *
 * 登录链路（v1.7③ 加固后）：
 *   失败锁定检查 → 图形验证码（失败达阈值后强制）→ bcrypt 校验
 *   → 若已开启两步验证 → 返回挑战令牌（前端续走 /auth/2fa/verify）
 *   → 建会话（jti）→ 签发 JWT → 写登录日志。
 *
 * 安全约定：失败/停用统一 1002（账号或密码不正确），**不暴露账号是否存在**。
 */
import bcrypt from 'bcryptjs';
import * as repo from './auth.repo.js';
import * as attemptsRepo from './loginAttempts.repo.js';
import * as sessions from './sessions.service.js';
import * as loginLogs from '../loginLogs/loginLogs.service.js';
import * as auditService from '../audit/audit.service.js';
import { signToken, signChallengeToken, verifyChallengeToken } from '../../middleware/auth.js';
import { mapUserRow } from '../users/user.mapper.js';
import { AppError, ERROR_CODES, unauthorized, notFound, badRequest, captchaRequired } from '../../utils/errors.js';
import { toDbDate, fromDbDate, nowDb } from '../../utils/datetime.js';
import { verifyCaptcha } from '../../utils/captcha.js';
import { generateTotpSecret, verifyTotp, otpauthUrl } from '../../utils/totp.js';
import { assertPasswordPolicy, describePolicy, isPasswordExpired } from '../../utils/passwordPolicy.js';
import { getSettings, getSettings as loadSettings } from '../settings/settings.service.js';
import type { LoginOutcome, LoginResult, SessionDto, UserDto } from '../../types/domain.js';
import type { LoginUserRow } from './auth.repo.js';

/** 登录上下文（IP / UA / 图形验证码）。 */
export interface LoginContext {
  ip: string;
  userAgent: string;
  captchaId?: string;
  captcha?: string;
}

/**
 * 校验内网账号凭证（**只读** `users` 表，仅列级最小集），登录与练题登录共用。
 *
 * 统一失败文案「账号或密码不正确」，**不暴露账号是否存在**（用户名枚举防护）；
 * 停用账号同样按失败处理。校验通过返回最小用户行（含 password_hash，仅供内部签发令牌使用）。
 * 本函数**绝不**修改 `users` 任何字段。
 */
export async function verifyCredentials(username: string, password: string): Promise<LoginUserRow> {
  const name = username.trim();
  const row = await repo.findForLogin(name);
  if (!row) {
    throw unauthorized('账号或密码不正确');
  }
  const matched = await bcrypt.compare(password, row.password_hash);
  if (!matched) {
    throw unauthorized('账号或密码不正确');
  }
  if (row.status === 'disabled') {
    throw unauthorized('账号或密码不正确');
  }
  return row;
}

/** 判断是否为「凭证错误」（unauthorized 1002），仅此类错误计入失败锁定。 */
function isCredentialError(err: unknown): boolean {
  return err instanceof AppError && err.code === ERROR_CODES.UNAUTHORIZED;
}

/** 当前账号的连续失败次数。 */
async function failCountOf(username: string): Promise<number> {
  const attempt = await attemptsRepo.findByUsername(username);
  return attempt ? Number(attempt.fail_count ?? 0) : 0;
}

/**
 * 登录：失败锁定（可配开关）→ 图形验证码（失败达阈值后）→ 校验凭证 → 签发令牌。
 */
export async function login(username: string, password: string, ctx: LoginContext): Promise<LoginOutcome> {
  const name = username.trim();
  const settings = await getSettings();

  // 失败锁定检查（开关关闭则跳过）
  if (settings.loginLockEnabled) {
    const attempt = await attemptsRepo.findByUsername(name);
    const until = attempt?.locked_until ? fromDbDate(attempt.locked_until) : null;
    if (until && new Date(until).getTime() > Date.now()) {
      const remainMin = Math.max(1, Math.ceil((new Date(until).getTime() - Date.now()) / 60000));
      const message = `账号已锁定，请 ${remainMin} 分钟后再试`;
      await loginLogs.record({
        username: name,
        ip: ctx.ip,
        userAgent: ctx.userAgent,
        success: false,
        reason: 'locked',
      });
      throw unauthorized(message);
    }
  }

  // 图形验证码：同一账号连续失败达到阈值后强制（v1.7③ T1）
  const fails = await failCountOf(name);
  if (settings.loginCaptchaAfterFails > 0 && fails >= settings.loginCaptchaAfterFails) {
    const okCaptcha =
      !!ctx.captchaId && !!ctx.captcha && verifyCaptcha(ctx.captchaId, ctx.captcha);
    if (!okCaptcha) {
      const message = '请输入图形验证码';
      await loginLogs.record({
        username: name,
        ip: ctx.ip,
        userAgent: ctx.userAgent,
        success: false,
        reason: 'captcha',
      });
      throw captchaRequired(message);
    }
  }

  try {
    const row = await verifyCredentials(name, password);
    await attemptsRepo.clear(name); // 登录成功清零失败计数
    const full = await repo.findById(row.id);
    if (!full) {
      throw unauthorized('账号或密码不正确');
    }

    // 两步验证：返回挑战令牌，由 /auth/2fa/verify 完成登录
    const authRow = await repo.findAuthById(row.id);
    if (settings.twoFactorAvailable && authRow?.two_factor_enabled === 1 && authRow.two_factor_secret) {
      await loginLogs.record({
        username: full.username,
        userId: full.id,
        role: full.role,
        ip: ctx.ip,
        userAgent: ctx.userAgent,
        success: true,
        reason: 'awaiting_2fa',
      });
      return { twoFactorRequired: true, challengeToken: signChallengeToken(full.id) };
    }

    const passwordExpired = isPasswordExpired(authRow?.password_changed_at ?? null, settings.passwordExpireDays);
    const { token, user } = await issueSession(full.id, ctx);
    await loginLogs.record({
      username: user.username,
      userId: user.id,
      role: user.role,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      success: true,
    });
    return { token, user, passwordExpired };
  } catch (err) {
    // 仅凭证错误参与失败锁定；达到阈值 → 上锁并提示
    if (isCredentialError(err)) {
      await loginLogs.record({
        username: name,
        ip: ctx.ip,
        userAgent: ctx.userAgent,
        success: false,
        reason: 'credentials',
      });
      if (settings.loginLockEnabled) {
        await attemptsRepo.recordFailure(name, nowDb());
        const after = await attemptsRepo.findByUsername(name);
        if (after && after.fail_count >= settings.loginMaxFails) {
          const until = toDbDate(new Date(Date.now() + settings.loginLockMinutes * 60 * 1000));
          await attemptsRepo.lock(name, until, nowDb());
          throw unauthorized(
            `连续失败 ${settings.loginMaxFails} 次，账号已锁定 ${settings.loginLockMinutes} 分钟`,
          );
        }
      }
    }
    throw err;
  }
}

/** 建立会话并签发访问令牌（登录成功 / 两步验证通过共用）。 */
async function issueSession(
  userId: string,
  ctx: LoginContext,
): Promise<{ token: string; user: UserDto }> {
  const full = await repo.findById(userId);
  if (!full) throw unauthorized('账号或密码不正确');
  const jti = await sessions.createSession(userId, ctx.ip, ctx.userAgent);
  const token = signToken({
    sub: full.id,
    role: full.role,
    departmentId: full.department_id ?? '',
    jti,
  });
  return { token, user: mapUserRow(full) };
}

/** 校验两步验证码完成登录（挑战令牌 5 分钟有效）。 */
export async function verifyTwoFactor(
  challengeToken: string,
  code: string,
  ctx: LoginContext,
): Promise<LoginResult> {
  const userId = verifyChallengeToken(challengeToken);
  if (!userId) throw unauthorized('登录会话已过期，请重新登录');
  const authRow = await repo.findAuthById(userId);
  if (!authRow || authRow.two_factor_enabled !== 1 || !authRow.two_factor_secret) {
    throw badRequest('该账号未开启两步验证');
  }
  if (!verifyTotp(authRow.two_factor_secret, code)) {
    await loginLogs.record({
      username: authRow.username,
      userId,
      role: authRow.role,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      success: false,
      reason: 'two_factor',
    });
    throw unauthorized('两步验证码不正确或已失效');
  }
  const settings = await getSettings();
  const passwordExpired = isPasswordExpired(authRow.password_changed_at, settings.passwordExpireDays);
  const { token, user } = await issueSession(userId, ctx);
  await loginLogs.record({
    username: user.username,
    userId: user.id,
    role: user.role,
    ip: ctx.ip,
    userAgent: ctx.userAgent,
    success: true,
    reason: 'two_factor',
  });
  return { token, user, passwordExpired };
}

/** 获取当前用户信息。 */
export async function me(userId: string): Promise<UserDto> {
  const row = await repo.findById(userId);
  if (!row) throw notFound('用户不存在或已被删除');
  return mapUserRow(row);
}

/** 修改本人密码：满足密码策略 + 校验旧密码。 */
export async function changePassword(
  userId: string,
  oldPassword: string,
  newPassword: string,
): Promise<void> {
  const settings = await getSettings();
  assertPasswordPolicy(newPassword, settings);
  const row = await repo.findById(userId);
  if (!row) throw notFound('用户不存在或已被删除');
  const matched = await bcrypt.compare(oldPassword, row.password_hash);
  if (!matched) {
    throw badRequest('旧密码不正确');
  }
  await repo.updatePasswordHash(userId, await bcrypt.hash(newPassword, 10));
  await auditService.record({
    actorId: userId,
    action: 'user.change_password',
    targetType: 'user',
    targetId: userId,
    targetName: row.name,
    detail: { username: row.username },
  });
}

/* ============================== 两步验证（TOTP） ============================== */

/** 生成 / 重置 2FA 密钥（未启用；需再调 enable 并验证一次验证码）。 */
export async function setupTwoFactor(
  userId: string,
): Promise<{ secret: string; otpauthUrl: string }> {
  const settings = await getSettings();
  if (!settings.twoFactorAvailable) {
    throw badRequest('管理员已关闭两步验证功能');
  }
  const row = await repo.findById(userId);
  if (!row) throw notFound('用户不存在或已被删除');
  const secret = generateTotpSecret();
  await repo.setTwoFactorSecret(userId, secret);
  return {
    secret,
    otpauthUrl: otpauthUrl(secret, row.username, settings.systemShortName || '在线考试系统'),
  };
}

/** 验证一次验证码后正式启用 2FA。 */
export async function enableTwoFactor(userId: string, code: string): Promise<void> {
  const row = await repo.findAuthById(userId);
  if (!row) throw notFound('用户不存在或已被删除');
  if (!row.two_factor_secret) throw badRequest('请先生成两步验证密钥');
  if (!verifyTotp(row.two_factor_secret, code)) throw badRequest('验证码不正确，请重新输入');
  await repo.setTwoFactorEnabled(userId, true);
  await auditService.record({
    actorId: userId,
    action: 'user.two_factor_enable',
    targetType: 'user',
    targetId: userId,
    targetName: row.name,
    detail: { username: row.username },
  });
}

/** 关闭 2FA（需校验登录密码 + 当前验证码）。 */
export async function disableTwoFactor(userId: string, password: string, code: string): Promise<void> {
  const row = await repo.findAuthById(userId);
  if (!row) throw notFound('用户不存在或已被删除');
  if (row.two_factor_enabled !== 1) throw badRequest('当前账号未开启两步验证');
  const matched = await bcrypt.compare(password, row.password_hash);
  if (!matched) throw badRequest('登录密码不正确');
  if (!row.two_factor_secret || !verifyTotp(row.two_factor_secret, code)) {
    throw badRequest('验证码不正确，请重新输入');
  }
  await repo.setTwoFactorEnabled(userId, false);
  await auditService.record({
    actorId: userId,
    action: 'user.two_factor_disable',
    targetType: 'user',
    targetId: userId,
    targetName: row.name,
    detail: { username: row.username },
  });
}

/** 当前账号的密码策略描述（个人安全页展示）。 */
export async function passwordPolicyText(): Promise<{ text: string; expireDays: number }> {
  const settings = await loadSettings();
  return { text: describePolicy(settings), expireDays: settings.passwordExpireDays };
}

/* ============================== 登录设备管理 ============================== */

/** 我的登录设备列表。 */
export async function listSessions(userId: string, currentJti: string): Promise<SessionDto[]> {
  return sessions.listMySessions(userId, currentJti);
}

/** 下线指定设备（仅能下线自己的会话）。 */
export async function revokeSession(userId: string, sessionId: string): Promise<void> {
  const own = await sessions.sessionBelongsTo(sessionId, userId);
  if (!own) throw notFound('该登录设备不存在或已下线');
  await sessions.revokeSession(sessionId);
}

/** 下线除当前设备外的全部设备。 */
export async function revokeOtherSessions(userId: string, currentJti: string): Promise<number> {
  if (!currentJti) {
    throw badRequest('当前会话不支持该操作，请重新登录后再试');
  }
  return sessions.revokeAll(userId, currentJti);
}

/** 登出：撤销当前会话。 */
export async function logout(userId: string, jti: string): Promise<void> {
  if (!jti) return;
  const own = await sessions.sessionBelongsTo(jti, userId);
  if (own) await sessions.revokeSession(jti);
}
