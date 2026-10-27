import { del, get, post } from './http';
import { createCaptureId } from '@/utils/captureId';
import type { CaptureConfig, CapturePage } from '@/types';

export function configForExam(examId: string): Promise<CaptureConfig> { return get(`/exams/${examId}/capture-config`); }
export interface StartCapture { file?: Blob; captureId: string; reason?: string }
export function upload(recordId: string, file: Blob, captureId: string, kind: 'periodic' | 'resume'): Promise<{ id: string }> {
  const body = new FormData();
  body.append('file', file, 'capture.jpg'); body.append('captureId', captureId); body.append('kind', kind);
  return post(`/records/${recordId}/captures`, body, { suppressErrorToast: true });
}
export function event(recordId: string, status: 'ready' | 'unavailable' | 'interrupted' | 'upload_failed', reason = '', eventId: string = createCaptureId()): Promise<null> {
  return post(`/records/${recordId}/captures/events`, { eventId, status, reason: reason.slice(0, 255) }, { suppressErrorToast: true });
}
export function list(recordId: string, page: number, pageSize = 12): Promise<CapturePage> { return get(`/records/${recordId}/captures`, { page, pageSize }); }
export function image(recordId: string, captureId: string): Promise<Blob> { return get(`/records/${recordId}/captures/${captureId}/image`, undefined, { responseType: 'blob', suppressErrorToast: true }); }
export interface DeleteCaptureResult { deletedCount: number; alreadyDeletedCount: number }
export function remove(recordId: string, captureId: string): Promise<DeleteCaptureResult> { return del(`/records/${recordId}/captures/${captureId}`, undefined, { suppressErrorToast: true }); }
export function removeBatch(recordId: string, captureIds: string[]): Promise<DeleteCaptureResult> { return post(`/records/${recordId}/captures/batch-delete`, { captureIds }, { suppressErrorToast: true }); }
