import { del, get, post, put } from './http';
import type {
  AdmissionTicket, DuplicateQuestionGroup, ExamParticipant,
  MenuOverride, Position, PracticeMonitorSummary, PracticeSessionMonitor, QuestionFeedback,
  QuestionFeedbackStatus, Subject, SubjectGrant,
} from '@/types';

export const subjectsApi = {
  list: (): Promise<Subject[]> => get('/subjects'),
  create: (data: Partial<Subject>): Promise<Subject> => post('/subjects', data),
  update: (id: string, data: Partial<Subject>): Promise<Subject> => put(`/subjects/${id}`, data),
  remove: (id: string): Promise<null> => del(`/subjects/${id}`),
};
export const positionsApi = {
  list: (): Promise<Position[]> => get('/positions'),
  create: (data: Pick<Position, 'name' | 'description'>): Promise<Position> => post('/positions', data),
  update: (id: string, data: Pick<Position, 'name' | 'description'>): Promise<Position> => put(`/positions/${id}`, data),
  remove: (id: string): Promise<null> => del(`/positions/${id}`),
};
export const subjectGrantsApi = {
  list: (): Promise<SubjectGrant[]> => get('/subject-grants'),
  replace: (subjectId: string, grants: Array<Omit<SubjectGrant, 'id' | 'subjectId'>>): Promise<SubjectGrant[]> => put(`/subject-grants/${subjectId}`, { grants }),
};
export const menuOverridesApi = {
  list: (userId?: string): Promise<MenuOverride[]> => get('/menu-overrides', { userId }),
  replace: (userId: string, overrides: Array<Omit<MenuOverride, 'userId'>>): Promise<MenuOverride[]> => put(`/menu-overrides/${userId}`, { overrides }),
};
export const qualityApi = {
  duplicates: (params: { bankIds?: string; includeDisabled?: number } = {}): Promise<DuplicateQuestionGroup[]> => get('/questions/duplicates', params),
  batch: (ids: string[], action: 'enable' | 'disable' | 'migrate' | 'delete' | 'validate', targetBankId?: string): Promise<{ affected: number; issues?: Array<{ questionId: string; issues: string[] }> }> => post('/questions/batch', { ids, action, targetBankId }),
};
export const feedbackApi = {
  list: (status?: QuestionFeedbackStatus): Promise<QuestionFeedback[]> => get('/question-feedback', { status }),
  create: (data: { questionId: string; source: 'exam' | 'practice'; sourceRefId?: string; category: string; content: string }): Promise<QuestionFeedback> => post('/question-feedback', data),
  update: (id: string, data: { status: QuestionFeedbackStatus; reply?: string }): Promise<QuestionFeedback> => put(`/question-feedback/${id}`, data),
};
export const participantsApi = {
  list: (examId: string, freeze = false): Promise<ExamParticipant[]> => get(`/exams/${examId}/participants`, { freeze: freeze ? 1 : 0 }),
  regenerate: (examId: string): Promise<ExamParticipant[]> => post(`/exams/${examId}/participants/regenerate`),
  tickets: (examId: string): Promise<AdmissionTicket[]> => get(`/exams/${examId}/admission-tickets`),
  ticketsPdf: (examId: string): Promise<Blob> => get(`/exams/${examId}/admission-tickets`, { format: 'pdf' }, { responseType: 'blob' }),
};
export const practiceMonitorApi = {
  overview: (): Promise<PracticeMonitorSummary> => get('/practice-monitor/overview'),
  sessions: (params: Record<string, unknown> = {}): Promise<PracticeSessionMonitor[]> => get('/practice-monitor/sessions', params),
  logs: (params: Record<string, unknown> = {}): Promise<Array<Record<string, unknown>>> => get('/practice-monitor/logs', params),
};
