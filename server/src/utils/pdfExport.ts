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
      input.columns.forEach((col, i) => {
        const text = cellText(col, row);
        const h =
          text === ''
            ? MIN_ROW_HEIGHT
            : doc.heightOfString(text, { width: colWidths[i] - CELL_PADDING_X * 2 }) + CELL_PADDING_Y * 2;
        if (h > maxHeight) maxHeight = h;
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

/* ============================ 试卷 PDF（v1.7①） ============================ */

/** 试卷中的一道题（已由服务层转好可渲染文本）。 */
export interface PaperPdfQuestion {
  /** 题号（1-based，与组卷页一致） */
  index: number;
  /** 题型中文名（单选/多选/判断/填空/简答） */
  typeLabel: string;
  /** 题干 */
  stem: string;
  /** 选项文本（无选项为空数组） */
  options: string[];
  /** 本题分值 */
  score: number;
  /** 答案文本（答案版显示；考生版忽略） */
  answerText: string;
  /** 解析（答案版显示，可空） */
  analysis: string;
}

/** 试卷 PDF 生成入参。 */
export interface PaperPdfInput {
  title: string;
  subtitle?: string;
  questions: PaperPdfQuestion[];
  /** 是否输出答案版（含参考答案与解析） */
  withAnswer: boolean;
  /** 页脚说明（可空） */
  footer?: string;
}

const ANSWER_COLOR = '#1d4ed8';
const OPTION_LETTERS = 'ABCDEFGHIJ';

/**
 * 生成试卷 PDF Buffer（题目列表式排版，非表格）。
 * 题干 / 选项 / 答案 / 解析逐块写入，自动换行与分页。
 */
export function buildPaperPdfBuffer(input: PaperPdfInput): Promise<Buffer> {
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
    const bottomLimit = doc.page.height - PAGE_MARGIN;
    let y = PAGE_MARGIN;

    /** 空间不足则换页。 */
    function ensureSpace(needed: number): void {
      if (y + needed > bottomLimit) {
        doc.addPage();
        y = PAGE_MARGIN;
      }
    }

    /** 写入一段文本（自动换行 + 分页），推进 y。 */
    function writeBlock(
      text: string,
      opts: { size: number; color: string; indent?: number; gapAfter?: number },
    ): void {
      const indent = opts.indent ?? 0;
      const width = contentWidth - indent;
      doc.fontSize(opts.size);
      const h = doc.heightOfString(text, { width });
      ensureSpace(h + (opts.gapAfter ?? 0));
      doc.fillColor(opts.color).fontSize(opts.size).text(text, PAGE_MARGIN + indent, y, { width });
      y += h + (opts.gapAfter ?? 0);
    }

    writeBlock(input.title, { size: 18, color: TEXT_COLOR, gapAfter: 6 });
    if (input.subtitle) {
      writeBlock(input.subtitle, { size: 10, color: MUTED_COLOR, gapAfter: 12 });
    }

    for (const q of input.questions) {
      writeBlock(`${q.index}.（${q.typeLabel}，${q.score} 分）${q.stem}`, {
        size: 11,
        color: TEXT_COLOR,
        gapAfter: 4,
      });

      q.options.forEach((opt, i) => {
        writeBlock(`${OPTION_LETTERS[i] ?? String(i + 1)}. ${opt}`, {
          size: 10.5,
          color: TEXT_COLOR,
          indent: 16,
          gapAfter: 2,
        });
      });
      if (q.options.length > 0) y += 3;

      if (input.withAnswer) {
        const label = q.typeLabel === '简答' ? '参考答案' : '答案';
        writeBlock(`${label}：${q.answerText || '（无）'}`, {
          size: 10,
          color: ANSWER_COLOR,
          indent: 16,
          gapAfter: 2,
        });
        if (q.analysis) {
          writeBlock(`解析：${q.analysis}`, { size: 10, color: MUTED_COLOR, indent: 16, gapAfter: 2 });
        }
      }

      y += 8;
      ensureSpace(1);
      doc
        .strokeColor(BORDER_COLOR)
        .lineWidth(0.5)
        .moveTo(PAGE_MARGIN, y - 4)
        .lineTo(pageWidth - PAGE_MARGIN, y - 4)
        .stroke();
    }

    if (input.footer) {
      ensureSpace(24);
      doc.fillColor(MUTED_COLOR).fontSize(9).text(input.footer, PAGE_MARGIN, y + 6, { width: contentWidth });
    }

    doc.end();
  });
}
