/**
 * 考试端内置练题 API。
 *
 * 这里使用主系统 http 实例与 `exam_sys.token`，因此考试和练题共享一次登录、
 * 同一套会话失效处理；独立 practice-web 仍保留原有兼容入口。
 */
import { del, get, post, put, type AppRequestConfig } from './http';
import type {
  ContentFeed,
  Page,
  PracticeAchievements,
  PracticeBank,
  PracticeBankStat,
  PracticeBankTreeNode,
  PracticeCheckResult,
  PracticeConfig,
  PracticeDailyTask,
  PracticeFavoriteQuestion,
  PracticeMode,
  PracticeProgress,
  PracticeQuestion,
  PracticeReportSummary,
  PracticeSession,
  PracticeSubjectStat,
  PracticeTrendPoint,
  PracticeWrongQuestion,
  QuestionType,
} from '@/types';

export interface PracticeSessionPayload {
  bankId: string;
  mode?: PracticeMode;
  count?: number;
  types?: QuestionType[];
}

export interface PracticeCheckPayload {
  sessionToken: string;
  questionId: string;
  answer: number[];
}

export interface PracticeProgressPayload { bankId: string; lastQuestionId?: string | null }

export function listBanks(): Promise<PracticeBank[]> { return get('/practice/banks'); }
export function bankTree(): Promise<PracticeBankTreeNode[]> { return get('/practice/banks/tree'); }
export function questionsByIds(ids: string[]): Promise<PracticeQuestion[]> {
  return get('/practice/questions', { ids: ids.join(',') });
}
export function createSession(payload: PracticeSessionPayload): Promise<PracticeSession> {
  return post('/practice/sessions', payload);
}
export function heartbeatSession(id: string): Promise<null> {
  return post(`/practice/sessions/${encodeURIComponent(id)}/heartbeat`, undefined, { suppressErrorToast: true });
}
export function finishSession(id: string, status: 'completed' | 'exited'): Promise<null> {
  return post(`/practice/sessions/${encodeURIComponent(id)}/finish`, { status }, { suppressErrorToast: true });
}
export function submitQuestionFeedback(payload: { questionId: string; sessionId: string; category: string; content: string }): Promise<unknown> {
  return post('/practice/feedback', payload);
}
export function getConfig(): Promise<PracticeConfig> { return get('/practice/config'); }
export function feed(): Promise<ContentFeed> { return get('/practice/feed'); }
export function markAnnouncementRead(id: string): Promise<null> {
  return post(`/practice/feed/announcements/${encodeURIComponent(id)}/read`);
}
export function markBannerClick(id: string): Promise<null> {
  return post(`/practice/feed/banners/${encodeURIComponent(id)}/click`);
}
export function check(payload: PracticeCheckPayload): Promise<PracticeCheckResult> {
  return post('/practice/check', payload);
}
export function saveProgress(payload: PracticeProgressPayload, config?: Pick<AppRequestConfig, 'suppressErrorToast'>): Promise<PracticeProgress> {
  return put('/practice/progress', payload, config);
}
export function wrongBook(query: { page?: number; pageSize?: number } = {}): Promise<Page<PracticeWrongQuestion>> {
  return get('/practice/wrong-book', query);
}
export function wrongReans(bankId?: string): Promise<PracticeSession> {
  return post('/practice/wrong-book/reans', { bankId });
}
export function favorites(query: { bankId?: string; page?: number; pageSize?: number } = {}): Promise<Page<PracticeFavoriteQuestion>> {
  return get('/practice/favorites', { bankId: query.bankId || undefined, page: query.page, pageSize: query.pageSize });
}
export function favoriteIds(bankId?: string, config?: Pick<AppRequestConfig, 'suppressErrorToast'>): Promise<string[]> {
  return get('/practice/favorites/ids', { bankId: bankId || undefined }, config);
}
export function addFavorite(questionId: string): Promise<{ favorited: boolean; favoriteTotal: number }> {
  return post('/practice/favorites', { questionId });
}
export function removeFavorite(questionId: string): Promise<{ favorited: boolean; favoriteTotal: number }> {
  return del(`/practice/favorites/${encodeURIComponent(questionId)}`);
}
export function favoritesReans(bankId?: string): Promise<PracticeSession> {
  return post('/practice/favorites/reans', { bankId });
}
export function daily(config?: Pick<AppRequestConfig, 'suppressErrorToast'>): Promise<PracticeDailyTask> {
  return get('/practice/daily', undefined, config);
}
export function dailySession(): Promise<PracticeSession> { return post('/practice/daily/session'); }
export function reportSummary(): Promise<PracticeReportSummary> { return get('/practice/report/summary'); }
export function reportTrend(days: 7 | 30 = 7): Promise<PracticeTrendPoint[]> {
  return get('/practice/report/trend', { days });
}
export function reportSubjects(): Promise<PracticeSubjectStat[]> { return get('/practice/report/subjects'); }
export function reportBanks(): Promise<PracticeBankStat[]> { return get('/practice/report/banks'); }
export function achievements(): Promise<PracticeAchievements> { return get('/practice/achievements'); }
