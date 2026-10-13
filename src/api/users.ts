/** 用户 API（§4.5 组织） */
import { del, get, post, put } from './http';
import type { Role, User, UserSaveInput, UserStatus } from '@/types';

/** 用户保存入参（新建/编辑共用） */
export interface UserPayload {
  username: string;
  name: string;
  role: Role;
  departmentId?: string;
  email?: string;
  status?: UserStatus;
  password?: string;
}

/** 用户列表（可按角色/关键字过滤） */
export function list(filter: { role?: Role; keyword?: string } = {}): Promise<User[]> {
  return get<User[]>('/users', { role: filter.role, keyword: filter.keyword });
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

/** 重置为默认密码 */
export function resetPassword(id: string): Promise<null> {
  return post<null>(`/users/${id}/reset-password`);
}
