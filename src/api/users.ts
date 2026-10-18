/** 用户 API（§4.5 组织） */
import { del, get, post, put } from './http';
import type { LoginSession, Role, User, UserSaveInput, UserStatus } from '@/types';

/** 用户保存入参（新建/编辑共用） */
export interface UserPayload {
  username: string;
  name: string;
  role?: Role;
  departmentId?: string;
  positionId?: string;
  roleId?: string;
  email?: string;
  status?: UserStatus;
  password?: string;
}

/** 用户列表（可按角色/关键字过滤） */
export function list(filter: { role?: Role; roleId?: string; keyword?: string } = {}): Promise<User[]> {
  return get<User[]>('/users', { role: filter.role, roleId: filter.roleId, keyword: filter.keyword });
}

/** 新建用户 */
export function create(payload: UserPayload): Promise<User> {
  return post<User>('/users', payload);
}

/** 编辑用户 */
export function update(id: string, payload: UserPayload | UserSaveInput): Promise<User> {
  return put<User>(`/users/${id}`, payload);
}

/** 删除用户（有记录/本人 → 1005） */
export function remove(id: string): Promise<null> {
  return del<null>(`/users/${id}`);
}

/** 重置为默认密码（同时强制该用户全部设备下线，v1.7③） */
export function resetPassword(id: string): Promise<null> {
  return post<null>(`/users/${id}/reset-password`);
}

/** 查看某用户的登录设备（v1.7③） */
export function listSessions(id: string): Promise<LoginSession[]> {
  return get<LoginSession[]>(`/users/${id}/sessions`);
}

/** 强制下线某用户全部设备（v1.7③） */
export function revokeSessions(id: string): Promise<{ count: number }> {
  return del<{ count: number }>(`/users/${id}/sessions`);
}

/** 管理员强制重置某账号的两步验证（v1.8② U2；同时作废恢复码并撤销其全部会话） */
export function resetTwoFactor(id: string): Promise<null> {
  return post<null>(`/users/${id}/2fa/reset`);
}
