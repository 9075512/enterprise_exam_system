/**
 * 练题域 · 二期增量 API 测试（收藏夹 / 每日一练 / 学习报告 / 公网练题配置）。
 *
 * 覆盖点：
 *   1) 管理端练题配置读写与鉴权（仅 admin；越界 → 1001）；
 *   2) 收藏夹：幂等收藏 / 取消 / 上限 / 列表不泄露答案 / 收藏重练会话；
 *   3) 每日一练：题序固定 / 完成度服务端权威 / 关闭降级 / 连续打卡；
 *   4) 学习报告：总览与首答聚合一致 / 趋势补 0 / 科目升序与 weak 标记 / 题库概览；
 *   5) 隔离：新接口未登录一律 401/1002；练题 token 不能调管理端配置接口。
 *
 * 说明：数据落在测试库 enterprise_exam_system_test（setup-env 已注入）。
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import type { RowDataPacket } from 'mysql2/promise';

import { app } from '../app.js';
import { prepareTestDb } from './db.js';
import { closePool, query } from '../db/pool.js';
import { nowDb } from '../utils/datetime.js';
import { DEFAULT_PRACTICE_SETTINGS } from '../modules/practice/practiceSettings.defaults.js';

/* ============================ 常量 ============================ */

/** 开放练题的题库（测试中置 allow_practice=1，含 6 道题 q-01~q-06） */
const OPEN_BANK = 'bank-security';
/** 未开放练题的题库 */
const CLOSED_BANK = 'bank-culture';

/** 独立写入用户（避免与其它测试文件互相污染） */
const USER = { id: 'user-qa-enh', username: 'qa_enh', password: 'qa-enh-123' };

/** 默认配置（直接复用后端单一事实来源，新增设置项时自动同步，避免测试与实现脱节） */
const DEFAULTS = DEFAULT_PRACTICE_SETTINGS;

const bearer = (token: string): Record<string, string> => ({ Authorization: `Bearer ${token}` });

/** 宽松的客户端请求头（供限流指纹使用）。 */
function client(ip: string, fp = 'enh'): Record<string, string> {
  return { 'X-Forwarded-For': ip, 'X-Device-Fp': fp };
}

/** 练题登录，返回 token。 */
async function practiceLogin(username: string, password: string, ip: string): Promise<string> {
  const res = await request(app)
    .post('/api/practice/auth/login')
    .set(client(ip))
    .send({ username, password });
  expect(res.body.code, JSON.stringify(res.body)).toBe(0);
  return res.body.data.token as string;
}

/** 内网登录，返回 token。 */
async function internalLogin(username: string, password: string): Promise<string> {
  const res = await request(app).post('/api/auth/login').send({ username, password });
  expect(res.body.code, JSON.stringify(res.body)).toBe(0);
  return (res.body.data.token ?? res.body.data.accessToken) as string;
}

/** 以 admin 身份写入练题配置。 */
async function saveSettings(adminToken: string, patch: Partial<typeof DEFAULTS>): Promise<void> {
  const res = await request(app)
    .put('/api/settings/practice')
    .set(bearer(adminToken))
    .send({ ...DEFAULTS, ...patch });
  expect(res.body.code, JSON.stringify(res.body)).toBe(0);
}

/* ============================ 准备 / 清理 ============================ */

beforeAll(async () => {
  await prepareTestDb();
  // 显式固定题库开放状态（不依赖种子默认值）：仅开放 bank-security，
  // 其余题库一律关闭，保证「仅返回开放题库」类断言稳定。
  await query(`UPDATE question_banks SET allow_practice = 0`);
  await query(`UPDATE question_banks SET allow_practice = 1 WHERE id = ?`, [OPEN_BANK]);
  const hash = await bcrypt.hash(USER.password, 10);
  await query(
    `INSERT INTO users (id, username, password_hash, name, role, department_id, status, created_at)
     VALUES (?, ?, ?, 'QA增强用户', 'examinee', NULL, 'active', ?)
     ON DUPLICATE KEY UPDATE id = id`,
    [USER.id, USER.username, hash, nowDb()],
  );
}, 30000);

afterAll(async () => {
  await closePool();
});

/* ================================================================== */
/* A. 管理端：公网练题配置                                              */
/* ================================================================== */

