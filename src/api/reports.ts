/** 报表 API（§4.5 考试 / 记录 / 报表） */
import { get } from './http';
import type { DashboardReport, Report } from '@/types';

/** 单场考试报表聚合（summary + bands + departments + wrongRate） */
export function examReport(examId: string): Promise<Report> {
  return get<Report>(`/reports/exams/${examId}`);
}

/** 数据看板（及格率趋势 + 科目错题归因） */
export function dashboard(): Promise<DashboardReport> {
  return get<DashboardReport>('/reports/dashboard');
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

/**
 * 导出某场考试成绩为 PDF（同一套列白名单）。
 * 后端返回裸二进制 PDF，拦截器原样透传为 Blob。
 */
export function exportExamScoresPdf(examId: string, columns: string[]): Promise<Blob> {
  return get<Blob>(
    `/reports/exams/${examId}/export-pdf`,
    { columns: columns.join(','), tzOffset: -new Date().getTimezoneOffset() },
    { responseType: 'blob' },
  );
}
