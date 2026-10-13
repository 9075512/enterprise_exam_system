/** 成绩复核 API（v1.7①） */
import { get, post } from './http';
import type { Page, ScoreAppeal } from '@/types';

/** 考生发起成绩复核申请 */
export function apply(recordId: string, reason: string): Promise<ScoreAppeal> {
  return post<ScoreAppeal>('/appeals/apply', { recordId, reason });
}

/** 考生查看本人复核申请 */
export function my(query: { page?: number; pageSize?: number } = {}): Promise<Page<ScoreAppeal>> {
  return get<Page<ScoreAppeal>>('/appeals/my', { page: query.page, pageSize: query.pageSize });
}

/** 管理员复核列表（可按状态 / 考试过滤；v1.9④ 支持 examId） */
export function list(
  query: { status?: string; examId?: string; page?: number; pageSize?: number } = {},
): Promise<Page<ScoreAppeal>> {
  return get<Page<ScoreAppeal>>('/appeals', {
    status: query.status,
    examId: query.examId,
    page: query.page,
    pageSize: query.pageSize,
  });
}

/** 管理员复核通过（改分） */
export function approve(id: string, newScore: number, comment: string): Promise<ScoreAppeal> {
  return post<ScoreAppeal>(`/appeals/${id}/approve`, { newScore, comment });
}

/** 管理员复核驳回 */
export function reject(id: string, comment: string): Promise<ScoreAppeal> {
  return post<ScoreAppeal>(`/appeals/${id}/reject`, { comment });
}
