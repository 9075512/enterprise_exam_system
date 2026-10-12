/** 科室 API（§4.5 组织） */
import { del, get, post, put } from './http';
import type { Department } from '@/types';

/** 科室列表 */
export function list(): Promise<Department[]> {
  return get<Department[]>('/departments');
}

/** 新建科室 */
export function create(payload: { name: string; description?: string }): Promise<Department> {
  return post<Department>('/departments', payload);
}

/** 编辑科室 */
export function update(
  id: string,
  payload: { name: string; description?: string },
): Promise<Department> {
  return put<Department>(`/departments/${id}`, payload);
}

/** 删除科室（有归属用户 → 1005） */
export function remove(id: string): Promise<null> {
  return del<null>(`/departments/${id}`);
}