describe('A. 管理端练题配置（/api/settings/practice）', () => {
  it('未登录 → 401 / 1002', async () => {
    const get = await request(app).get('/api/settings/practice');
    expect(get.status).toBe(401);
    expect(get.body.code).toBe(1002);
    const put = await request(app).put('/api/settings/practice').send(DEFAULTS);
    expect(put.status).toBe(401);
  });

  it('非 admin（考生内网账号）→ 403 / 1003（读写均拦截）', async () => {
    const token = await internalLogin('zhangsan', '123456');
    const get = await request(app).get('/api/settings/practice').set(bearer(token));
    expect(get.status).toBe(403);
    expect(get.body.code).toBe(1003);
    const put = await request(app).put('/api/settings/practice').set(bearer(token)).send(DEFAULTS);
    expect(put.status).toBe(403);
    expect(put.body.code).toBe(1003);
  });

  it('admin 读取：未初始化时返回全部默认值', async () => {
    const admin = await internalLogin('admin', 'admin123');
    // 清空配置行，模拟「未初始化」
    await query(`DELETE FROM practice_settings WHERE id = 1`);
    const res = await request(app).get('/api/settings/practice').set(bearer(admin));
    expect(res.body.code).toBe(0);
    expect(res.body.data).toEqual(DEFAULTS);
  });

  it('admin 保存后回读一致（含题型范围与抽题范围）', async () => {
    const admin = await internalLogin('admin', 'admin123');
    const payload = {
      ...DEFAULTS,
      dailyQuestionCount: 3,
      dailyTypes: ['single', 'judge'],
      dailyBankScope: 'all',
      favoriteLimit: 20,
    };
    const put = await request(app).put('/api/settings/practice').set(bearer(admin)).send(payload);
    expect(put.body.code).toBe(0);
    expect(put.body.data).toEqual(payload);

    const get = await request(app).get('/api/settings/practice').set(bearer(admin));
    expect(get.body.data).toEqual(payload);

    const rows = await query<RowDataPacket[]>(`SELECT updated_by FROM practice_settings WHERE id = 1`);
    expect(String(rows[0].updated_by)).toBe('user-admin');
  });

  it('越界 / 缺字段 → 1001 中文文案', async () => {
    const admin = await internalLogin('admin', 'admin123');

    const tooSmall = await request(app)
      .put('/api/settings/practice')
      .set(bearer(admin))
      .send({ ...DEFAULTS, dailyQuestionCount: 0 });
    expect(tooSmall.status).toBe(400);
    expect(tooSmall.body.code).toBe(1001);
    expect(tooSmall.body.message).toContain('每日一练题量');

    const badScope = await request(app)
      .put('/api/settings/practice')
      .set(bearer(admin))
      .send({ ...DEFAULTS, dailyBankScope: 'whatever' });
    expect(badScope.body.code).toBe(1001);

    const missing = await request(app)
      .put('/api/settings/practice')
      .set(bearer(admin))
      .send({ dailyEnabled: true });
    expect(missing.body.code).toBe(1001);
  });

  it('练题 token 不能调用管理端配置接口（401）', async () => {
    const ptoken = await practiceLogin(USER.username, USER.password, '198.51.100.201');
    const res = await request(app).get('/api/settings/practice').set(bearer(ptoken));
    expect(res.status).toBe(401);
    expect(res.body.code).toBe(1002);
  });
});

/* ================================================================== */
/* B. 收藏夹                                                           */
/* ================================================================== */

