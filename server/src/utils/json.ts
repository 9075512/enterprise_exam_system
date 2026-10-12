/**
 * JSON 列读写工具。
 * mysql2 对 JSON 列的返回可能是「已解析对象」也可能「原始字符串」，此处统一兼容。
 */

/**
 * 解析 JSON 列值。
 * @param value 数据库返回值（对象 / 字符串 / null）
 * @param fallback 解析失败或为空时的回退值
 */
export function parseJsonColumn<T>(value: unknown, fallback: T): T {
  if (value === null || value === undefined) return fallback;
  if (typeof value === 'object') return value as T;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed === '') return fallback;
    try {
      return JSON.parse(trimmed) as T;
    } catch {
      return fallback;
    }
  }
  return fallback;
}

/** 序列化写入 JSON 列。 */
export function toJsonColumn(value: unknown): string {
  return JSON.stringify(value ?? null);
}
