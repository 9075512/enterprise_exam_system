/**
 * 单元测试：Excel 导入解析（7 条逐行校验规则 + 科目名称警告 + 空行跳过）
 * 以及导入落库的事务性（部分成功 / 中途致命错误整体回滚）。
 *
 * 说明：`validateImportRow` 未导出，故统一通过 `parseQuestionWorkbook` 驱动校验。
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import ExcelJS from 'exceljs';
import type { RowDataPacket } from 'mysql2/promise';
import { IMPORT_HEADERS, parseQuestionWorkbook } from '../utils/excel.js';
import * as importService from '../modules/import/import.service.js';
import * as questionsRepo from '../modules/questions/questions.repo.js';
import { withTransaction, query } from '../db/pool.js';
import { nowDb } from '../utils/datetime.js';
import { prepareTestDb } from './db.js';
import { closePool } from '../db/pool.js';

/** 组装一行 12 列的导入数据（选项列自动补空到 6 列）。 */
function line(
  type: string,
  stem: string,
  options: string[],
  answer: string,
  score: string | number,
  analysis: string,
  subject: string,
): (string | number)[] {
  const opts = [...options];
  while (opts.length < 6) opts.push('');
  return [type, stem, ...opts.slice(0, 6), answer, score, analysis, subject];
}

/** 生成一个仅含表头 + 给定数据行的 .xlsx Buffer。 */
async function buildWorkbook(rows: Array<Array<string | number>>): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('试题导入');
  ws.addRow([...IMPORT_HEADERS]);
  for (const r of rows) ws.addRow(r);
  const data = await wb.xlsx.writeBuffer();
  return Buffer.from(data as ArrayBuffer);
}

describe('Excel 导入解析（7 条校验规则）', () => {
  it('合法判断题：自动填充选项为 正确/错误，答案「对」→ 索引 0', async () => {
    const buf = await buildWorkbook([line('判断', '公共网络不应处理敏感数据', [], '对', 10, '解析', '安全知识')]);
    const res = await parseQuestionWorkbook(buf, '安全知识');
    expect(res.totalRows).toBe(1);
    expect(res.successCount).toBe(1);
    expect(res.errors).toHaveLength(0);
    expect(res.validRows[0]).toMatchObject({ type: 'judge', options: ['正确', '错误'], answer: [0], defaultScore: 10 });
  });

  it('规则1：题型不合法 → 报错列「题型」', async () => {
    const buf = await buildWorkbook([line('填空', '题干', ['A', 'B'], 'A', 10, '', '安全知识')]);
    const res = await parseQuestionWorkbook(buf, '安全知识');
    expect(res.successCount).toBe(0);
    expect(res.errors.some((e) => e.column === '题型')).toBe(true);
  });

  it('规则2：题干为空 → 报错列「题干」', async () => {
    const buf = await buildWorkbook([line('单选', '', ['A', 'B'], 'A', 10, '', '安全知识')]);
    const res = await parseQuestionWorkbook(buf, '安全知识');
    expect(res.successCount).toBe(0);
    expect(res.errors.some((e) => e.column === '题干' && e.reason.includes('题干不能为空'))).toBe(true);
  });

  it('规则3：单选/多选选项不足 2 个 → 报错', async () => {
    const buf = await buildWorkbook([line('单选', '题干', ['仅一个选项'], 'A', 10, '', '安全知识')]);
    const res = await parseQuestionWorkbook(buf, '安全知识');
    expect(res.successCount).toBe(0);
    expect(res.errors.some((e) => e.reason.includes('至少需要 2 个选项'))).toBe(true);
  });

  it('规则4：选项不连续（B 空但 C 有值）→ 报错', async () => {
    const buf = await buildWorkbook([line('单选', '题干', ['A', '', 'C'], 'A', 10, '', '安全知识')]);
    const res = await parseQuestionWorkbook(buf, '安全知识');
    expect(res.successCount).toBe(0);
    expect(res.errors.some((e) => e.reason.includes('请连续填写选项'))).toBe(true);
  });

  it('规则5：答案越界引用不存在的选项 → 报错', async () => {
    const buf = await buildWorkbook([line('单选', '题干', ['A', 'B', 'C'], 'D', 10, '', '安全知识')]);
    const res = await parseQuestionWorkbook(buf, '安全知识');
    expect(res.successCount).toBe(0);
    expect(res.errors.some((e) => e.reason.includes('越界'))).toBe(true);
  });

  it('规则6a：单选题给了 2 个答案 → 报错', async () => {
    const buf = await buildWorkbook([line('单选', '题干', ['A', 'B', 'C', 'D'], 'AB', 10, '', '安全知识')]);
    const res = await parseQuestionWorkbook(buf, '安全知识');
    expect(res.successCount).toBe(0);
    expect(res.errors.some((e) => e.reason.includes('单选题必须且只能有 1 个正确答案'))).toBe(true);
  });

  it('规则6b：多选题只给了 1 个答案 → 报错', async () => {
    const buf = await buildWorkbook([line('多选', '题干', ['A', 'B'], 'A', 10, '', '安全知识')]);
    const res = await parseQuestionWorkbook(buf, '安全知识');
    expect(res.successCount).toBe(0);
    expect(res.errors.some((e) => e.reason.includes('多选题至少需要选择 2 个正确答案'))).toBe(true);
  });

  it('规则7：分值非正 → 报错', async () => {
    const buf = await buildWorkbook([line('单选', '题干', ['A', 'B'], 'A', 0, '', '安全知识')]);
    const res = await parseQuestionWorkbook(buf, '安全知识');
    expect(res.successCount).toBe(0);
    expect(res.errors.some((e) => e.column === '分值' && e.reason.includes('必须为正数'))).toBe(true);
  });

  it('科目与目标题库名称不一致 → 警告（不阻断导入）', async () => {
    const buf = await buildWorkbook([line('单选', '题干', ['A', 'B'], 'A', 10, '', '其它科目')]);
    const res = await parseQuestionWorkbook(buf, '安全知识');
    expect(res.successCount).toBe(1);
    expect(res.warnings.some((w) => w.column === '科目')).toBe(true);
    expect(res.validRows[0].subject).toBe('其它科目');
  });

  it('整行全空自动跳过且不计入总行数', async () => {
    const empty = new Array<string | number>(12).fill('');
    const buf = await buildWorkbook([empty, line('单选', '有效题', ['A', 'B'], 'A', 10, '', '安全知识')]);
    const res = await parseQuestionWorkbook(buf, '安全知识');
    expect(res.totalRows).toBe(1);
    expect(res.successCount).toBe(1);
  });
});