describe('B. 收藏夹', () => {
  let token = '';

  beforeAll(async () => {
    const admin = await internalLogin('admin', 'admin123');
    await saveSettings(admin, { favoriteLimit: 500 });
    token = await practiceLogin(USER.username, USER.password, '198.51.100.210');
  });

  it('未登录访问收藏接口 → 401 / 1002', async () => {
    const probes: Array<[string, string, Record<string, unknown>?]> = [
      ['get', '/api/practice/favorites'],
      ['get', '/api/practice/favorites/ids'],
      ['post', '/api/practice/favorites', { questionId: 'q-01' }],
      ['delete', '/api/practice/favorites/q-01'],
      ['post', '/api/practice/favorites/reans', {}],
    ];
    for (const [method, url, body] of probes) {
      const req = (request(app) as unknown as Record<string, (u: string) => request.Test>)[method](url);
      const res = await (body ? req.send(body) : req);
      expect(res.status, `${method} ${url}`).toBe(401);
      expect(res.body.code, `${method} ${url}`).toBe(1002);
    }
  });

  it('收藏开放题库题目：幂等，重复收藏仍只有 1 条', async () => {
    const first = await request(app).post('/api/practice/favorites').set(bearer(token)).send({ questionId: 'q-01' });
    expect(first.body.code).toBe(0);
    expect(first.body.data.favorited).toBe(true);

    const again = await request(app).post('/api/practice/favorites').set(bearer(token)).send({ questionId: 'q-01' });
    expect(again.body.code).toBe(0);

    const rows = await query<RowDataPacket[]>(
      `SELECT COUNT(*) AS c FROM practice_favorites WHERE user_id = ? AND question_id = 'q-01'`,
      [USER.id],
    );
    expect(Number(rows[0].c)).toBe(1);
  });

  it('收藏未开放题库题目 → 404 / 1009（不暴露存在性）', async () => {
    const res = await request(app)
      .post('/api/practice/favorites')
      .set(bearer(token))
      .send({ questionId: 'q-07' }); // q-07 属 bank-culture（未开放）
    expect(res.status).toBe(404);
    expect(res.body.code).toBe(1009);
  });

  it('收藏列表与 ids 回显：**不含** answer / analysis', async () => {
    await request(app).post('/api/practice/favorites').set(bearer(token)).send({ questionId: 'q-02' });

    const ids = await request(app).get('/api/practice/favorites/ids').set(bearer(token));
    expect(ids.body.code).toBe(0);
    expect(ids.body.data.sort()).toEqual(['q-01', 'q-02']);

    const list = await request(app).get('/api/practice/favorites').set(bearer(token));
    expect(list.body.code).toBe(0);
    expect(list.body.data.total).toBe(2);
    for (const item of list.body.data.list) {
      expect(item).not.toHaveProperty('answer');
      expect(item).not.toHaveProperty('analysis');
      expect(item).toHaveProperty('favoritedAt');
    }
  });

  it('按题库筛选：非开放题库的直连接口拒绝访问', async () => {
    const res = await request(app)
      .get(`/api/practice/favorites?bankId=${CLOSED_BANK}`)
      .set(bearer(token));
    expect(res.status).toBe(404);
    expect(res.body.code).toBe(1009);
  });

  it('收藏上限：按后台配置生效，超限拒绝（409 / 1013），不回溯删除', async () => {
    const admin = await internalLogin('admin', 'admin123');
    await saveSettings(admin, { favoriteLimit: 2 });

    // 已有 q-01 / q-02 两条 → 第三条应被拒绝
    const res = await request(app)
      .post('/api/practice/favorites')
      .set(bearer(token))
      .send({ questionId: 'q-03' });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe(1013);

    // 既有收藏不被删除
    const list = await request(app).get('/api/practice/favorites').set(bearer(token));
    expect(list.body.data.total).toBe(2);

    // 取消一题后可再收藏
    await request(app).delete('/api/practice/favorites/q-01').set(bearer(token));
    const ok = await request(app).post('/api/practice/favorites').set(bearer(token)).send({ questionId: 'q-03' });
    expect(ok.body.code).toBe(0);
  });

  it('取消收藏幂等；对未收藏题目取消也不报错', async () => {
    const res = await request(app).delete('/api/practice/favorites/q-99').set(bearer(token));
    expect(res.body.code).toBe(0);
    expect(res.body.data.favorited).toBe(false);
  });

  it('练收藏题：生成会话后可直接判分（跨库会话 bankId 为空串）', async () => {
    const session = await request(app).post('/api/practice/favorites/reans').set(bearer(token)).send({});
    expect(session.body.code).toBe(0);
    const { sessionToken, questionIds } = session.body.data as { sessionToken: string; questionIds: string[] };
    expect(questionIds.length).toBeGreaterThan(0);

    const check = await request(app)
      .post('/api/practice/check')
      .set(bearer(token))
      .send({ sessionToken, questionId: questionIds[0], answer: [1] });
    expect(check.body.code).toBe(0);
    expect(check.body.data).toHaveProperty('correct');
  });
});

/* ================================================================== */
/* C. 每日一练                                                         */
/* ================================================================== */

