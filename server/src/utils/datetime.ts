/**
 * 时间转换工具（全链路 UTC）。
 * - 写库：ISO 8601 → `'YYYY-MM-DD HH:mm:ss.SSS'`（UTC，去掉 T/Z）。
 * - 读库：DB 字符串 → ISO 8601（`'YYYY-MM-DDTHH:mm:ss.SSSZ'`）。
 * 连接池设 `timezone:'Z'` + `dateStrings:true`，因此取到的是原始字符串。
 */

/** 把 ISO 字符串（或 Date）转成 MySQL `DATETIME(3)` 可写格式（UTC）。 */
export function toDbDate(value: string | Date): string {
  const d = value instanceof Date ? value : new Date(value);
  // toISOString() → '2025-10-13T08:30:00.000Z'，截取中间部分
  return d.toISOString().slice(0, 23).replace('T', ' ');
}

/**
 * 把从 MySQL 读到的 DB 字符串（或 Date）转成 ISO 8601 UTC 字符串。
 * 兼容 null/undefined（返回 null）。
 */
export function fromDbDate(value: string | Date | null | undefined): string | null {
  if (value === null || value === undefined || value === '') return null;
  if (value instanceof Date) return value.toISOString();
  const normalized = value.includes('T') ? value : value.replace(' ', 'T');
  const withZone = normalized.endsWith('Z') ? normalized : `${normalized}Z`;
  const d = new Date(withZone);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

/** 同 fromDbDate，但保证返回字符串（null 转 ''），用于 DTO 中必填字段。 */
export function fromDbDateSafe(value: string | Date | null | undefined): string {
  return fromDbDate(value) ?? '';
}

/** 当前时刻的 DB 可写格式（UTC）。 */
export function nowDb(): string {
  return toDbDate(new Date());
}
