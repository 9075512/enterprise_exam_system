import { examContent } from '../../test/examFixtures.js';
/**
 * 集成测试：GET /api/reports/exams/:id/export —— 成绩明细 XLSX 导出（可勾选列）。
 * - 响应为「裸二进制」，故用自定义 parser 收集 Buffer，再用 exceljs 读回工作簿断言；
 * - 覆盖：鉴权、考试不存在、默认列、数据一致性、勾选列、列序稳定、非法/空列、
 *   去重、一人多次作答只取最新、时区偏移生效。
 * 通过 supertest 驱动 Express，数据落在测试库 enterprise_exam_system_test。
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import ExcelJS from 'exceljs';
import { app } from '../../app.js';
import { prepareTestDb } from '../../test/db.js';
import { closePool } from '../../db/pool.js';
import { signToken } from '../../middleware/auth.js';

/** 构造 Bearer 请求头。 */
const bearer = (token: string): { Authorization: string } => ({ Authorization: `Bearer ${token}` });

const admin = signToken({ sub: 'user-admin', role: 'admin', departmentId: '' });
const zs = signToken({ sub: 'user-zhangsan', role: 'examinee', departmentId: 'dept-rd' });

/** 裸二进制响应解析器：把响应体收集为 Buffer。 */
function binaryParser(res: { on: (event: string, cb: (c?: Buffer) => void) => void }, cb: (err: null, body: Buffer) => void) {
  const chunks: Buffer[] = [];
  res.on('data', (c?: Buffer) => chunks.push(Buffer.from(c ?? [])));
  res.on('end', () => cb(null, Buffer.concat(chunks)));
}

/** 带管理员 Token 的二进制 GET。 */
const getBinary = (url: string, token: string, query: Record<string, unknown> = {}) =>
  request(app)
    .get(url)
    .set(bearer(token))
    .query(query)
    .buffer(true)
    .parse(binaryParser as never);

/** 读回工作簿的第 1 个工作表。 */
async function loadSheet(buffer: Buffer): Promise<ExcelJS.Worksheet> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  const ws = wb.worksheets[0];
  if (!ws) throw new Error('导出文件不含工作表');
  return ws;
}

/** 读取某行的单元格文本（1-based 列）。 */
function rowText(ws: ExcelJS.Worksheet, rowNo: number): string[] {
  const row = ws.getRow(rowNo);
  const out: string[] = [];
  for (let c = 1; c <= row.cellCount; c += 1) out.push(String(row.getCell(c).value ?? ''));
  return out;
}

/** 管理员创建一场考试，返回 examId。 */
async function createExam(name: string, maxAttempts = 1): Promise<string> {
  const res = await request(app)
    .post('/api/exams')
    .set(bearer(admin))
    .send({
      name,
      ...(await examContent('paper-demo')),
      departmentIds: ['dept-rd'],
      startTime: new Date(Date.now() - 3600_000).toISOString(),
      endTime: new Date(Date.now() + 3600_000).toISOString(),
      durationMinutes: 30,
      passScore: 60,
      maxAttempts,
    });
  expect(res.body.code).toBe(0);
  return res.body.data.id as string;
}

/** 考生开考并交卷一次，返回记录 id。 */
async function startAndSubmit(examId: string, token: string): Promise<string> {
  const start = await request(app).post(`/api/exams/${examId}/start`).set(bearer(token));
  expect(start.body.code).toBe(0);
  const recordId = start.body.data.id as string;
  const submit = await request(app).post(`/api/records/${recordId}/submit`).set(bearer(token)).send({});
  expect(submit.body.code).toBe(0);
  return recordId;
}

