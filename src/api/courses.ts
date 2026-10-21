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
export async function uploadCourseMedia(file: File, signal: AbortSignal, onProgress: (percent: number) => void): Promise<{ url: string }> {
  const form = new FormData(); form.append('file', file);
  return await http.post('/courses/manage/media', form, { timeout: 0, signal, onUploadProgress: event => { if (event.total) onProgress(Math.round(event.loaded / event.total * 100)); } }) as unknown as { url: string };
}
