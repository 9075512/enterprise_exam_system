/**
 * v1.8⑤ U5 —— 题库复制「内容去重式复用」集成 + 单元测试。
 *
 * 覆盖：
 *  1) 内容指纹（纯函数）：幂等、空白折叠、客观题答案顺序无关、填空/简答答案顺序有关、字段差异可区分；
 *  2) 题库复制去重：同批内内容完全相同的题目只新建一行，`copied` / `reused` 计数与审计留痕；
 *     题目 id 全新（不与源库共用）；`copyQuestions=false` 时不复制；
 *  3) Excel 导入去重（`dedupe=true`，默认关闭）：目标题库已存在的同内容题目被跳过；
 *     批内重复同样只建一行；**默认关闭时行为与引入前完全一致**。
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../app.js';
import { prepareTestDb } from './db.js';
import { closePool } from '../db/pool.js';
import { signToken } from '../middleware/auth.js';
import { questionFingerprint } from '../utils/questionFingerprint.js';
import type {
  BankCloneResultDto,
  CommitResult,
  Page,
  AuditLogDto,
  QuestionDto,
} from '../types/domain.js';

const bearer = (token: string): { Authorization: string } => ({ Authorization: `Bearer ${token}` });

const admin = signToken({ sub: 'user-admin', role: 'admin', departmentId: '' });

/* ============================ 1. 内容指纹（纯函数） ============================ */

describe('U5 内容指纹', () => {
  const single = {
    type: 'single',
    stem: '下列哪项属于个人信息？',
    options: ['姓名', '邮编', '以上都是'],
    answer: [2],
  };

  it('幂等：同内容多次计算结果一致，且为 40 位十六进制', () => {
    const a = questionFingerprint(single);
    const b = questionFingerprint({ ...single, options: [...single.options] });
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{40}$/);
  });

  it('题干与选项的连续空白被折叠（A  B 与 A B 视为同一题）', () => {
    const x = questionFingerprint({ ...single, stem: '个人信息  包含\n哪些？' });
    const y = questionFingerprint({ ...single, stem: '个人信息 包含 哪些？' });
    expect(x).toBe(y);
  });

  it('客观题答案顺序无关；填空/简答答案顺序有关', () => {
    const a = questionFingerprint({ ...single, answer: [2, 0] });
    const b = questionFingerprint({ ...single, answer: [0, 2] });
    expect(a).toBe(b);

    const fill1 = questionFingerprint({ type: 'fill', stem: '甲__乙__', options: [], answer: ['一', '二'] });
    const fill2 = questionFingerprint({ type: 'fill', stem: '甲__乙__', options: [], answer: ['二', '一'] });
    expect(fill1).not.toBe(fill2);
  });

  it('题型 / 题干 / 选项 / 答案 任一不同即视为不同题', () => {
    const base = questionFingerprint(single);
    expect(questionFingerprint({ ...single, type: 'multiple' })).not.toBe(base);
    expect(questionFingerprint({ ...single, stem: '另一道题' })).not.toBe(base);
    expect(questionFingerprint({ ...single, options: ['A', 'B', 'C'] })).not.toBe(base);
    expect(questionFingerprint({ ...single, answer: [1] })).not.toBe(base);
  });
});

/* ============================ 集成用例 ============================ */

/** 新建题库。 */
async function createBank(name: string): Promise<string> {
  const res = await request(app).post('/api/banks').set(bearer(admin)).send({
    name,
    description: '',
    allowPractice: false,
    authorIds: [],
  });
  expect(res.body.code).toBe(0);
  return res.body.data.id as string;
}

/** 新建题目。 */
async function createQuestion(
  bankId: string,
  overrides: Partial<{
    type: string;
    stem: string;
    options: string[];
    answer: Array<number | string>;
    defaultScore: number;
  }> = {},
): Promise<string> {
  const payload = {
    bankId,
    type: 'single',
    stem: '信息安全三要素是什么？',
    options: ['保密性', '完整性', '可用性'],
    answer: [0],
    defaultScore: 10,
    subject: '信息安全',
    ...overrides,
  };
  const res = await request(app).post('/api/questions').set(bearer(admin)).send(payload);
  expect(res.body.code).toBe(0);
  return res.body.data.id as string;
}

async function countQuestions(bankId: string): Promise<number> {
  const res = await request(app).get(`/api/banks/${bankId}/questions`).query({ pageSize: 50 }).set(bearer(admin));
  expect(res.body.code).toBe(0);
  return (res.body.data as Page<QuestionDto>).total;
}

beforeAll(async () => {
  await prepareTestDb();
});

afterAll(async () => {
  await closePool();
});

