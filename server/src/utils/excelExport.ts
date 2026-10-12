/**
 * Excel 导出工具（exceljs）：把「已确定的列与行」渲染成 .xlsx Buffer。
 *
 * 与 `./excel.ts`（题库导入：模板生成 + 上传解析）职责分离：
 * 本文件不含业务校验与列定义，表头文案、列宽、取值一律由调用方提供
 * （成绩导出见 `modules/reports/reports.columns.ts`）。
 */
import ExcelJS from 'exceljs';

/** 导出列定义：key 为稳定业务键（白名单校验用），value 从行对象取值。 */
export interface ExportColumn<T> {
  /** 稳定业务键（白名单校验用） */
  key: string;
  /** 中文表头 */
  header: string;
  /** 列宽（字符数） */
  width: number;
  /** 取值函数：返回字符串 / 数字 / 空 */
  value: (row: T) => string | number | null;
}

/** 单个工作表：名称 + 列定义 + 行数据。 */
export interface ExportSheet<T> {
  name: string;
  columns: ExportColumn<T>[];
  rows: T[];
}

/**
 * 把若干工作表渲染成单个 .xlsx 文件（返回 Buffer）。
 * 每个 sheet：第 1 行表头（加粗、居中、高亮、高 22），冻结首行，有数据时自动筛选，
 * 数据行按 `columns[i].value(row)` 写入，并按 `columns[i].width` 设置列宽。
 */
export async function buildExportBuffer<T>(sheets: Array<ExportSheet<T>>): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'enterprise_exam_system';
  wb.created = new Date();

  for (const sheet of sheets) {
    const ws = wb.addWorksheet(sheet.name);

    // 表头（第 1 行）
    const headerRow = ws.addRow(sheet.columns.map((c) => c.header));
    headerRow.font = { bold: true };
    headerRow.height = 22;
    headerRow.alignment = { vertical: 'middle', horizontal: 'center' };
    headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEFF6FF' } };

    // 列宽
    sheet.columns.forEach((c, i) => {
      ws.getColumn(i + 1).width = c.width;
    });

    // 数据行
    for (const row of sheet.rows) {
      ws.addRow(sheet.columns.map((c) => c.value(row)));
    }

    // 冻结首行
    ws.views = [{ state: 'frozen', ySplit: 1 }];

    // 有数据时启用自动筛选（仅表头行）
    if (sheet.rows.length > 0 && sheet.columns.length > 0) {
      ws.autoFilter = {
        from: { row: 1, column: 1 },
        to: { row: 1, column: sheet.columns.length },
      };
    }
  }

  return Buffer.from((await wb.xlsx.writeBuffer()) as ArrayBuffer);
}