describe('C. 每日一练', () => {
  let token = '';
  let admin = '';

  beforeAll(async () => {
    admin = await internalLogin('admin', 'admin123');
    await saveSettings(admin, { dailyEnabled: true, dailyQuestionCount: 3, dailyTypes: [], dailyBankScope: 'practiced' });
    token = await practiceLogin(USER.username, USER.password, '198.51.100.220');
  });

  it('GET /daily 生成当日任务：题量 = min(配置, 可抽题数)；题序多次请求保持一致', async () => {
    const first = await request(app).get('/api/practice/daily').set(bearer(token));
    expect(first.body.code).toBe(0);
    const data = first.body.data as { enabled: boolean; total: number; questionIds: string[] };
    expect(data.enabled).toBe(true);
    expect(data.total).toBe(3);
    expect(data.questionIds).toHaveLength(3);

    const second = await request(app).get('/api/practice/daily').set(bearer(token));
    expect(second.body.data.questionIds).toEqual(data.questionIds);

    // 落库只有一条（用户 × 自然日 唯一）
    const rows = await query<RowDataPacket[]>(
      `SELECT COUNT(*) AS c FROM practice_daily_tasks WHERE user_id = ?`,
      [USER.id],
    );
    expect(Number(rows[0].c)).toBe(1);
  });

  it('完成度由服务端按 practice_answers 重算（客户端无法伪造）', async () => {
    const daily = await request(app).get('/api/practice/daily').set(bearer(token));
    expect(daily.body.code).toBe(0);
    const { questionIds, doneCount: before, total } = daily.body.data as {
      questionIds: string[];
      doneCount: number;
      total: number;
    };

    // 选一道「当日尚未首答」的题目，保证增量可断言（前序用例可能已产生今日作答）
    const answered = await query<RowDataPacket[]>(
      `SELECT question_id FROM practice_answers WHERE user_id = ?`,
      [USER.id],
    );
    const answeredSet = new Set(answered.map((r) => String(r.question_id)));
    const target = questionIds.find((id) => !answeredSet.has(id));
    expect(target, '当日任务中应存在未作答题目').toBeTruthy();
    expect(before).toBeLessThan(total);

    const session = await request(app).post('/api/practice/daily/session').set(bearer(token)).send({});
    expect(session.body.code).toBe(0);
    const sessionToken = session.body.data.sessionToken as string;

    await request(app)
      .post('/api/practice/check')
      .set(bearer(token))
      .send({ sessionToken, questionId: target, answer: [1] });

    const after = await request(app).get('/api/practice/daily').set(bearer(token));
    expect(after.body.data.doneCount).toBe(before + 1);
    expect(after.body.data.completed).toBe(before + 1 >= total);

    // 数据库中的 done_count 与接口一致（服务端权威）
    const rows = await query<RowDataPacket[]>(
      `SELECT done_count FROM practice_daily_tasks WHERE user_id = ?`,
      [USER.id],
    );
    expect(Number(rows[0].done_count)).toBe(before + 1);
  });

  it('连续打卡：当日有作答 → streakDays 至少为 1', async () => {
    const res = await request(app).get('/api/practice/daily').set(bearer(token));
    expect(res.body.data.streakDays).toBeGreaterThanOrEqual(1);
  });

  it('关闭每日一练：GET 降级为 enabled=false，建会话被拒（1014），历史任务不删除', async () => {
    await saveSettings(admin, { dailyEnabled: false });

    const daily = await request(app).get('/api/practice/daily').set(bearer(token));
    expect(daily.body.code).toBe(0);
    expect(daily.body.data.enabled).toBe(false);
    expect(daily.body.data.total).toBe(0);
    expect(daily.body.data.questionIds).toEqual([]);

    const session = await request(app).post('/api/practice/daily/session').set(bearer(token)).send({});
    expect(session.status).toBe(404);
    expect(session.body.code).toBe(1014);

    const rows = await query<RowDataPacket[]>(
      `SELECT COUNT(*) AS c FROM practice_daily_tasks WHERE user_id = ?`,
      [USER.id],
    );
    expect(Number(rows[0].c)).toBe(1);
  });

  it('重新开启后恢复可用；当日已生成任务不受题量变更影响（题序固定）', async () => {
    await saveSettings(admin, { dailyEnabled: true, dailyQuestionCount: 5 });
    const res = await request(app).get('/api/practice/daily').set(bearer(token));
    expect(res.body.data.enabled).toBe(true);
    // 当日任务在题量改为 5 之前已生成为 3 题 → 保持不变
    expect(res.body.data.total).toBe(3);
  });

  it('报告总览中的今日任务量与每日一练一致', async () => {
    const summary = await request(app).get('/api/practice/report/summary').set(bearer(token));
    expect(summary.body.code).toBe(0);
    expect(summary.body.data.dailyEnabled).toBe(true);
    expect(summary.body.data.todayTotal).toBe(3);
  });
});

/* ================================================================== */
/* D. 学习报告                                                         */
/* ================================================================== */

