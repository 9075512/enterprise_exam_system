import http, { del, get, post, put } from './http';
import type { Course } from '@/data/courses';

export type CourseStatus = 'draft' | 'published' | 'archived';
export interface ManagedCourse extends Course { status: CourseStatus; revision: number; sortOrder: number; isDemo: boolean; createdAt: string; updatedAt: string }
export type CourseInput = Omit<ManagedCourse, 'id' | 'status' | 'revision' | 'createdAt' | 'updatedAt'>;
export interface CoursePage { list: ManagedCourse[]; total: number; page: number; pageSize: number; stats: Record<CourseStatus, number> }
export interface CourseQuery { q: string; status: CourseStatus | ''; page: number; pageSize: number }
export function listCourses(): Promise<Course[]> { return get('/courses'); }
export function getCourse(id: string, signal?: AbortSignal): Promise<Course> { return get(`/courses/${encodeURIComponent(id)}`, undefined, { signal, suppressErrorToast: true }); }
export function listManagedCourses(query: CourseQuery): Promise<CoursePage> { return get('/courses/manage', { ...query }); }
export function getManagedCourse(id: string): Promise<ManagedCourse> { return get(`/courses/manage/${encodeURIComponent(id)}`); }
export function createCourse(course: CourseInput): Promise<ManagedCourse> { return post('/courses/manage', course, { suppressErrorToast: true }); }
export function updateCourse(id: string, revision: number, course: CourseInput): Promise<ManagedCourse> { return put(`/courses/manage/${encodeURIComponent(id)}`, { revision, course }, { suppressErrorToast: true }); }
export function setCourseStatus(id: string, revision: number, status: CourseStatus): Promise<ManagedCourse> { return put(`/courses/manage/${encodeURIComponent(id)}/status`, { revision, status }, { suppressErrorToast: true }); }
export function deleteCourse(id: string, revision: number): Promise<void> { return del(`/courses/manage/${encodeURIComponent(id)}`, { revision }, { suppressErrorToast: true }); }
export interface CourseAudience { mode: 'public' | 'assigned'; revision: number; departmentIds: string[]; userIds: string[] }
export type CourseProgressStatus = 'not_started' | 'learning' | 'completed';
export interface CourseProgressQuery { scope: 'current' | 'history'; keyword: string; departmentId: string; status: CourseProgressStatus | ''; page: number; pageSize: number }
export interface CoursePersonProgress {
  userId: string; userName: string; username: string; departmentId: string; departmentName: string; accountStatus: string;
  scope: 'current' | 'history'; status: CourseProgressStatus; completedLessons: number; totalLessons: number; percent: number; lastLearnedAt: string;
}
export interface CourseLessonReport { lessonId: string; chapterTitle: string; lessonTitle: string; position: number; duration: number; completed: boolean; status: CourseProgressStatus; lastLearnedAt: string }
export interface CourseProgressPage { courseTitle: string; list: CoursePersonProgress[]; total: number; page: number; pageSize: number; summary: { total: number; notStarted: number; learning: number; completed: number; completionRate: number } }
export interface CoursePersonReport extends CoursePersonProgress { courseTitle: string; lessons: CourseLessonReport[] }
export function getCourseAudience(id: string): Promise<CourseAudience> { return get(`/courses/manage/${encodeURIComponent(id)}/audience`, undefined, { suppressErrorToast: true }); }
export function saveCourseAudience(id: string, input: Pick<CourseAudience, 'revision' | 'departmentIds' | 'userIds'>): Promise<CourseAudience> { return put(`/courses/manage/${encodeURIComponent(id)}/audience`, input, { suppressErrorToast: true }); }
export function getCourseProgressReport(id: string, query: CourseProgressQuery): Promise<CourseProgressPage> { return get(`/courses/manage/${encodeURIComponent(id)}/progress`, { ...query }, { suppressErrorToast: true }); }
export function getCoursePersonProgress(id: string, userId: string): Promise<CoursePersonReport> { return get(`/courses/manage/${encodeURIComponent(id)}/progress/${encodeURIComponent(userId)}`, undefined, { suppressErrorToast: true }); }
export function exportCourseProgress(id: string, query: CourseProgressQuery): Promise<Blob> { return get(`/courses/manage/${encodeURIComponent(id)}/progress/export`, { ...query }, { responseType: 'blob', suppressErrorToast: true }); }
export interface CourseCategory { id: string; name: string; sortOrder: number; revision: number; courseCount: number }
export function listCourseCategories(): Promise<CourseCategory[]> { return get('/courses/manage/categories', undefined, { suppressErrorToast: true }); }
export function createCourseCategory(input: { name: string; sortOrder: number }): Promise<CourseCategory> { return post('/courses/manage/categories', input, { suppressErrorToast: true }); }
export function updateCourseCategory(id: string, revision: number, input: { name: string; sortOrder: number }): Promise<CourseCategory> { return put(`/courses/manage/categories/${encodeURIComponent(id)}`, { ...input, revision }, { suppressErrorToast: true }); }
export function deleteCourseCategory(id: string, revision: number): Promise<void> { return del(`/courses/manage/categories/${encodeURIComponent(id)}`, { revision }, { suppressErrorToast: true }); }
export function generateCourseCover(input: { title: string; category: string; instructor: string }, signal: AbortSignal): Promise<{ url: string }> {
  return post('/courses/manage/cover', input, { signal, suppressErrorToast: true });
}
export async function uploadCourseMedia(file: File, signal: AbortSignal, onProgress: (percent: number) => void): Promise<{ url: string }> {
  const form = new FormData(); form.append('file', file);
  return await http.post('/courses/manage/media', form, { timeout: 0, signal, onUploadProgress: event => { if (event.total) onProgress(Math.round(event.loaded / event.total * 100)); } }) as unknown as { url: string };
}
