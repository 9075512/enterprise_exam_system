/**
 * Excel 导入工具（exceljs）：
 * - `buildTemplateBuffer()`：生成 .xlsx 模板（表头 12 列 + 示例行 + 「填写说明」工作表）。
 * - `parseQuestionWorkbook()`：读取第 1 个 sheet，逐行解析校验，返回 { errors, warnings, validRows }。
 *
 * 列 ↔ 索引约定（§4.6）：A=1 … L=12（exceljs 1-based）；错误明细 column 输出中文列名。
 */
import ExcelJS from 'exceljs';
import { fileInvalid } from './errors.js';
import type { PreviewResult, RowIssue, ValidRow, QuestionType } from '../types/domain.js';

/** 模板表头（第 1 行，12 列）。 */
export const IMPORT_HEADERS = [
  '题型',
  '题干',
  '选项A',
  '选项B',
  '选项C',
  '选项D',
  '选项E',
  '选项F',
  '正确答案',
  '分值',
  '解析',
  '科目',
] as const;

/** 允许的文件扩展名。 */
export const ALLOWED_EXTENSION = '.xlsx';

/** 导入模板可配置的上限参数（来自系统设置，避免与设置默认值形成第二事实来源）。 */
export interface ImportLimits {
  /** 单次导入最大数据行数 */
  maxRows: number;
  /** 上传文件大小上限（MB） */
  maxFileMb: number;
}

/** 选项字母（A~F，与列 C~H 对应）。 */
const OPTION_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];

/** 判断题「对」的等价写法（索引 0 = 正确）。 */
const JUDGE_TRUE = ['对', '正确', 'true', 'a', 't', '1', '是', '√', '✓'];
/** 判断题「错」的等价写法（索引 1 = 错误）。 */
const JUDGE_FALSE = ['错', '错误', 'false', 'b', 'f', '0', '否', '×', 'x', '✗'];

/** 归一化单元格值为去空白字符串（兼容富文本 / 公式结果 / 数字 / 日期）。 */
function cellText(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number') return String(value);
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'object') {
    const obj = value as unknown as Record<string, unknown>;
    const rich = obj.richText;
    if (Array.isArray(rich)) {
      return rich.map((t) => String((t as { text?: string }).text ?? '')).join('').trim();
    }
    if (typeof obj.text === 'string') return obj.text.trim();
    if (obj.result !== undefined && obj.result !== null) return String(obj.result).trim();
  }
  return String(value).trim();
}

/** 解析题型（兼容中文与英文）。 */
function parseType(raw: string): QuestionType | null {
  const v = raw.trim().toLowerCase();
  if (v === '单选' || v === 'single') return 'single';
  if (v === '多选' || v === 'multiple') return 'multiple';
  if (v === '判断' || v === 'judge') return 'judge';
  return null;
}

/** 解析单选/多选答案（提取字母 A~Z 映射为索引，去重升序）。 */
function parseChoiceAnswer(raw: string): number[] {
  const letters = raw.match(/[A-Za-z]/g) ?? [];
  const idx = letters.map((ch) => ch.toUpperCase().charCodeAt(0) - 'A'.charCodeAt(0));
  return [...new Set(idx)].sort((a, b) => a - b);
}

/** 解析判断题答案（对/错 → 0/1；不识别返回 null）。 */
function parseJudgeAnswer(raw: string): number | null {
  const v = raw.trim().toLowerCase();
  if (JUDGE_TRUE.includes(v)) return 0;
  if (JUDGE_FALSE.includes(v)) return 1;
  return null;
}

