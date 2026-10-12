/**
 * 用户模块 —— 业务逻辑层。
 * 规则（对齐 v1.0 userService）：账号/姓名必填；考生必须归属科室；
 * 账号唯一；删除时「有考试记录」「不允许删除自己」均返回 1005。
 */
import bcrypt from 'bcryptjs';
import * as repo from './users.repo.js';
import { mapUserRow } from './user.mapper.js';
import { badRequest, conflict, notFound } from '../../utils/errors.js';
import { genId } from '../../utils/id.js';
import { nowDb } from '../../utils/datetime.js';
import { getSettings } from '../settings/settings.service.js';
import type { Role, UserDto, UserStatus } from '../../types/domain.js';

const BCRYPT_COST = 10;

/**
 * 校验显式传入的密码长度（不足 settings.minPasswordLength → 1001 中文文案）。
 * 密码为空视为「未传」，由调用方回退到默认密码。
 */
function assertPasswordLength(password: string, minLength: number): void {
  if (password.length < minLength) {
    throw badRequest(`密码长度不能少于 ${minLength} 位`);
  }
}

/** 空字符串科室视为无科室（null）。 */
function normalizeDepartmentId(departmentId: string | undefined): string | null {
  const v = (departmentId ?? '').trim();
  return v === '' ? null : v;
}

/** 列表（可按角色 / 关键字过滤）。 */
export async function list(filter: { role?: Role; keyword?: string }): Promise<UserDto[]> {
  const rows = await repo.list(filter);
  return rows.map(mapUserRow);
}

/** 新建用户。 */
export async function create(input: {
  username: string;
  name: string;
  role: Role;
  departmentId?: string;
  status?: UserStatus;
  password?: string;
}): Promise<UserDto> {
  const username = input.username.trim();
  const name = input.name.trim();
  if (!username) throw badRequest('登录账号不能为空');
  if (!name) throw badRequest('姓名不能为空');

  const departmentId = normalizeDepartmentId(input.departmentId);
  if (input.role === 'examinee' && !departmentId) {
    throw badRequest('考生必须归属一个科室');
  }

  const existing = await repo.findByUsername(username);
  if (existing) {
    throw conflict(`登录账号 "${username}" 已存在`);
  }

  const id = genId('user-');
  const settings = await getSettings();
  const providedPassword = input.password && input.password !== '' ? input.password : '';
  if (providedPassword) {
    assertPasswordLength(providedPassword, settings.minPasswordLength);
  }
  const passwordHash = await bcrypt.hash(providedPassword || settings.defaultPassword, BCRYPT_COST);
  await repo.insert({
    id,
    username,
    passwordHash,
    name,
    role: input.role,
    departmentId,
    status: input.status ?? 'active',
    createdAt: nowDb(),
  });
  const created = await repo.findById(id);
  return mapUserRow(created!);
}

/** 编辑用户（可改密码/状态）。 */
export async function update(
  id: string,
  input: {
    username: string;
    name: string;
    role: Role;
    departmentId?: string;
    status?: UserStatus;
    password?: string;
  },
): Promise<UserDto> {
  const username = input.username.trim();
  const name = input.name.trim();
  if (!username) throw badRequest('登录账号不能为空');
  if (!name) throw badRequest('姓名不能为空');

  const current = await repo.findById(id);
  if (!current) throw notFound('用户不存在或已被删除');

  const departmentId = normalizeDepartmentId(input.departmentId);
  if (input.role === 'examinee' && !departmentId) {
    throw badRequest('考生必须归属一个科室');
  }

  const duplicate = await repo.findByUsername(username);
  if (duplicate && duplicate.id !== id) {
    throw conflict(`登录账号 "${username}" 已存在`);
  }

  await repo.update(id, {
    username,
    name,
    role: input.role,
    departmentId,
    status: input.status ?? current.status,
  });
  if (input.password && input.password !== '') {
    const settings = await getSettings();
    assertPasswordLength(input.password, settings.minPasswordLength);
    await repo.updatePasswordHash(id, await bcrypt.hash(input.password, BCRYPT_COST));
  }
  const updated = await repo.findById(id);
  return mapUserRow(updated!);
}

/** 删除用户（有考试记录 → 1005；不允许删除自己 → 1005）。 */
export async function remove(id: string, operatorId: string): Promise<void> {
  const current = await repo.findById(id);
  if (!current) throw notFound('用户不存在或已被删除');
  if (id === operatorId) {
    throw conflict('不能删除当前登录的账号');
  }
  if (await repo.hasExamRecords(id)) {
    throw conflict('该用户存在考试记录，无法删除，可改为停用账号');
  }
  await repo.remove(id);
}

/** 重置密码为默认密码。 */
export async function resetPassword(id: string): Promise<void> {
  const current = await repo.findById(id);
  if (!current) throw notFound('用户不存在或已被删除');
  const settings = await getSettings();
  await repo.updatePasswordHash(id, await bcrypt.hash(settings.defaultPassword, BCRYPT_COST));
}
