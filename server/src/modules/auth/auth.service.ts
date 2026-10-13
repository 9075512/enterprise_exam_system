/**
 * 鉴权模块 —— 业务逻辑层。
 * 登录：查用户 → bcrypt 校验 → 签发 JWT；失败/停用统一 1002（账号或密码不正确）。
 */
import bcrypt from 'bcryptjs';
import * as repo from './auth.repo.js';
import * as attemptsRepo from './loginAttempts.repo.js';
import { signToken } from '../../middleware/auth.js';
import { mapUserRow } from '../users/user.mapper.js';
import { AppError, ERROR_CODES, unauthorized, notFound, badRequest } from '../../utils/errors.js';
import { toDbDate, fromDbDate, nowDb } from '../../utils/datetime.js';
import { getSettings } from '../settings/settings.service.js';
import type { LoginResult, UserDto } from '../../types/domain.js';
import type { LoginUserRow } from './auth.repo.js';

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

/** 判断是否为「凭证错误」（unauthorized 1002），仅此类错误计入失败锁定，其余异常直接上抛。 */
function isCredentialError(err: unknown): boolean {
  return err instanceof AppError && err.code === ERROR_CODES.UNAUTHORIZED;
}

/** 登录：失败锁定（可配开关）→ 校验凭证 → 签发令牌。 */
export async function login(username: string, password: string): Promise<LoginResult> {
  const name = username.trim();
  const settings = await getSettings();

  // 失败锁定检查（开关关闭则跳过）
  if (settings.loginLockEnabled) {
    const attempt = await attemptsRepo.findByUsername(name);
    const until = attempt?.locked_until ? fromDbDate(attempt.locked_until) : null;
    if (until && new Date(until).getTime() > Date.now()) {
      const remainMin = Math.max(1, Math.ceil((new Date(until).getTime() - Date.now()) / 60000));
      throw unauthorized(`账号已锁定，请 ${remainMin} 分钟后再试`);
    }
  }

  try {
    const row = await verifyCredentials(name, password);
    await attemptsRepo.clear(name); // 登录成功清零失败计数
    const full = await repo.findById(row.id);
    if (!full) {
      throw unauthorized('账号或密码不正确');
    }
    const token = signToken({ sub: full.id, role: full.role, departmentId: full.department_id ?? '' });
    return { token, user: mapUserRow(full) };
  } catch (err) {
    // 仅凭证错误参与失败锁定；达到阈值 → 上锁并提示
    if (settings.loginLockEnabled && isCredentialError(err)) {
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
    throw err;
  }
}

/** 获取当前用户信息。 */
export async function me(userId: string): Promise<UserDto> {
  const row = await repo.findById(userId);
  if (!row) throw notFound('用户不存在或已被删除');
  return mapUserRow(row);
}

/** 修改本人密码（校验旧密码、新密码 ≥ settings.minPasswordLength）。 */
export async function changePassword(
  userId: string,
  oldPassword: string,
  newPassword: string,
): Promise<void> {
  const settings = await getSettings();
  if (newPassword.length < settings.minPasswordLength) {
    throw badRequest(`新密码长度不能少于 ${settings.minPasswordLength} 位`);
  }
  const row = await repo.findById(userId);
  if (!row) throw notFound('用户不存在或已被删除');
  const matched = await bcrypt.compare(oldPassword, row.password_hash);
  if (!matched) {
    throw badRequest('旧密码不正确');
  }
  const hash = await bcrypt.hash(newPassword, 10);
  await repo.updatePasswordHash(userId, hash);
}