/** 生成导入模板 .xlsx（含示例与填写说明）。上限参数由调用方从系统设置读取后传入。 */
export async function buildTemplateBuffer(limits: ImportLimits): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'enterprise_exam_system';
  wb.created = new Date();

  const ws = wb.addWorksheet('试题导入');
  ws.addRow([...IMPORT_HEADERS]);
  ws.getRow(1).font = { bold: true };
  ws.getRow(1).alignment = { vertical: 'middle' };

  // 示例数据（1 单选 + 1 多选 + 1 判断）
  ws.addRow([
    '单选', '下列哪种行为符合公司信息安全规范？',
    '与同事共享工作账号', '使用个人密码并定期更换', '将密码贴在显示器上便于记忆', '通过公共 Wi-Fi 处理敏感数据',
    '', '', 'B', 10, '工作账号严禁共享；密码应个人保管、定期更换。', '安全知识',
  ]);
  ws.addRow([
    '多选', '以下哪些属于强密码的特征？',
    '包含大小写字母与数字', '长度不少于 8 位', '使用生日或手机号', '包含特殊字符',
    '', '', 'A,B,D', 10, '强密码应足够长并混合字符类型。', '安全知识',
  ]);
  ws.addRow([
    '判断', '在公共 Wi-Fi 环境下不应处理公司敏感数据。',
    '', '', '', '', '', '', '对', 10, '公共 Wi-Fi 存在被窃听风险。', '安全知识',
  ]);

  IMPORT_HEADERS.forEach((_, i) => {
    ws.getColumn(i + 1).width = i === 1 ? 40 : 18;
  });

  const info = wb.addWorksheet('填写说明');
  info.getColumn(1).width = 100;
  const lines: string[] = [
    '一、模板列说明（第 1 行为表头，请勿修改）',
    'A 题型（必填）：单选 / 多选 / 判断（亦接受 single / multiple / judge）',
    'B 题干（必填）：题目正文',
    'C~H 选项A~选项F：单选/多选至少填 2 项、最多 6 项且须从 A 起连续填写；判断题留空，系统自动填充 正确/错误',
    'I 正确答案（必填）：单选填 1 个字母（如 A）；多选填多个字母（如 ABD 或 A,B,D）；判断填 对/错',
    'J 分值：正数，缺省为 10',
    'K 解析：选填',
    'L 科目：选填；留空则使用目标题库名称，填写但与目标题库名称不一致时会给出黄色提示（不阻断导入）',
    '',
    '二、答案填写规范',
    '单选：单个选项字母，例如 A',
    '多选：多个字母连续填写或逗号分隔，例如 ABD 或 A,B,D（大小写不敏感）',
    '判断：对/错（兼容 正确/错误/A/B/true/false；A 或 正确 或 true 表示“对”）',
    '',
    '三、逐行校验规则（不通过的行会被跳过，并出现在错误明细中）',
    '1. 题型合法（仅支持 单选/多选/判断）',
    '2. 题干不能为空',
    '3. 选项数量与题型匹配（单选/多选 ≥2 且 ≤6；判断固定 2）',
    '4. 选项须从 A 起连续填写，不得出现空位后仍有内容',
    '5. 答案不得越界（引用不存在的选项）',
    '6. 单选/判断恰好 1 个答案；多选至少 2 个答案',
    '7. 分值必须为正数',
    '',
    '四、批量限制',
    `- 文件格式：.xlsx；大小 ≤ ${limits.maxFileMb}MB；单次数据行 ≤ ${limits.maxRows} 行`,
    '- 整行全空的行会被自动跳过，且不计入总行数',
  ];
  lines.forEach((t) => info.addRow([t]));

  const data = await wb.xlsx.writeBuffer();
  return Buffer.from(data as ArrayBuffer);
}

/** 逐行校验结果。 */
interface RowValidation {
  validRow?: ValidRow;
  rowErrors: RowIssue[];
  rowWarnings: RowIssue[];
}

