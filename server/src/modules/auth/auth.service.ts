/**
 * 鉴权模块 —— 业务逻辑层。
 * 登录：查用户 → bcrypt 校验 → 签发 JWT；失败/停用统一 1002（账号或密码不正确）。
 */
import bcrypt from 'bcryptjs';
import * as repo from './auth.repo.js';
import { signToken } from '../../middleware/auth.js';
import { mapUserRow } from '../users/user.mapper.js';
import { unauthorized, notFound, badRequest } from '../../utils/errors.js';
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

/** 登录：校验账号密码并签发令牌（校验通过后再取完整档案）。 */
export async function login(username: string, password: string): Promise<LoginResult> {
  const row = await verifyCredentials(username, password);
  const full = await repo.findById(row.id);
  if (!full) {
    throw unauthorized('账号或密码不正确');
  }
  const token = signToken({ sub: full.id, role: full.role, departmentId: full.department_id ?? '' });
  return { token, user: mapUserRow(full) };
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
