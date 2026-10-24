import { get, put, post } from './http';
export interface AppRelease {
  id: string; appName: string; versionName: string; versionCode: number; minAndroid: string;
  releaseNotes: string; fileSize: number; sha256: string; status: 'draft' | 'published' | 'withdrawn';
  revision: number; downloadCount: number; createdAt: string; publishedAt: string | null; downloadUrl: string;
}
export type ReleaseInput = Pick<AppRelease, 'appName' | 'versionName' | 'versionCode' | 'minAndroid' | 'releaseNotes'>;
export const latestApp = () => get<AppRelease | null>('/apps/latest', undefined, { skipAuthRedirect: true, suppressErrorToast: true });
export const listApps = () => get<AppRelease[]>('/apps/manage');
export const createAppRelease = (body: FormData, progress: (percent: number) => void) => post<AppRelease>('/apps/manage', body, {
  timeout: 15 * 60 * 1000,
  onUploadProgress: event => progress(event.total ? Math.round(event.loaded / event.total * 100) : 0),
});
export const editAppRelease = (item: AppRelease, body: ReleaseInput) => put(`/apps/manage/${item.id}`, { ...body, revision: item.revision });
export const changeAppStatus = (item: AppRelease, status: 'published' | 'withdrawn') => put(`/apps/manage/${item.id}/status`, { revision: item.revision, status });
export function formatAppSize(bytes: number): string { return bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`; }
export function formatAppDate(date: string | null): string {
  return date ? new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium', timeZone: 'Asia/Shanghai' }).format(new Date(date)) : '尚未发布';
}