/** 校验单行（7 条规则，reason 中文，column 中文列名）。 */
function validateImportRow(cells: string[], row: number, targetSubject: string): RowValidation {
  const rowErrors: RowIssue[] = [];
  const rowWarnings: RowIssue[] = [];

  const rawType = cells[0];
  const stem = cells[1];
  const optionCells = cells.slice(2, 8); // 选项A~F
  const rawAnswer = cells[8];
  const rawScore = cells[9];
  const analysis = cells[10];
  const rawSubject = cells[11];

  // 规则1：题型合法
  const type = parseType(rawType);
  if (!type) {
    rowErrors.push({ row, column: '题型', value: rawType, reason: `题型『${rawType}』不合法，仅支持 单选/多选/判断` });
  }

  // 规则2：题干非空
  if (!stem) {
    rowErrors.push({ row, column: '题干', value: stem, reason: '题干不能为空' });
  }

  // 题型非法时无法继续与题型相关的校验
  if (!type) return { rowErrors, rowWarnings };

  // 规则4 + 规则3：选项
  let options: string[];
  if (type === 'judge') {
    options = ['正确', '错误'];
  } else {
    const firstEmpty = optionCells.findIndex((c) => c === '');
    if (firstEmpty >= 0) {
      const laterFilled = optionCells.slice(firstEmpty + 1).some((c) => c !== '');
      if (laterFilled) {
        const nextFilled = optionCells.findIndex((c, i) => i > firstEmpty && c !== '');
        const emptyLetter = OPTION_LETTERS[firstEmpty];
        const nextLetter = OPTION_LETTERS[nextFilled] ?? '';
        rowErrors.push({
          row,
          column: `选项${emptyLetter}`,
          value: '',
          reason: `选项${emptyLetter}为空，但选项${nextLetter}已填写，请连续填写选项`,
        });
      }
    }
    options = optionCells.filter((c) => c !== '');
    if (options.length < 2) {
      const label = type === 'single' ? '单选题' : '多选题';
      rowErrors.push({ row, column: '选项', value: String(options.length), reason: `${label}至少需要 2 个选项` });
    }
  }

  // 规则5 + 规则6：答案
  let answer: number[] = [];
  if (type === 'judge') {
    const idx = parseJudgeAnswer(rawAnswer);
    if (idx === null) {
      rowErrors.push({
        row,
        column: '正确答案',
        value: rawAnswer,
        reason: `判断题答案『${rawAnswer}』不合法，请填写 对/错`,
      });
    } else {
      answer = [idx];
    }
  } else {
    answer = parseChoiceAnswer(rawAnswer);
    if (answer.length === 0) {
      rowErrors.push({ row, column: '正确答案', value: rawAnswer, reason: '请填写正确答案' });
    } else {
      const outOfRange = answer.find((i) => i >= options.length);
      const availableLetters = OPTION_LETTERS.slice(0, options.length).join('、');
      if (outOfRange !== undefined) {
        const letter = OPTION_LETTERS[outOfRange] ?? String(outOfRange + 1);
        rowErrors.push({
          row,
          column: '正确答案',
          value: rawAnswer,
          reason: `答案 ${letter} 越界（当前选项仅 ${availableLetters || '（无）'}）`,
        });
      } else if (type === 'single' && answer.length !== 1) {
        rowErrors.push({ row, column: '正确答案', value: rawAnswer, reason: '单选题必须且只能有 1 个正确答案' });
      } else if (type === 'multiple' && answer.length < 2) {
        rowErrors.push({ row, column: '正确答案', value: rawAnswer, reason: '多选题至少需要选择 2 个正确答案' });
      }
    }
  }

  // 规则7：分值
  let defaultScore = 10;
  if (rawScore !== '') {
    const n = Number(rawScore);
    if (!Number.isFinite(n) || n <= 0) {
      rowErrors.push({ row, column: '分值', value: rawScore, reason: `分值『${rawScore}』不合法，必须为正数` });
    } else {
      defaultScore = n;
    }
  }

  if (rowErrors.length > 0) return { rowErrors, rowWarnings };

  // 科目：为空使用题库名称；有值且不一致 → 警告（不阻断）
  const subject = rawSubject || targetSubject;
  if (rawSubject && rawSubject !== targetSubject) {
    rowWarnings.push({
      row,
      column: '科目',
      value: rawSubject,
      reason: `与目标题库名称『${targetSubject}』不一致，将保留该科目`,
    });
  }

  const validRow: ValidRow = {
    row,
    type,
    stem,
    options: type === 'judge' ? ['正确', '错误'] : options,
    answer,
    defaultScore,
    analysis,
    subject,
  };
  return { validRow, rowErrors: [], rowWarnings };
}

/**
 * 解析导入工作簿（第 1 个 sheet），逐行校验。
 * @param buffer .xlsx 二进制内容
 * @param targetSubject 目标题库名称（用于科目默认值与一致性告警）
 */
export async function parseQuestionWorkbook(buffer: Buffer, targetSubject: string): Promise<PreviewResult> {
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(buffer as unknown as ArrayBuffer);
  } catch {
    throw fileInvalid('无法解析该文件，请确认是有效的 .xlsx 文件');
  }
  const ws = wb.worksheets[0];
  if (!ws) throw fileInvalid('Excel 文件不包含工作表');

  const errors: RowIssue[] = [];
  const warnings: RowIssue[] = [];
  const validRows: ValidRow[] = [];
  let totalRows = 0;

  const rowCount = ws.rowCount;
  for (let r = 2; r <= rowCount; r += 1) {
    const row = ws.getRow(r);
    const cells = IMPORT_HEADERS.map((_, idx) => cellText(row.getCell(idx + 1).value));
    // 整行全空 → 跳过且不计入总行数
    if (cells.every((c) => c === '')) continue;

    totalRows += 1;
    const { validRow, rowErrors, rowWarnings } = validateImportRow(cells, r, targetSubject);
    if (rowErrors.length > 0) {
      errors.push(...rowErrors);
    } else if (validRow) {
      validRows.push(validRow);
      if (rowWarnings.length > 0) warnings.push(...rowWarnings);
    }
  }

  const successCount = validRows.length;
  const failCount = totalRows - successCount;
  return { totalRows, successCount, failCount, errors, warnings, validRows };
}
