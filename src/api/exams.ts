/** 考试 API（§4.5 考试 / 记录 / 报表） */
import { del, get, post, put } from './http';
import type { Exam, ExamException, ExamMonitor, ExamMy, ExamRecord, ExamSaveInput } from '@/types';

/** 考试保存入参（不含 id） */
export type ExamPayload = Omit<ExamSaveInput, 'id'>;

/** 考试列表（admin） */
export function list(): Promise<Exam[]> {
  return get<Exam[]>('/exams');
}

/** 考生可见考试（科室隔离 + recordStatus） */
export function my(): Promise<ExamMy[]> {
  return get<ExamMy[]>('/exams/my');
}

/** 考试详情 */
export function detail(id: string): Promise<Exam> {
  return get<Exam>(`/exams/${id}`);
}

/** 新建考试 */
export function create(payload: ExamPayload): Promise<Exam> {
  return post<Exam>('/exams', payload);
}

/** 编辑考试 */
export function update(id: string, payload: ExamPayload): Promise<Exam> {
  return put<Exam>(`/exams/${id}`, payload);
}

/** 删除考试（有记录 1005） */
export function remove(id: string): Promise<null> {
  return del<null>(`/exams/${id}`);
}

/** 开始考试（生成记录 + 快照，幂等续考） */
export function start(id: string): Promise<ExamRecord> {
  return post<ExamRecord>(`/exams/${id}/start`);
}

/* ------------------------------ 特殊考试安排（v1.7①，admin） ------------------------------ */

/** 某场考试的全部特殊安排（加时/额外次数/免考） */
export function listExceptions(examId: string): Promise<ExamException[]> {
  return get<ExamException[]>(`/exams/${examId}/exceptions`);
}

/** 新增 / 更新某考生的特殊安排 */
export function saveException(
  examId: string,
  userId: string,
  payload: { extraMinutes?: number; extraAttempts?: number; exempt?: boolean; note?: string },
): Promise<ExamException> {
  return put<ExamException>(`/exams/${examId}/exceptions/${userId}`, payload);
}

/** 删除某考生的特殊安排 */
export function removeException(examId: string, userId: string): Promise<null> {
  return del<null>(`/exams/${examId}/exceptions/${userId}`);
}

/* ------------------------------ 实时考试监控（v1.7④ T3，admin） ------------------------------ */

/** 监考大屏数据（花名册 + 进度 + 汇总；前端定时轮询本接口） */
export function monitor(examId: string): Promise<ExamMonitor> {
  return get<ExamMonitor>(`/exams/${examId}/monitor`);
}

/** 强制某考生交卷 */
export function forceSubmit(examId: string, userId: string): Promise<ExamRecord> {
  return post<ExamRecord>(`/exams/${examId}/monitor/${userId}/force-submit`);
}

/** 为某考生加时（分钟，累加） */
export function extendTime(examId: string, userId: string, minutes: number): Promise<ExamException> {
  return post<ExamException>(`/exams/${examId}/monitor/${userId}/extend`, { minutes });
}