describe('D. 学习报告', () => {
  let token = '';
  const RPT_USER = { id: 'user-qa-rpt', username: 'qa_rpt', password: 'qa-rpt-123' };

  beforeAll(async () => {
    // 固定在北京时间零点后 30 秒，避免执行跨日，并覆盖「一分钟前属于昨天」的边界。
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-17T16:00:30.000Z'));
    const hash = await bcrypt.hash(RPT_USER.password, 10);
    await query(
      `INSERT INTO users (id, username, password_hash, name, role, department_id, status, created_at)
       VALUES (?, ?, ?, 'QA报告用户', 'examinee', NULL, 'active', ?)
       ON DUPLICATE KEY UPDATE id = id`,
      [RPT_USER.id, RPT_USER.username, hash, nowDb()],
    );
    // 直接落 6 条首答明细：3 对 3 错（分布在今天，科目取题目自带 subject）
    const answeredAt = nowDb();
    const rows: Array<[string, string, number]> = [
      ['pa-rpt-1', 'q-01', 1],
      ['pa-rpt-2', 'q-02', 1],
      ['pa-rpt-3', 'q-03', 0],
      ['pa-rpt-4', 'q-04', 0],
      ['pa-rpt-5', 'q-05', 1],
      ['pa-rpt-6', 'q-06', 0],
    ];
    for (const [id, qid, correct] of rows) {
      await query(
        `INSERT INTO practice_answers (id, user_id, question_id, answer, is_correct, answered_at)
         VALUES (?, ?, ?, JSON_ARRAY(1), ?, ?)
         ON DUPLICATE KEY UPDATE id = id`,
        [id, RPT_USER.id, qid, correct, answeredAt],
      );
    }
    token = await practiceLogin(RPT_USER.username, RPT_USER.password, '198.51.100.230');
  });

  afterAll(() => {
    vi.useRealTimers();
  });

  it('summary：与 practice_answers 首答聚合一致（服务端权威）', async () => {
    const res = await request(app).get('/api/practice/report/summary').set(bearer(token));
    expect(res.body.code).toBe(0);
    expect(res.body.data.doneTotal).toBe(6);
    expect(res.body.data.correctTotal).toBe(3);
    expect(res.body.data.accuracy).toBe(50);
    expect(res.body.data.todayDone).toBe(6);
    expect(res.body.data.streakDays).toBeGreaterThanOrEqual(1);
    expect(res.body.data).toHaveProperty('wrongTotal');
    expect(res.body.data).toHaveProperty('favoriteTotal');
  });

  it('trend：days=7 返回 7 个点且无记录日补 0；末点为今日', async () => {
    const res = await request(app).get('/api/practice/report/trend?days=7').set(bearer(token));
    expect(res.body.code).toBe(0);
    const points = res.body.data as Array<{ date: string; doneCount: number; accuracy: number }>;
    expect(points).toHaveLength(7);
    for (const p of points) expect(p.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    const todayPoint = points[points.length - 1];
    expect(todayPoint.doneCount).toBe(6);
    expect(todayPoint.accuracy).toBe(50);
    // 前 6 天无作答 → 补 0
    for (const p of points.slice(0, 6)) expect(p.doneCount).toBe(0);
  });

  it('trend：days 仅支持 7 / 30（越界 → 1001）', async () => {
    const bad = await request(app).get('/api/practice/report/trend?days=15').set(bearer(token));
    expect(bad.status).toBe(400);
    expect(bad.body.code).toBe(1001);

    const ok = await request(app).get('/api/practice/report/trend?days=30').set(bearer(token));
    expect(ok.body.code).toBe(0);
    expect(ok.body.data).toHaveLength(30);
  });

  it('subjects：按正确率升序，weak 标记规则（<70% 且作答数 >= 5）可复现', async () => {
    const res = await request(app).get('/api/practice/report/subjects').set(bearer(token));
    expect(res.body.code).toBe(0);
    const list = res.body.data as Array<{ accuracy: number; doneCount: number; weak: boolean }>;
    expect(list.length).toBeGreaterThan(0);
    for (let i = 1; i < list.length; i += 1) {
      expect(list[i - 1].accuracy).toBeLessThanOrEqual(list[i].accuracy);
    }
    for (const item of list) {
      expect(item.weak).toBe(item.doneCount >= 5 && item.accuracy < 70);
    }
  });

  it('banks：仅返回开放题库，含已练数与题库总题数', async () => {
    const res = await request(app).get('/api/practice/report/banks').set(bearer(token));
    expect(res.body.code).toBe(0);
    const list = res.body.data as Array<{ bankId: string; doneCount: number; totalCount: number; accuracy: number }>;
    expect(list.map((b) => b.bankId)).toEqual([OPEN_BANK]);
    expect(list[0].doneCount).toBe(6);
    expect(list[0].totalCount).toBe(6);
    expect(list[0].accuracy).toBe(50);
  });

  it('报告接口未登录 → 401 / 1002', async () => {
    for (const url of [
      '/api/practice/report/summary',
      '/api/practice/report/trend',
      '/api/practice/report/subjects',
      '/api/practice/report/banks',
    ]) {
      const res = await request(app).get(url);
      expect(res.status, url).toBe(401);
      expect(res.body.code, url).toBe(1002);
    }
  });
});
