import { get, post } from './http';

export interface PlaybackProgress { position: number; duration: number; completed: boolean; immediate?: boolean }
export interface LessonProgress extends PlaybackProgress { updatedAt: number; revision?: number; clientId?: string; sequence?: number }
export interface SavedProgress { version: 1; courses: Record<string, { lastLessonId?: string; lessons: Record<string, LessonProgress> }> }
export interface ProgressWrite extends PlaybackProgress { revision: number; clientId: string; sequence: number }
export interface LegacyLesson extends PlaybackProgress { courseId: string; lessonId: string; selected: boolean }
const headers = (token: string) => ({ Authorization: `Bearer ${token}` });
export function getCourseProgress(token: string): Promise<SavedProgress> { return get('/courses/progress', undefined, { headers: headers(token), suppressErrorToast: true }); }
export function importCourseProgress(lessons: LegacyLesson[], token: string): Promise<SavedProgress> { return post('/courses/progress/import', { lessons }, { headers: headers(token), suppressErrorToast: true }); }

// Native keepalive also delivers the final small write during page navigation/close.
async function write<T>(url: string, body: unknown, token: string): Promise<T> {
  const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch('/api' + url, { method: 'PUT', headers: { ...headers(token), 'Content-Type': 'application/json' }, body: JSON.stringify(body), keepalive: true, credentials: 'same-origin', signal: controller.signal });
    const result = await response.json();
    if (!response.ok || result.code !== 0) throw Object.assign(new Error(result.message || '观看记录同步失败'), { status: response.status, code: result.code });
    return result.data;
  } finally { clearTimeout(timer); }
}
export function saveCourseProgress(courseId: string, lessonId: string, body: ProgressWrite, token: string): Promise<LessonProgress> { return write(`/courses/progress/${encodeURIComponent(courseId)}/${encodeURIComponent(lessonId)}`, body, token); }
export function selectCourseLesson(courseId: string, lessonId: string, token: string): Promise<void> { return write(`/courses/progress/${encodeURIComponent(courseId)}/selection`, { lessonId }, token); }
