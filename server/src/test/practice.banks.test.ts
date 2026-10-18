/**
 * 练题端可见性（题库列表 / 每日一练）—— 集成测试。
 *
 * 背景（真实故障复盘）：题库的 `allow_practice` 是练题端一切内容的**唯一入口闸门**。
 * 种子数据曾把它留作默认 0，导致：
 *   ① `/api/practice/banks` 恒返回空数组 → 练题端「题库」看不到；
 *   ② 每日一练抽题（同样以 allow_practice=1 过滤）抽到 0 题 → 前端按 `total === 0` 隐藏卡片
 *      → 练题端「每日一练」看不到。
 * 本文件把这两条链路固化为回归护栏，并覆盖新增的批量开放接口。
 *
 * 覆盖：
 *  1) 种子题库默认对外开放 → 练题端题库列表非空、每日一练有题（回归护栏）；
 *  2) 全部关闭 → 题库列表为空、每日一练 total=0、题库内题目 1009；
 *  3) `POST /api/banks/practice/batch`：admin 批量开/关、幂等、空数组 1001、不存在 1004、author 1003；
 *     仅改 allow_practice（不动名称/授权出题人）；审计 `bank.practice_flag` 留痕。
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import type { RowDataPacket } from 'mysql2/promise';

import { app } from '../app.js';
import { prepareTestDb } from './db.js';
import { closePool, query } from '../db/pool.js';
import { nowDb } from '../utils/datetime.js';
import type { AuditLogDto, BankDto, Page, PracticeBankDto } from '../types/domain.js';

/* ============================ 常量与工具 ============================ */

const SEED_BANKS = ['bank-security', 'bank-culture'];

/** 独立练题用户（隔离进度/错题，避免与其它测试文件互相污染） */
const P_USER = { id: 'user-qa-vis', username: 'qa_vis', password: 'qa-vis-123' };

const bearer = (token: string): Record<string, string> => ({ Authorization: `Bearer ${token}` });

/** 内网登录，返回 token。 */
async function internalLogin(username: string, password: string): Promise<string> {
  const res = await request(app).post('/api/auth/login').send({ username, password });
  expect(res.body.code, JSON.stringify(res.body)).toBe(0);
  return (res.body.data.token ?? res.body.data.accessToken) as string;
}

/** 练题端登录，返回 token。 */
async function practiceLogin(username: string, password: string): Promise<string> {
  const res = await request(app)
    .post('/api/practice/auth/login')
    .set({ 'X-Forwarded-For': '198.51.100.244', 'X-Device-Fp': 'vis' })
    .send({ username, password });
  expect(res.body.code, JSON.stringify(res.body)).toBe(0);
  return res.body.data.token as string;
}

/** 练题端题库列表。 */
async function practiceBanks(token: string): Promise<PracticeBankDto[]> {
  const res = await request(app).get('/api/practice/banks').set(bearer(token));
  expect(res.body.code, JSON.stringify(res.body)).toBe(0);
  return res.body.data as PracticeBankDto[];
}

/** 今日任务。 */
async function practiceDaily(token: string): Promise<{ enabled: boolean; total: number }> {
  const res = await request(app).get('/api/practice/daily').set(bearer(token));
  expect(res.body.code, JSON.stringify(res.body)).toBe(0);
  return res.body.data as { enabled: boolean; total: number };
}

/** 批量开放/关闭（内网 admin）。 */
function batchFlag(token: string, bankIds: string[], allowPractice: boolean) {
  return request(app).post('/api/banks/practice/batch').set(bearer(token)).send({ bankIds, allowPractice });
}

/** 当前题库开放状态。 */
async function flagMap(): Promise<Record<string, boolean>> {
  const rows = await query<RowDataPacket[]>(`SELECT id, allow_practice FROM question_banks`);
  return Object.fromEntries(rows.map((r) => [String(r.id), Boolean(Number(r.allow_practice))]));
}

/** 清空今日任务（每日一练按 (user, date) 只生成一次，需在切换开放状态后重置）。 */
async function clearTodayTasks(): Promise<void> {
  await query(`DELETE FROM practice_daily_tasks WHERE user_id = ?`, [P_USER.id]);
}

