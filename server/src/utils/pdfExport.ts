/**
 * PDF 导出工具（pdfkit）：把「标题 + 摘要 + 数据表」渲染成 .pdf Buffer。
 *
 * - 中文字体：pdfkit 默认字体不含 CJK 字形，必须注入一个支持中文的 TTF。
 *   字体解析优先级：环境变量 `PDF_FONT_PATH` → 常见 Windows 中文字体 → 明确报错。
 * - 列定义复用 `utils/excelExport.js` 的 `ExportColumn`（成绩导出同一套白名单）。
 * - 表格：表头蓝底白字、数据行浅灰隔行、自动分页并重绘表头。
 */
import PDFDocument from 'pdfkit';
import fs from 'node:fs';
import type { ExportColumn } from './excelExport.js';

/** 中文字体候选路径（优先单文件 TTF；TTC 集合 pdfkit/fontkit 兼容性不稳，不作首选）。 */
const CJK_FONT_CANDIDATES: readonly string[] = [
  'C:/Windows/Fonts/simhei.ttf', // 黑体
  'C:/Windows/Fonts/simkai.ttf', // 楷体
  'C:/Windows/Fonts/Deng.ttf', // 等线
  'C:/Windows/Fonts/NotoSansSC-VF.ttf', // Noto Sans SC（可变字体）
  '/System/Library/Fonts/PingFang.ttc', // macOS 苹方（TTC）
  '/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc', // Linux Noto（TTC）
];

/** 解析中文字体文件路径（找不到时抛出可操作错误）。 */
export function resolveCjkFontPath(): string {
  if (process.env.PDF_FONT_PATH) {
    if (fs.existsSync(process.env.PDF_FONT_PATH)) return process.env.PDF_FONT_PATH;
    throw new Error(`PDF_FONT_PATH 指向的字体文件不存在：${process.env.PDF_FONT_PATH}`);
  }
  for (const p of CJK_FONT_CANDIDATES) {
    if (fs.existsSync(p)) return p;
  }
  throw new Error(
    '未找到可用的中文字体，无法生成 PDF。请设置环境变量 PDF_FONT_PATH 指向一个支持中文的 .ttf 字体文件',
  );
}

/** PDF 表格列（复用 Excel 导出列定义，取值函数统一转字符串）。 */
export interface PdfColumn<T> extends ExportColumn<T> {}

/** PDF 生成入参。 */
export interface PdfBuildInput<T> {
  /** 文档标题（如考试名称） */
  title: string;
  /** 副标题 / 摘要行（可空） */
  subtitle?: string;
  columns: PdfColumn<T>[];
  rows: T[];
}

const PAGE_MARGIN = 48; // 页边距（pt）
const CELL_PADDING_X = 6;
const CELL_PADDING_Y = 5;
const MIN_ROW_HEIGHT = 18;
const HEADER_COLOR = '#1d4ed8';
const HEADER_TEXT = '#ffffff';
const ROW_ALT = '#f6f8fb';
const BORDER_COLOR = '#dbe1ea';
const TEXT_COLOR = '#1f2937';
const MUTED_COLOR = '#6b7280';

/** 把单元格值转为可渲染字符串。 */
function cellText<T>(col: PdfColumn<T>, row: T): string {
  const v = col.value(row);
  if (v === null || v === undefined) return '';
  return String(v);
}

/**
 * 生成 PDF Buffer。
 * 表格列宽按 `col.width`（字符数提示）等比分配；行高按单元格文本换行后的高度自适应。
 */
export function buildPdfBuffer<T>(input: PdfBuildInput<T>): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const fontPath = resolveCjkFontPath();
    const doc = new PDFDocument({
      size: 'A4',
      margin: PAGE_MARGIN,
      bufferPages: true,
      info: { Title: input.title, Producer: 'enterprise_exam_system' },
    });

    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc.registerFont('cjk', fontPath);
    doc.font('cjk');

    const pageWidth = doc.page.width;
    const contentWidth = pageWidth - PAGE_MARGIN * 2;

    // 列宽：按字符数提示等比分配到内容宽
    const totalHint = input.columns.reduce((s, c) => s + (c.width || 10), 0);
    const colWidths = input.columns.map((c) => (contentWidth * (c.width || 10)) / totalHint);

    // 标题
    doc.fontSize(18).fillColor(TEXT_COLOR).text(input.title, PAGE_MARGIN, PAGE_MARGIN, {
      width: contentWidth,
      ellipsis: true,
    });
    let y = doc.y + 6;

    // 副标题 / 摘要
    if (input.subtitle) {
      doc.fontSize(10).fillColor(MUTED_COLOR).text(input.subtitle, PAGE_MARGIN, y, {
        width: contentWidth,
      });
      y = doc.y + 10;
    }

    const bottomLimit = doc.page.height - PAGE_MARGIN;

    /** 判断是否需分页；需要则新增一页并返回新的 y。 */
    function ensureSpace(needed: number): number {
      if (y + needed > bottomLimit) {
        doc.addPage();
        y = PAGE_MARGIN;
      }
      return y;
    }

    /** 绘制表头行（分页后重绘）。 */
    function drawHeader(): number {
      const rowY = y;
      let x = PAGE_MARGIN;
      doc.fontSize(9).fillColor(HEADER_TEXT);
      input.columns.forEach((col, i) => {
        const w = colWidths[i];
        doc.rect(x, rowY, w, MIN_ROW_HEIGHT).fill(HEADER_COLOR);
        doc
          .fillColor(HEADER_TEXT)
          .fontSize(9)
          .text(col.header, x + CELL_PADDING_X, rowY + CELL_PADDING_Y, {
            width: w - CELL_PADDING_X * 2,
            lineBreak: false,
            ellipsis: true,
          });
        x += w;
      });
      y = rowY + MIN_ROW_HEIGHT;
      return y;
    }

    drawHeader();

    input.rows.forEach((row, rowIndex) => {
      // 计算本行各单元格换行后的高度
      let maxHeight = MIN_ROW_HEIGHT;
      const cellHeights = input.columns.map((col, i) => {
        const text = cellText(col, row);
        const h =
          text === ''
            ? MIN_ROW_HEIGHT
            : doc.heightOfString(text, { width: colWidths[i] - CELL_PADDING_X * 2 }) + CELL_PADDING_Y * 2;
        if (h > maxHeight) maxHeight = h;
        return h;
      });

      ensureSpace(maxHeight);
      const rowY = y;
      let x = PAGE_MARGIN;

      input.columns.forEach((col, i) => {
        const w = colWidths[i];
        // 隔行浅灰底
        if (rowIndex % 2 === 1) {
          doc.rect(x, rowY, w, maxHeight).fill(ROW_ALT);
        }
        // 边框
        doc.rect(x, rowY, w, maxHeight).strokeColor(BORDER_COLOR).lineWidth(0.5).stroke();
        // 文本（垂直居中）
        const text = cellText(col, row);
        const textH = doc.heightOfString(text, { width: w - CELL_PADDING_X * 2 });
        const ty = rowY + Math.max(CELL_PADDING_Y, (maxHeight - textH) / 2);
        doc
          .fillColor(TEXT_COLOR)
          .fontSize(9)
          .text(text, x + CELL_PADDING_X, ty, { width: w - CELL_PADDING_X * 2, lineBreak: true });
        x += w;
      });

      y = rowY + maxHeight;
    });

    doc.end();
  });
}
