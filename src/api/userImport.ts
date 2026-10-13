/** 用户批量导入 API（v1.5） */
import { get, post, upload } from './http';
import type { Page, RowIssue, UserCommitResult, UserImportBatch, UserPreviewResult, UserValidRow } from '@/types';

/** 下载用户导入 .xlsx 模板（二进制） */
export function downloadUserTemplate(): Promise<Blob> {
  return get<Blob>('/users/import/template', undefined, { responseType: 'blob' });
}

/** 上传解析预览（multipart/form-data：file） */
export function previewUsers(file: File): Promise<UserPreviewResult> {
  const form = new FormData();
  form.append('file', file);
  return upload<UserPreviewResult>('/users/import/preview', form);
}

/** 确认导入 */
export function commitUsers(payload: {
  fileName: string;
  validRows: UserValidRow[];
  errors?: RowIssue[];
}): Promise<UserCommitResult> {
  return post<UserCommitResult>('/users/import/commit', payload);
}

/** 导入历史（分页） */
export function userBatches(page?: number, pageSize?: number): Promise<Page<UserImportBatch>> {
  return get<Page<UserImportBatch>>('/users/import/batches', { page, pageSize });
}
