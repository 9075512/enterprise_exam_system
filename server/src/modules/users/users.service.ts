/**
 * 用户模块 —— 业务逻辑层。
 * 规则（对齐 v1.0 userService）：账号/姓名必填；考生必须归属科室；
 * 账号唯一；删除时「有考试记录」「不允许删除自己」均返回 1005。
 */
import bcrypt from 'bcryptjs';
import * as repo from './users.repo.js';
import { mapUserRow } from './user.mapper.js';
import { badRequest, conflict, notFound } from '../../utils/errors.js';
import { assertPasswordPolicy } from '../../utils/passwordPolicy.js';
import { genId } from '../../utils/id.js';
import { nowDb } from '../../utils/datetime.js';
import { getSettings } from '../settings/settings.service.js';
import * as auditService from '../audit/audit.service.js';
import * as sessions from '../auth/sessions.service.js';
import * as authService from '../auth/auth.service.js';
import type { Role, SessionDto, UserDto, UserStatus } from '../../types/domain.js';

const BCRYPT_COST = 10;

/**
 * 校验显式传入的密码（长度 + 复杂度，统一由密码策略裁决；v1.7③ T2）。
 * 密码为空视为「未传」，由调用方回退到默认密码。
 */
function assertPassword(password: string, settings: Awaited<ReturnType<typeof getSettings>>): void {
  assertPasswordPolicy(password, settings);
}

/** 空字符串科室视为无科室（null）。 */
function normalizeDepartmentId(departmentId: string | undefined): string | null {
  const v = (departmentId ?? '').trim();
  return v === '' ? null : v;
}

/** 空字符串邮箱视为无邮箱（null）。 */
function normalizeEmail(email: string | undefined): string | null {
  const v = (email ?? '').trim();
  return v === '' ? null : v;
}

/** 列表（可按角色 / 关键字过滤）。 */
export async function list(filter: { role?: Role; keyword?: string }): Promise<UserDto[]> {
  const rows = await repo.list(filter);
  return rows.map(mapUserRow);
}

/** 新建用户。 */
export async function create(
  input: {
    username: string;
    name: string;
    role: Role;
    departmentId?: string;
    positionId?: string;
    groupIds?: string[];
    email?: string;
    status?: UserStatus;
    password?: string;
  },
  operatorId: string,
): Promise<UserDto> {
  const username = input.username.trim();
  const name = input.name.trim();
  if (!username) throw badRequest('登录账号不能为空');
  if (!name) throw badRequest('姓名不能为空');

  const departmentId = normalizeDepartmentId(input.departmentId);
  if (input.role === 'examinee' && !departmentId) {
    throw badRequest('考生必须归属一个科室');
  }
  const email = normalizeEmail(input.email);
  const positionId = normalizeDepartmentId(input.positionId);

  const existing = await repo.findByUsername(username);
  if (existing) {
    throw conflict(`登录账号 "${username}" 已存在`);
  }

  const id = genId('user-');
  const settings = await getSettings();
  const providedPassword = input.password && input.password !== '' ? input.password : '';
  if (providedPassword) {
    assertPassword(providedPassword, settings);
  }
  const passwordHash = await bcrypt.hash(providedPassword || settings.defaultPassword, BCRYPT_COST);
  await repo.insert({
    id,
    username,
    passwordHash,
    name,
    role: input.role,
    departmentId,
    positionId,
    email,
    status: input.status ?? 'active',
    createdAt: nowDb(),
  });
  await repo.setGroups(id, input.groupIds ?? []);
  const created = await repo.findById(id);
  const dto = mapUserRow(created!);
  await auditService.record({
    actorId: operatorId,
    action: 'user.create',
    targetType: 'user',
    targetId: id,
    targetName: dto.name,
    detail: { username: dto.username, role: dto.role },
  });
  return dto;
}

/** 编辑用户（可改密码/状态）。 */
export async function update(
  id: string,
  input: {
    username: string;
    name: string;
    role: Role;
    departmentId?: string;
    positionId?: string;
    groupIds?: string[];
    email?: string;
    status?: UserStatus;
    password?: string;
  },
  operatorId: string,
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
  const email = normalizeEmail(input.email);
  const positionId = normalizeDepartmentId(input.positionId);

  const duplicate = await repo.findByUsername(username);
  if (duplicate && duplicate.id !== id) {
    throw conflict(`登录账号 "${username}" 已存在`);
  }

  await repo.update(id, {
    username,
    name,
    role: input.role,
    departmentId,
    positionId,
    email,
    status: input.status ?? current.status,
  });
  await repo.setGroups(id, input.groupIds ?? mapUserRow(current).groupIds);
  if (input.password && input.password !== '') {
    const settings = await getSettings();
    assertPassword(input.password, settings);
    await repo.updatePasswordHash(id, await bcrypt.hash(input.password, BCRYPT_COST));
  }
  const updated = await repo.findById(id);
  const dto = mapUserRow(updated!);
  await auditService.record({
    actorId: operatorId,
    action: 'user.update',
    targetType: 'user',
    targetId: id,
    targetName: dto.name,
    detail: { username: dto.username, role: dto.role },
  });
  return dto;
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
  await auditService.record({
    actorId: operatorId,
    action: 'user.delete',
    targetType: 'user',
    targetId: id,
    targetName: current.name,
    detail: { username: current.username },
  });
}

/** 重置密码为默认密码。 */
export async function resetPassword(id: string, operatorId: string): Promise<void> {
  const current = await repo.findById(id);
  if (!current) throw notFound('用户不存在或已被删除');
  const settings = await getSettings();
  await repo.updatePasswordHash(id, await bcrypt.hash(settings.defaultPassword, BCRYPT_COST));
  // 重置密码后强制该用户下线（v1.7③：避免旧会话继续持有访问权）
  await sessions.revokeAll(id);
  await auditService.record({
    actorId: operatorId,
    action: 'user.reset_password',
    targetType: 'user',
    targetId: id,
    targetName: current.name,
    detail: { username: current.username },
  });
}

/** 查看某用户的登录设备（admin，v1.7③）。 */
export async function listUserSessions(id: string): Promise<SessionDto[]> {
  const current = await repo.findById(id);
  if (!current) throw notFound('用户不存在或已被删除');
  return sessions.listMySessions(id, '');
}

/**
 * 管理员强制重置某账号的两步验证（v1.8② U2）。
 * 用于「用户丢失验证器且恢复码用尽」的兜底：清空密钥与开关、作废恢复码、撤销全部会话并通知本人。
 */
export async function resetTwoFactor(id: string, operatorId: string): Promise<void> {
  await authService.adminResetTwoFactor(id, operatorId);
}

/** 强制下线某用户全部设备（admin，v1.7③）。 */
export async function revokeUserSessions(id: string, operatorId: string): Promise<number> {
  const current = await repo.findById(id);
  if (!current) throw notFound('用户不存在或已被删除');
  const count = await sessions.revokeAll(id);
  await auditService.record({
    actorId: operatorId,
    action: 'user.force_logout',
    targetType: 'user',
    targetId: id,
    targetName: current.name,
    detail: { username: current.username, count },
  });
  return count;
}
