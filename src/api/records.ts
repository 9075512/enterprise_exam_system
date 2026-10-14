/** 考试记录 API（§4.5 考试 / 记录 / 报表） */
import { get, post, put } from './http';
import type { ExamRecord, Page, ReviewNotes } from '@/types';

/** 我的成绩（已交卷，分页；keyword 可选，按考试名称模糊匹配） */
export function my(
  query: { page?: number; pageSize?: number; keyword?: string } = {},
): Promise<Page<ExamRecord>> {
  return get<Page<ExamRecord>>('/records/my', {
    page: query.page,
    pageSize: query.pageSize,
    keyword: query.keyword,
  });
}

/** 记录详情（考生仅本人，管理员任意） */
export function detail(id: string): Promise<ExamRecord> {
  return get<ExamRecord>(`/records/${id}`);
}

/** 某场考试全部记录（admin，分页） */
export function listByExam(query: {
  examId: string;
  page?: number;
  pageSize?: number;
}): Promise<Page<ExamRecord>> {
  return get<Page<ExamRecord>>('/records', {
    examId: query.examId,
    page: query.page,
    pageSize: query.pageSize,
  });
}

/** 某场考试切屏异常记录（admin，切屏审查，无分页） */
export function listCheatByExam(examId: string): Promise<ExamRecord[]> {
  return get<ExamRecord[]>('/records/cheat', { examId });
}

/** 待阅卷列表（admin/author，分页；v1.9④ 支持按考试过滤） */
export function listPending(
  query: { page?: number; pageSize?: number; examId?: string } = {},
): Promise<Page<ExamRecord>> {
  return get<Page<ExamRecord>>('/records/pending', {
    page: query.page,
    pageSize: query.pageSize,
    examId: query.examId,
  });
}

/** 提交人工阅卷（逐题主观分 + 逐题评语 / 存疑备注） */
export function review(
  id: string,
  subjectiveScores: Record<string, number>,
  reviewNotes: ReviewNotes = {},
): Promise<ExamRecord> {
  return put<ExamRecord>(`/records/${id}/review`, { subjectiveScores, reviewNotes });
}

/** 暂存答案 */
export function saveAnswers(id: string, answers: Record<string, number[] | string[]>): Promise<null> {
  return put<null>(`/records/${id}/answers`, { answers });
}

/** 上报切屏事件 */
export function addCheatEvent(id: string, awaySeconds: number): Promise<null> {
  return post<null>(`/records/${id}/cheat-events`, { awaySeconds });
}

/** 交卷判分（幂等） */
export function submit(id: string, auto = false): Promise<ExamRecord> {
  return post<ExamRecord>(`/records/${id}/submit`, { auto });
}