describe('U5 题库复制内容去重复用', () => {
  it('同批内内容完全相同的题目只新建一行（copied / reused 计数正确）', async () => {
    const srcId = await createBank('v18e 源题库');
    const keep = await createQuestion(srcId, { stem: '题 A' });
    // 与「题 A」内容完全相同（含空白差异，应命中同一指纹）
    await createQuestion(srcId, { stem: '题 A ' });
    await createQuestion(srcId, { stem: '题 B', answer: [1] });

    const res = await request(app)
      .post(`/api/banks/${srcId}/clone`)
      .set(bearer(admin))
      .send({ name: 'v18e 副本', copyQuestions: true });
    expect(res.body.code).toBe(0);
    const result = res.body.data as BankCloneResultDto;

    expect(result.copied).toBe(2);
    expect(result.reused).toBe(1);
    expect(await countQuestions(result.bank.id)).toBe(2);

    // 题目 id 全新，不与源库共用
    const src = await request(app).get(`/api/banks/${srcId}/questions`).query({ pageSize: 50 }).set(bearer(admin));
    const srcIds = new Set((src.body.data.list as Array<{ id: string }>).map((q) => q.id));
    const dst = await request(app)
      .get(`/api/banks/${result.bank.id}/questions`)
      .query({ pageSize: 50 })
      .set(bearer(admin));
    const dstIds = (dst.body.data.list as Array<{ id: string }>).map((q) => q.id);
    expect(dstIds.some((id) => srcIds.has(id))).toBe(false);
    expect(srcIds.has(keep)).toBe(true);

    // 审计留痕：含 copied / reused
    const logs = await request(app)
      .get('/api/audit-logs')
      .query({ action: 'bank.clone', pageSize: 10 })
      .set(bearer(admin));
    expect(logs.body.code).toBe(0);
    const entry = (logs.body.data as Page<AuditLogDto>).list.find((l) => l.targetId === result.bank.id);
    expect(entry?.detail?.copied).toBe(2);
    expect(entry?.detail?.reused).toBe(1);
  });

  it('不复制试题：copied / reused 均为 0，副本题库为空', async () => {
    const srcId = await createBank('v18e 源题库2');
    await createQuestion(srcId, { stem: '题 C' });

    const res = await request(app)
      .post(`/api/banks/${srcId}/clone`)
      .set(bearer(admin))
      .send({ copyQuestions: false });
    expect(res.body.code).toBe(0);
    const result = res.body.data as BankCloneResultDto;
    expect(result.copied).toBe(0);
    expect(result.reused).toBe(0);
    expect(await countQuestions(result.bank.id)).toBe(0);
  });
});

describe('U5 导入内容去重复用（dedupe 开关）', () => {
  const row = (r: number, stem: string): Record<string, unknown> => ({
    row: r,
    type: 'single',
    stem,
    options: ['甲', '乙', '丙'],
    answer: [0],
    defaultScore: 10,
    analysis: '',
    subject: '信息安全',
  });

  it('默认关闭：与引入前行为一致（重复内容照常新建）', async () => {
    const bankId = await createBank('v18e 导入库（默认）');
    // 与下方导入行内容完全一致
    await createQuestion(bankId, { stem: '重复题', options: ['甲', '乙', '丙'], answer: [0] });
    const before = await countQuestions(bankId);

    const res = await request(app)
      .post('/api/questions/import/commit')
      .set(bearer(admin))
      .send({ bankId, fileName: 'a.xlsx', validRows: [row(2, '重复题')] });
    expect(res.body.code).toBe(0);
    const result = res.body.data as CommitResult;
    expect(result.successCount).toBe(1);
    expect(result.reused).toBe(0);
    expect(await countQuestions(bankId)).toBe(before + 1);
  });

  it('开启 dedupe：已存在的同内容题目被跳过，且批内重复只建一行', async () => {
    const bankId = await createBank('v18e 导入库（去重）');
    // 与下方导入行内容完全一致（含选项），才能命中指纹
    await createQuestion(bankId, { stem: '重复题', options: ['甲', '乙', '丙'], answer: [0] });
    const before = await countQuestions(bankId);

    const res = await request(app)
      .post('/api/questions/import/commit')
      .set(bearer(admin))
      .send({
        bankId,
        fileName: 'a.xlsx',
        dedupe: true,
        // 第 1 行命中既有题目；第 2/3 行内容相同且为新题 → 只建一行
        validRows: [row(2, '重复题'), row(3, '全新题目'), row(4, '全新题目 ')],
      });
    expect(res.body.code).toBe(0);
    const result = res.body.data as CommitResult;

    expect(result.reused).toBe(2);
    expect(result.successCount).toBe(1);
    expect(result.totalRows).toBe(3);
    expect(result.successCount + result.reused + result.failCount).toBe(result.totalRows);
    expect(await countQuestions(bankId)).toBe(before + 1);
  });

  it('dedupe 为布尔值类型校验（非布尔 → 1001）', async () => {
    const bankId = await createBank('v18e 导入库（校验）');
    const res = await request(app)
      .post('/api/questions/import/commit')
      .set(bearer(admin))
      .send({ bankId, fileName: 'a.xlsx', dedupe: 'yes', validRows: [row(2, 'X')] });
    expect(res.body.code).toBe(1001);
  });
});
