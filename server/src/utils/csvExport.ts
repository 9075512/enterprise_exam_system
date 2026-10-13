/**
 * CSV 导出工具（零依赖）。
 *
 * 与 `./excelExport.ts`（exceljs 渲染 .xlsx）职责互补：本文件只做「二维数组 → CSV 文本」，
 * 表头文案与取值一律由调用方提供（见 `modules/audit/audit.columns.ts`）。
 *
 * 兼容性约定：
 * - 输出带 UTF-8 BOM，保证 Excel 直接双击打开不乱码；
 * - 字段按 RFC 4180 转义（含 `"` `,` `\n` `\r` 时用双引号包裹并把 `"` 转义为 `""`）；
 * - 换行统一用 CRLF。
 */

/** 单个字段转义。 */
export function escapeCsvField(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '';
  const text = String(value);
  if (text === '') return '';
  if (/[",\r\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

/**
 * 把「表头 + 行数据」渲染为 CSV 文本（含 BOM，CRLF 换行）。
 * @param header 中文表头
 * @param rows   数据行（每个单元格为 string / number / null）
 */
export function buildCsv(header: string[], rows: Array<Array<string | number | null>>): string {
  const lines: string[] = [header.map(escapeCsvField).join(',')];
  for (const row of rows) {
    lines.push(row.map(escapeCsvField).join(','));
  }
  return `\uFEFF${lines.join('\r\n')}\r\n`;
}

/** 把 CSV 文本转成 Buffer（UTF-8）。 */
export function buildCsvBuffer(header: string[], rows: Array<Array<string | number | null>>): Buffer {
  return Buffer.from(buildCsv(header, rows), 'utf8');
}