describe('GET /api/reports/exams/:id/export 成绩明细导出', () => {
  let basicExam = '';
  let multiExam = '';
  let basicRecord = '';

  beforeAll(async () => {
    await prepareTestDb();
    // 单次作答考试：张三交卷一次（用于默认列 / 数据一致性 / 时区断言）
    basicExam = await createExam('导出测试考试', 1);
    basicRecord = await startAndSubmit(basicExam, zs);
    // 多次作答考试：张三交卷两次（用于「只导最新一次」断言）
    multiExam = await createExam('多次作答考试', 2);
    await startAndSubmit(multiExam, zs);
    await startAndSubmit(multiExam, zs);
  }, 30000);

  afterAll(async () => {
    await closePool();
  });

  it('无 Token → 401/1002', async () => {
    const res = await request(app).get(`/api/reports/exams/${basicExam}/export`);
    expect(res.status).toBe(401);
    expect(res.body.code).toBe(1002);
  });

  it('考生 Token → 403/1003', async () => {
    const res = await request(app).get(`/api/reports/exams/${basicExam}/export`).set(bearer(zs));
    expect(res.status).toBe(403);
    expect(res.body.code).toBe(1003);
  });

  it('考试不存在 → 404/1004', async () => {
    const res = await request(app)
      .get('/api/reports/exams/no-such-exam/export')
      .set(bearer(admin));
    expect(res.status).toBe(404);
    expect(res.body.code).toBe(1004);
  });

  it('不传 columns → 200，xlsx 响应头 + 默认 8 列中文表头', async () => {
    const res = await getBinary(`/api/reports/exams/${basicExam}/export`, admin);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain(
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    expect(res.headers['content-disposition']).toContain("filename*=UTF-8''");
    expect(res.headers['content-disposition']).toContain('attachment;');

    const ws = await loadSheet(res.body as Buffer);
    expect(rowText(ws, 1)).toEqual([
      '考生姓名',
      '科室',
      '作答次数',
      '交卷时间',
      '得分',
      '是否及格',
      '切屏次数',
      '切屏时长（秒）',
    ]);
  });

  it('第一行数据与 DB 中的交卷记录一致', async () => {
    const detail = await request(app).get(`/api/records/${basicRecord}`).set(bearer(admin));
    expect(detail.body.code).toBe(0);
    const d = detail.body.data as {
      userName: string;
      departmentName: string;
      score: number;
      passScore: number;
    };

    const res = await getBinary(`/api/reports/exams/${basicExam}/export`, admin);
    const ws = await loadSheet(res.body as Buffer);
    const first = rowText(ws, 2);
    // 列序：考生姓名, 科室, 作答次数, 交卷时间, 得分, 是否及格, 切屏次数, 切屏时长（秒）
    expect(first[0]).toBe(d.userName);
    expect(first[1]).toBe(d.departmentName);
    expect(Number(first[4])).toBe(d.score);
    expect(first[5]).toBe(d.score >= d.passScore ? '及格' : '不及格');
  });

  it('columns=name,score → 仅 2 列', async () => {
    const res = await getBinary(`/api/reports/exams/${basicExam}/export`, admin, {
      columns: 'name,score',
    });
    expect(res.status).toBe(200);
    const ws = await loadSheet(res.body as Buffer);
    expect(rowText(ws, 1)).toEqual(['考生姓名', '得分']);
  });

  it('列序稳定：columns=score,name → 表头仍按定义顺序（考生姓名, 得分）', async () => {
    const res = await getBinary(`/api/reports/exams/${basicExam}/export`, admin, {
      columns: 'score,name',
    });
    const ws = await loadSheet(res.body as Buffer);
    expect(rowText(ws, 1)).toEqual(['考生姓名', '得分']);
  });

  it('非法列 columns=name,foo → 400/1001，message 指明非法字段', async () => {
    const res = await request(app)
      .get(`/api/reports/exams/${basicExam}/export`)
      .set(bearer(admin))
      .query({ columns: 'name,foo' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe(1001);
    expect(res.body.message).toContain('导出字段不合法');
    expect(res.body.message).toContain('foo');
  });

  it('columns 存在但为空 → 400/1001「请至少选择一个导出字段」', async () => {
    const res = await request(app)
      .get(`/api/reports/exams/${basicExam}/export`)
      .set(bearer(admin))
      .query({ columns: '' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe(1001);
    expect(res.body.message).toBe('请至少选择一个导出字段');
  });

  it('重复 key columns=name,name,score → 表头无重复，共 2 列', async () => {
    const res = await getBinary(`/api/reports/exams/${basicExam}/export`, admin, {
      columns: 'name,name,score',
    });
    const ws = await loadSheet(res.body as Buffer);
    expect(rowText(ws, 1)).toEqual(['考生姓名', '得分']);
  });

  it('一人多次作答只导最新一次：1 行且「作答次数」= 第 2 次', async () => {
    const res = await getBinary(`/api/reports/exams/${multiExam}/export`, admin);
    const ws = await loadSheet(res.body as Buffer);
    // 表头 1 行 + 数据 1 行
    expect(ws.rowCount).toBe(2);
    const first = rowText(ws, 2);
    // 默认列序中「作答次数」为第 3 列
    expect(first[2]).toBe('第 2 次');
    expect(first[0]).toBe('张三');
  });

  it('时区偏移生效：tzOffset=0 与 tzOffset=480 的交卷时间相差 8 小时', async () => {
    const r0 = await getBinary(`/api/reports/exams/${basicExam}/export`, admin, {
      columns: 'submittedAt',
      tzOffset: 0,
    });
    const r480 = await getBinary(`/api/reports/exams/${basicExam}/export`, admin, {
      columns: 'submittedAt',
      tzOffset: 480,
    });
    const ws0 = await loadSheet(r0.body as Buffer);
    const ws480 = await loadSheet(r480.body as Buffer);
    const t0 = rowText(ws0, 2)[0];
    const t480 = rowText(ws480, 2)[0];
    expect(t0).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/);
    const ms0 = new Date(`${t0.replace(' ', 'T')}Z`).getTime();
    const ms480 = new Date(`${t480.replace(' ', 'T')}Z`).getTime();
    expect(ms480 - ms0).toBe(8 * 3600 * 1000);
  });
});
