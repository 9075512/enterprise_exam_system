/**
 * 分页统一约定（§4.4 / §9-5）。
 * page 从 1 起；pageSize 默认 20。
 */
import { z } from 'zod';

/** 默认每页条数。 */
export const DEFAULT_PAGE_SIZE = 20;
/** 每页条数上限（架构 §4.4 / §9 口径为 100）。 */
export const MAX_PAGE_SIZE = 100;

/**
 * 通用分页查询参数（query 字符串自动强转）。
 * 说明：每条约束都显式给出中文 message（`invalid_type_error` + `.int()` + `.min()`），
 * 即便全局 errorMap 未生效也不会漏出 zod 英文默认文案。
 */
export const paginationQuery = {
  page: z.coerce
    .number({ invalid_type_error: '页码必须为数字' })
    .int('页码必须为整数')
    .min(1, '页码必须大于等于 1')
    .optional()
    .default(1),
  pageSize: z.coerce
    .number({ invalid_type_error: '每页条数必须为数字' })
    .int('每页条数必须为整数')
    .min(1, '每页至少 1 条')
    .max(MAX_PAGE_SIZE, `每页最多 ${MAX_PAGE_SIZE} 条`)
    .optional()
    .default(DEFAULT_PAGE_SIZE),
};

/** 归一化分页参数并给出 SQL 偏移量。 */
export function normalizePaging(
  page?: number,
  pageSize?: number,
): { page: number; pageSize: number; offset: number } {
  const p = Number.isFinite(page) && (page as number) > 0 ? Math.floor(page as number) : 1;
  const rawSize = Number.isFinite(pageSize) && (pageSize as number) > 0 ? Math.floor(pageSize as number) : DEFAULT_PAGE_SIZE;
  const size = Math.min(rawSize, MAX_PAGE_SIZE);
  return { page: p, pageSize: size, offset: (p - 1) * size };
}

/** 组装分页响应体。 */
export function buildPage<T>(
  list: T[],
  total: number,
  page: number,
  pageSize: number,
): { list: T[]; total: number; page: number; pageSize: number } {
  return { list, total, page, pageSize };
}
