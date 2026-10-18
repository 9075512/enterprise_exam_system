/**
 * 用户批量导入 Excel 工具（exceljs）。
 * 列（A~F，6 列）：登录账号 / 姓名 / 角色 / 科室 / 邮箱 / 初始密码(可选)。
 * 基础身份由角色派生；科室按名称解析为 department_id，考生身份角色必填科室。
 */
import ExcelJS from 'exceljs';
import { fileInvalid } from './errors.js';
import type { Role, RowIssue, UserPreviewResult, UserValidRow } from '../types/domain.js';

/** 用户导入模板表头。 */
export const USER_IMPORT_HEADERS = ['登录账号', '姓名', '角色', '科室', '邮箱', '初始密码'] as const;

/** 兼容旧模板：原「角色」值映射到对应内置角色。 */
const LEGACY_ROLE_MAP: Record<string, Role> = {
  管理员: 'admin',
  出题人: 'author',
  考生: 'examinee',
  admin: 'admin',
  author: 'author',
  examinee: 'examinee',
};

/** 归一化单元格文本。 */
function cellText(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number') return String(value);
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'object') {
    const obj = value as unknown as Record<string, unknown>;
    if (Array.isArray(obj.richText)) {
      return obj.richText.map((t) => String((t as { text?: string }).text ?? '')).join('').trim();
    }
    if (typeof obj.text === 'string') return obj.text.trim();
    if (obj.result !== undefined && obj.result !== null) return String(obj.result).trim();
  }
  return String(value).trim();
}

/** 生成用户导入模板 .xlsx（含示例 + 填写说明）。 */
export async function buildUserTemplateBuffer(limits: { maxRows: number; maxFileMb: number }): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'enterprise_exam_system';
  wb.created = new Date();

  const ws = wb.addWorksheet('用户导入');
  ws.addRow([...USER_IMPORT_HEADERS]);
  ws.getRow(1).font = { bold: true };
  ws.addRow(['zhangsan', '张三', '考生', '内科', 'zhangsan@example.com', '']);
  ws.addRow(['lisi', '李四', '出题人', '', 'lisi@example.com', '123456']);
  ws.addRow(['wangwu', '王五', '管理员', '', '', '']);
  USER_IMPORT_HEADERS.forEach((_, i) => {
    ws.getColumn(i + 1).width = i === 4 ? 26 : 16;
  });

  const info = wb.addWorksheet('填写说明');
  info.getColumn(1).width = 100;
  const lines = [
    '一、模板列说明（第 1 行为表头，请勿修改）',
    'A 登录账号（必填）：系统登录账号，全库唯一',
    'B 姓名（必填）：用户真实姓名',
    'C 角色（必填）：填写系统内已有角色名称（管理员、出题人、考生或自定义角色）',
    'D 科室（仅考生身份角色必填）：填写科室名称，须与系统内已有科室一致',
    'E 邮箱（选填）：用于邮件通知；留空则无',
    'F 初始密码（选填）：留空则使用系统默认密码',
    '',
    '二、批量限制',
    `- 文件格式：.xlsx；大小 ≤ ${limits.maxFileMb}MB；单次数据行 ≤ ${limits.maxRows} 行`,
    '- 整行全空的行会被自动跳过，且不计入总行数',
  ];
  lines.forEach((t) => info.addRow([t]));

  const data = await wb.xlsx.writeBuffer();
  return Buffer.from(data as ArrayBuffer);
}

/** 解析用户导入工作簿（第 1 个 sheet），逐行校验。 */
export async function parseUserWorkbook(
  buffer: Buffer,
  opts: {
    departments: Map<string, string>;
    roles: Map<string, { id: string; name: string; role: Role }>;
    minPasswordLength: number;
  },
): Promise<UserPreviewResult> {
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(buffer as unknown as ArrayBuffer);
  } catch {
    throw fileInvalid('无法解析该文件，请确认是有效的 .xlsx 文件');
  }
  const ws = wb.worksheets[0];
  if (!ws) throw fileInvalid('Excel 文件不包含工作表');

  const header = USER_IMPORT_HEADERS.map((_, idx) => cellText(ws.getRow(1).getCell(idx + 1).value));
  if (header[2] === '用户组') throw fileInvalid('用户组模板已停用，请下载新的角色导入模板');
  if (header.some((value, index) => value !== USER_IMPORT_HEADERS[index])) throw fileInvalid('模板表头不正确，请下载新的角色导入模板');

  const errors: RowIssue[] = [];
  const warnings: RowIssue[] = [];
  const validRows: UserValidRow[] = [];
  const seenUsernames = new Set<string>();
  let totalRows = 0;

  const rowCount = ws.rowCount;
  for (let r = 2; r <= rowCount; r += 1) {
    const row = ws.getRow(r);
    const cells = USER_IMPORT_HEADERS.map((_, idx) => cellText(row.getCell(idx + 1).value));
    if (cells.every((c) => c === '')) continue;
    totalRows += 1;

    const [username, name, roleRaw, department, email, password] = cells;
    const rowErrors: RowIssue[] = [];

    if (!username) rowErrors.push({ row: r, column: '登录账号', value: username, reason: '登录账号不能为空' });
    if (!name) rowErrors.push({ row: r, column: '姓名', value: name, reason: '姓名不能为空' });

    let definition = opts.roles.get(roleRaw);
    if (!definition) {
      const legacyRole = LEGACY_ROLE_MAP[roleRaw.trim().toLowerCase()] ?? LEGACY_ROLE_MAP[roleRaw.trim()];
      if (legacyRole) definition = opts.roles.get(legacyRole);
    }
    if (!definition) {
      rowErrors.push({ row: r, column: '角色', value: roleRaw, reason: `角色『${roleRaw}』不存在，请先在系统中创建` });
    }

    let departmentId = '';
    if (definition?.role === 'examinee') {
      if (!department) {
        rowErrors.push({ row: r, column: '科室', value: department, reason: '考生必须填写科室' });
      } else {
        const id = opts.departments.get(department);
        if (!id) {
          rowErrors.push({ row: r, column: '科室', value: department, reason: `科室『${department}』不存在，请先在系统中创建` });
        } else {
          departmentId = id;
        }
      }
    }

    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      rowErrors.push({ row: r, column: '邮箱', value: email, reason: `邮箱『${email}』格式不合法` });
    }

    if (password && password.length < opts.minPasswordLength) {
      rowErrors.push({
        row: r,
        column: '初始密码',
        value: password,
        reason: `初始密码长度不能少于 ${opts.minPasswordLength} 位`,
      });
    }

    if (username && seenUsernames.has(username)) {
      rowErrors.push({ row: r, column: '登录账号', value: username, reason: `登录账号『${username}』在文件中重复` });
    }

    if (rowErrors.length > 0) {
      errors.push(...rowErrors);
      continue;
    }

    if (username) seenUsernames.add(username);
    validRows.push({
      row: r,
      username,
      name,
      roleName: definition!.name,
      roleId: definition!.id,
      role: definition!.role,
      departmentName: department,
      departmentId,
      email,
      password,
    });
  }

  const successCount = validRows.length;
  const failCount = totalRows - successCount;
  return { totalRows, successCount, failCount, errors, warnings, validRows };
}
