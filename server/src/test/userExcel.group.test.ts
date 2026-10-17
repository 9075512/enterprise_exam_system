import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import { parseUserWorkbook, USER_IMPORT_HEADERS } from '../utils/userExcel.js';
import type { Role } from '../types/domain.js';

const groups = new Map<string, { id: string; name: string; role: Role }>([
  ['考生组', { id: 'role-group-examinee', name: '考生组', role: 'examinee' }],
  ['role-group-examinee', { id: 'role-group-examinee', name: '考生组', role: 'examinee' }],
  ['出题人组', { id: 'role-group-author', name: '出题人组', role: 'author' }],
  ['role-group-author', { id: 'role-group-author', name: '出题人组', role: 'author' }],
]);

async function workbook(rows: string[][]): Promise<Buffer> {
  const book = new ExcelJS.Workbook();
  const sheet = book.addWorksheet('用户导入');
  sheet.addRow([...USER_IMPORT_HEADERS]);
  rows.forEach((row) => sheet.addRow(row));
  return Buffer.from(await book.xlsx.writeBuffer() as ArrayBuffer);
}

describe('用户导入通过用户组派生角色', () => {
  it('按用户组名称解析角色', async () => {
    const result = await parseUserWorkbook(
      await workbook([['new_exam', '新考生', '考生组', '研发部', '', '']]),
      { departments: new Map([['研发部', 'dept-rd']]), groups, minPasswordLength: 6 },
    );
    expect(result.errors).toEqual([]);
    expect(result.validRows[0]).toMatchObject({
      groupId: 'role-group-examinee',
      groupName: '考生组',
      role: 'examinee',
      departmentId: 'dept-rd',
    });
  });

  it('兼容旧模板中的角色值，自动转到默认角色组', async () => {
    const result = await parseUserWorkbook(
      await workbook([['old_author', '旧出题人', '出题人', '', '', '']]),
      { departments: new Map(), groups, minPasswordLength: 6 },
    );
    expect(result.errors).toEqual([]);
    expect(result.validRows[0]).toMatchObject({ groupId: 'role-group-author', role: 'author' });
  });
});