/* ============================ 准备 / 清理 ============================ */

let adminToken = '';
let authorToken = '';
let practiceToken = '';

beforeAll(async () => {
  await prepareTestDb();
  const hash = await bcrypt.hash(P_USER.password, 10);
  await query(
    `INSERT INTO users (id, username, password_hash, name, role, role_id, department_id, status, created_at)
     VALUES (?, ?, ?, 'QA可见性用户', 'examinee', 'examinee', NULL, 'active', ?)
     ON DUPLICATE KEY UPDATE id = id`,
    [P_USER.id, P_USER.username, hash, nowDb()],
  );
  adminToken = await internalLogin('admin', 'admin123');
  authorToken = await internalLogin('author', 'author123');
  practiceToken = await practiceLogin(P_USER.username, P_USER.password);
}, 30000);

afterAll(async () => {
  await closePool();
});

/* ============================ 1. 种子默认开放（回归护栏） ============================ */

describe('练题端可见性 · 种子题库默认对外开放', () => {
  it('种子题库 allow_practice 默认为 1（开箱即可练题）', async () => {
    const map = await flagMap();
    for (const id of SEED_BANKS) {
      expect(map[id], `题库 ${id} 应默认对外开放练题`).toBe(true);
    }
  });

  it('练题端题库列表非空（修复「题库看不到」）', async () => {
    const banks = await practiceBanks(practiceToken);
    expect(banks.length).toBe(SEED_BANKS.length);
    expect(banks.map((b) => b.id).sort()).toEqual([...SEED_BANKS].sort());
    // 题库卡依赖 questionCount 展示「共 N 题」，为 0 时前端禁用「开始练题」
    for (const b of banks) expect(b.questionCount).toBeGreaterThan(0);
  });

  it('每日一练有题（修复「每日一练看不到」）', async () => {
    await clearTodayTasks();
    const daily = await practiceDaily(practiceToken);
    expect(daily.enabled).toBe(true);
    // 前端 dailyAvailable = enabled && total > 0；total 为 0 时整卡隐藏
    expect(daily.total).toBeGreaterThan(0);
  });
});

/* ============================ 2. 全部关闭 → 两端都空 ============================ */

describe('练题端可见性 · 关闭全部题库后', () => {
  beforeAll(async () => {
    const res = await batchFlag(adminToken, SEED_BANKS, false);
    expect(res.body.code, JSON.stringify(res.body)).toBe(0);
    await clearTodayTasks();
  });

  afterAll(async () => {
    const res = await batchFlag(adminToken, SEED_BANKS, true);
    expect(res.body.code, JSON.stringify(res.body)).toBe(0);
    await clearTodayTasks();
  });

  it('题库列表为空数组', async () => {
    expect(await practiceBanks(practiceToken)).toEqual([]);
  });

  it('每日一练 total=0（前端据此隐藏入口）', async () => {
    const daily = await practiceDaily(practiceToken);
    expect(daily.enabled).toBe(true);
    expect(daily.total).toBe(0);
  });

  it('未开放题库的题目接口 → 1009/404（不暴露存在性）', async () => {
    const res = await request(app)
      .get(`/api/practice/banks/${SEED_BANKS[0]}/questions?subject=&page=1&pageSize=10`)
      .set(bearer(practiceToken));
    expect(res.status).toBe(404);
    expect(res.body.code).toBe(1009);
  });

  it('每日一练会话接口 → 1014/404（无题可生成）', async () => {
    const res = await request(app).post('/api/practice/daily/session').set(bearer(practiceToken));
    expect(res.status).toBe(404);
    expect(res.body.code).toBe(1014);
  });
});

/* ============================ 3. 批量开放接口 ============================ */

