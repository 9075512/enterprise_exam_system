/** 补考 API（v1.5，申请-审批流） */
import { get, post } from './http';
import type { Page, Retake, RetakeStatus } from '@/types';

/** 考生发起补考申请 */
export function applyRetake(examId: string, reason: string): Promise<Retake> {
  return post<Retake>('/retakes/apply', { examId, reason });
}

/** 考生查看本人申请 */
export function listMyRetakes(page?: number, pageSize?: number): Promise<Page<Retake>> {
  return get<Page<Retake>>('/retakes/my', { page, pageSize });
}

/** 管理员审批列表 */
export function listRetakes(params: { status?: RetakeStatus; page?: number; pageSize?: number } = {}): Promise<
  Page<Retake>
> {
  return get<Page<Retake>>('/retakes', { status: params.status, page: params.page, pageSize: params.pageSize });
}

/** 管理员通过 */
export function approveRetake(id: string): Promise<Retake> {
  return post<Retake>(`/retakes/${id}/approve`);
}

/** 管理员驳回 */
export function rejectRetake(id: string, reason: string): Promise<Retake> {
  return post<Retake>(`/retakes/${id}/reject`, { reason });
}
