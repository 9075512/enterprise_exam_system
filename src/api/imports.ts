/** Excel 导入 API（§4.5 Excel 导入） */
import { get, post, upload } from './http';
import type { CommitResult, ImportBatch, Page, PreviewResult, RowIssue, ValidRow } from '@/types';

/** 下载 .xlsx 模板（二进制） */
export function downloadTemplate(): Promise<Blob> {
  return get<Blob>('/questions/import/template', undefined, { responseType: 'blob' });
}

/** 上传解析预览（multipart/form-data：file + bankId） */
export function preview(file: File, bankId: string): Promise<PreviewResult> {
  const form = new FormData();
  form.append('file', file);
  form.append('bankId', bankId);
  return upload<PreviewResult>('/questions/import/preview', form);
}

/** 确认导入（单事务）；`dedupe=true` 时按内容指纹跳过目标题库中已存在的相同题目（v1.8⑤ U5） */
export function commit(payload: {
  bankId: string;
  fileName: string;
  validRows: ValidRow[];
  errors?: RowIssue[];
  dedupe?: boolean;
}): Promise<CommitResult> {
  return post<CommitResult>('/questions/import/commit', payload);
}

/** 导入历史（分页） */
export function batches(query: { bankId?: string; page?: number; pageSize?: number } = {}): Promise<
  Page<ImportBatch>
> {
  return get<Page<ImportBatch>>('/import-batches', {
    bankId: query.bankId,
    page: query.page,
    pageSize: query.pageSize,
  });
}
