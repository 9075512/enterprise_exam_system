/**
 * 审计日志导出 —— 列定义（Excel / CSV 共用）。
 *
 * 与 `modules/reports/reports.columns.ts` 同构：列 key 为稳定业务键（白名单校验用），
 * 表头/列宽/取值集中在此，服务层与路由层均不硬编码字段。
 * 注：本文件只依赖类型，不反向依赖 `audit.service`（避免循环引用）。
 */
import type { ExportColumn } from '../../utils/excelExport.js';

/** 导出行（已由服务层把 detail 序列化为可读文本、时间格式化为本地时间）。 */
export interface AuditExportRow {
  /** 本地时间 'YYYY-MM-DD HH:mm' */
  createdAt: string;
  actorName: string;
  actionLabel: string;
  targetTypeLabel: string;
  targetName: string;
  targetId: string;
  /** 明细摘要（'键=值' 以 '；' 连接，空明细为 ''） */
  detail: string;
}

/** 全部可选导出列（顺序即输出顺序）。 */
export const AUDIT_EXPORT_COLUMNS: Array<ExportColumn<AuditExportRow>> = [
  { key: 'createdAt', header: '操作时间', width: 20, value: (r) => r.createdAt },
  { key: 'actorName', header: '操作者', width: 14, value: (r) => r.actorName },
  { key: 'action', header: '操作类型', width: 16, value: (r) => r.actionLabel },
  { key: 'targetType', header: '对象类型', width: 12, value: (r) => r.targetTypeLabel },
  { key: 'targetName', header: '对象名称', width: 24, value: (r) => r.targetName },
  { key: 'targetId', header: '对象 ID', width: 24, value: (r) => r.targetId },
  { key: 'detail', header: '明细', width: 44, value: (r) => r.detail },
];

/** 导出列 key 白名单。 */
export const AUDIT_EXPORT_KEYS: ReadonlySet<string> = new Set(AUDIT_EXPORT_COLUMNS.map((c) => c.key));

/** 默认导出列（未指定 columns 时使用）。 */
export const DEFAULT_AUDIT_EXPORT_KEYS: readonly string[] = [
  'createdAt',
  'actorName',
  'action',
  'targetType',
  'targetName',
  'detail',
];