describe('导入落库事务（部分成功 + 中途失败整体回滚）', () => {
  beforeAll(async () => {
    await prepareTestDb();
  }, 30000);

  afterAll(async () => {
    await closePool();
  });

  /** 统计指定题库内某题干的数量。 */
  async function countByStem(bankId: string, stem: string): Promise<number> {
    const rows = await query<RowDataPacket[]>(
      'SELECT COUNT(*) AS c FROM questions WHERE bank_id = ? AND stem = ?',
      [bankId, stem],
    );
    return Number(rows[0]?.c ?? 0);
  }

  it('commit：Excel 科目不再单独落库，统一归一为目标题库名称', async () => {
    const res = await importService.commit(
      {
        bankId: 'bank-security',
        fileName: 'partial.xlsx',
        validRows: [
          { row: 2, type: 'single', stem: '合法导入题A', options: ['选项一', '选项二'], answer: [0], defaultScore: 10, analysis: '', subject: '安全知识' },
          { row: 3, type: 'single', stem: '超长科目导入题', options: ['选项一', '选项二'], answer: [0], defaultScore: 10, analysis: '', subject: 's'.repeat(100) },
        ],
        errors: [],
      },
      { id: 'user-author', role: 'author' },
    );
    expect(res.successCount).toBe(2);
    expect(res.failCount).toBe(0);
    expect(res.totalRows).toBe(2);
    // 科目就是题库：即使文件中的科目文本过长，也由目标题库名称覆盖。
    expect(await countByStem('bank-security', '合法导入题A')).toBe(1);
    expect(await countByStem('bank-security', '超长科目导入题')).toBe(1);
    const rows = await query<RowDataPacket[]>(
      `SELECT subject, subject_id FROM questions WHERE bank_id = ? AND stem = ? LIMIT 1`,
      ['bank-security', '超长科目导入题'],
    );
    expect(rows[0]?.subject).toBe('安全知识题库');
    expect(rows[0]?.subject_id).toBe('bank-security');
  });

  it('commit：批次写入失败 → 已写入的题目连同批次整体回滚', async () => {
    const before = await countByStem('bank-security', '回滚验证题');
    await expect(
      importService.commit(
        {
          bankId: 'bank-security',
          // file_name 列长度 255，超长在 STRICT 模式下抛错 → 触发事务回滚
          fileName: 'x'.repeat(300),
          validRows: [
            { row: 2, type: 'single', stem: '回滚验证题', options: ['选项一', '选项二'], answer: [0], defaultScore: 10, analysis: '', subject: '安全知识' },
          ],
          errors: [],
        },
        { id: 'user-author', role: 'author' },
      ),
    ).rejects.toThrow();
    // 题目应先被写入、再随事务回滚 → 最终不存在
    expect(await countByStem('bank-security', '回滚验证题')).toBe(before);
  });

  it('withTransaction：中途异常 → 先前写入整体回滚（主键冲突）', async () => {
    const id = 'q-rollback-dup';
    await expect(
      withTransaction(async (conn) => {
        const row = {
          id,
          bankId: 'bank-security',
          type: 'single' as const,
          stem: '事务回滚验证',
          options: ['选项一', '选项二'],
          answer: [0],
          defaultScore: 5,
          analysis: '',
          subject: '安全知识',
          createdBy: 'user-author',
          createdAt: nowDb(),
        };
        await questionsRepo.insert(row, conn);
        // 同一主键再次插入 → 抛错 → 整个事务回滚
        await questionsRepo.insert(row, conn);
      }),
    ).rejects.toThrow();

    const rows = await query<RowDataPacket[]>('SELECT COUNT(*) AS c FROM questions WHERE id = ?', [id]);
    expect(Number(rows[0]?.c ?? 0)).toBe(0);
  });
});