describe('批量设置对外练题开放（POST /api/banks/practice/batch）', () => {
  it('admin 批量开启 → 返回更新后的题库且 allowPractice=true', async () => {
    await batchFlag(adminToken, SEED_BANKS, false);
    const res = await batchFlag(adminToken, SEED_BANKS, true);
    expect(res.body.code, JSON.stringify(res.body)).toBe(0);
    const data = res.body.data as BankDto[];
    expect(data.length).toBe(SEED_BANKS.length);
    for (const b of data) {
      expect(b.allowPractice).toBe(true);
      expect(b.questionCount).toBeGreaterThan(0);
    }
    const map = await flagMap();
    for (const id of SEED_BANKS) expect(map[id]).toBe(true);
  });

  it('幂等：重复设置同一状态不报错', async () => {
    const first = await batchFlag(adminToken, SEED_BANKS, true);
    expect(first.body.code).toBe(0);
    const second = await batchFlag(adminToken, SEED_BANKS, true);
    expect(second.body.code, JSON.stringify(second.body)).toBe(0);
    expect((second.body.data as BankDto[]).every((b) => b.allowPractice)).toBe(true);
  });

  it('只改 allow_practice，不动名称/授权出题人', async () => {
    const before = await query<RowDataPacket[]>(
      `SELECT (SELECT COUNT(*) FROM bank_authors WHERE bank_id = ?) AS ac,
              (SELECT name FROM question_banks WHERE id = ?) AS nm`,
      ['bank-security', 'bank-security'],
    );
    await batchFlag(adminToken, ['bank-security'], false);
    await batchFlag(adminToken, ['bank-security'], true);
    const after = await query<RowDataPacket[]>(
      `SELECT (SELECT COUNT(*) FROM bank_authors WHERE bank_id = ?) AS ac,
              (SELECT name FROM question_banks WHERE id = ?) AS nm`,
      ['bank-security', 'bank-security'],
    );
    expect(after[0].ac).toBe(before[0].ac);
    expect(after[0].nm).toBe(before[0].nm);
  });

  it('题量统计随开放状态对外可见（questionCount 与库内一致）', async () => {
    const res = await batchFlag(adminToken, ['bank-security'], true);
    const [dto] = res.body.data as BankDto[];
    const rows = await query<RowDataPacket[]>(
      `SELECT COUNT(*) AS c FROM questions WHERE bank_id = 'bank-security'`,
    );
    expect(dto.questionCount).toBe(Number(rows[0].c));
  });

  it('空数组 → 1001/400（请至少选择一个题库）', async () => {
    const res = await batchFlag(adminToken, [], true);
    expect(res.status).toBe(400);
    expect(res.body.code).toBe(1001);
  });

  it('不存在的题库 id → 1004/404（避免静默漏改）', async () => {
    const res = await batchFlag(adminToken, ['bank-not-exist'], true);
    expect(res.status).toBe(404);
    expect(res.body.code).toBe(1004);
  });

  it('缺 allowPractice 字段 → 1001/400', async () => {
    const res = await request(app)
      .post('/api/banks/practice/batch')
      .set(bearer(adminToken))
      .send({ bankIds: ['bank-security'] });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe(1001);
  });

  it('author 越权 → 1003/403（仅 admin 可调整）', async () => {
    const res = await batchFlag(authorToken, ['bank-security'], false);
    expect(res.status).toBe(403);
    expect(res.body.code).toBe(1003);
    // 状态未被越权修改
    expect((await flagMap())['bank-security']).toBe(true);
  });

  it('未登录 → 1002/401', async () => {
    const res = await request(app)
      .post('/api/banks/practice/batch')
      .send({ bankIds: ['bank-security'], allowPractice: false });
    expect(res.status).toBe(401);
    expect(res.body.code).toBe(1002);
  });

  it('审计留痕：记录 bank.practice_flag（含题库 id 与目标状态）', async () => {
    await batchFlag(adminToken, ['bank-culture'], false);
    const res = await request(app)
      .get('/api/audit-logs?page=1&pageSize=20&action=bank.practice_flag')
      .set(bearer(adminToken));
    expect(res.body.code, JSON.stringify(res.body)).toBe(0);
    const page = res.body.data as Page<AuditLogDto>;
    expect(page.total).toBeGreaterThan(0);
    const latest = page.list[0];
    expect(latest.action).toBe('bank.practice_flag');
    expect(JSON.stringify(latest.detail)).toContain('bank-culture');
    await batchFlag(adminToken, ['bank-culture'], true);
  });
});
