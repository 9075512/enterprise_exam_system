/** 报表 API（§4.5 考试 / 记录 / 报表） */
import { get } from './http';
import type { Report } from '@/types';

/** 单场考试报表聚合（summary + bands + departments + wrongRate） */
export function examReport(examId: string): Promise<Report> {
  return get<Report>(`/reports/exams/${examId}`);
}

/**
 * 导出某场考试成绩（xlsx 二进制）。
 * - columns：导出字段 key（与后端 reports.columns.ts 白名单一致），至少 1 个；
 * - tzOffset：本地时区相对 UTC 的偏移分钟（东八区 = 480），保证导出时间为本地时间。
 * 注：后端返回裸二进制而非 {code,message,data}，拦截器会原样透传为 Blob。
 */
export function exportExamScores(examId: string, columns: string[]): Promise<Blob> {
  return get<Blob>(
    `/reports/exams/${examId}/export`,
    { columns: columns.join(','), tzOffset: -new Date().getTimezoneOffset() },
    { responseType: 'blob' },
  );
}
