import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import { parseUserWorkbook, USER_IMPORT_HEADERS } from '../utils/userExcel.js';
import type { Role } from '../types/domain.js';

const roles = new Map<string, { id: string; name: string; role: Role }>([
  ['考生', { id: 'examinee', name: '考生', role: 'examinee' }],
  ['examinee', { id: 'examinee', name: '考生', role: 'examinee' }],
  ['出题人', { id: 'author', name: '出题人', role: 'author' }],
  ['author', { id: 'author', name: '出题人', role: 'author' }],
  ['培训学员', { id: 'role-training', name: '培训学员', role: 'examinee' }],
]);
async function workbook(rows: string[][], header: string[] = [...USER_IMPORT_HEADERS]): Promise<Buffer> {
  const book = new ExcelJS.Workbook();
  const sheet = book.addWorksheet('用户导入'); sheet.addRow(header); rows.forEach(row => sheet.addRow(row));
  return Buffer.from(await book.xlsx.writeBuffer() as ArrayBuffer);
}
const options = { departments: new Map([['研发部', 'dept-rd']]), roles, minPasswordLength: 6 };

describe('用户导入直接分配角色', () => {
  it('按自定义角色名称解析，并依据考生身份要求科室', async () => {
    const result = await parseUserWorkbook(await workbook([['new_exam', '新考生', '培训学员', '研发部', '', '']]), options);
    expect(result.errors).toEqual([]);
    expect(result.validRows[0]).toMatchObject({ roleId: 'role-training', roleName: '培训学员', role: 'examinee', departmentId: 'dept-rd' });
    const invalid = await parseUserWorkbook(await workbook([['new_exam', '新考生', '培训学员', '', '', '']]), options);
    expect(invalid.errors[0].reason).toBe('考生必须填写科室');
  });
  it('兼容旧版角色名称与英文身份值', async () => {
    const result = await parseUserWorkbook(await workbook([['old_author', '旧出题人', 'author', '', '', '']]), options);
    expect(result.errors).toEqual([]);
    expect(result.validRows[0]).toMatchObject({ roleId: 'author', role: 'author' });
  });
  it('未知角色作为行错误返回，旧用户组模板提示重新下载', async () => {
    const invalid = await parseUserWorkbook(await workbook([['bad', '无效', '不存在', '', '', '']]), options);
    expect(invalid.errors[0]).toMatchObject({ column: '角色' });
    const header = [...USER_IMPORT_HEADERS] as string[]; header[2] = '用户组';
    await expect(parseUserWorkbook(await workbook([], header), options)).rejects.toThrow('用户组模板已停用');
  });
});
