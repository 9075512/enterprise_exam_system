/**
 * 日期时间工具：展示层格式化（存储一律 ISO 8601，见共享约定）。
 */
import dayjs from 'dayjs';

/** ISO 8601 → 'YYYY-MM-DD HH:mm'，空值显示占位符 */
export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  return dayjs(iso).format('YYYY-MM-DD HH:mm');
}

/** 时间窗展示：'YYYY-MM-DD HH:mm ~ YYYY-MM-DD HH:mm' */
export function formatRange(startIso: string, endIso: string): string {
  return `${formatDateTime(startIso)} ~ ${formatDateTime(endIso)}`;
}

/** ISO 8601 → datetime-local 输入框值（本地时间） */
export function toDateInputValue(iso: string): string {
  return dayjs(iso).format('YYYY-MM-DDTHH:mm');
}
