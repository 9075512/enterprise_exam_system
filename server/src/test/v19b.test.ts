/**
 * 练题端设置扩展（v1.9⑤）—— 集成测试。
 *
 * 覆盖三项互相独立的能力：
 *  1) **配置读写**：`GET /api/practice/config` 公开投影 + `PUT /api/settings/practice` 校验（含下限>上限 1001）；
 *  2) **判分可见性**：`showAnswer=false` → 正确但不下发答案；`showAnalysis=false` → 不下发解析；
 *  3) **错题本自动移除**：连续答对达阈值自动移出（0 = 不自动移除）；
 *  4) **单次题量区间**：客户端题量越界时收敛到配置区间（服务端兜底）；
 *  5) **页面入口开关**：报告 / 错题本 / 收藏关闭 → 1017（收藏 id 列表降级为空集，不报错）；
 *  6) **默认练题方式**：不传 `mode` 时使用后台配置的默认值。
 *
 * 种子题库规模（bank-security）：single 2 / multiple 2 / judge 2（共 6 题）——
 * 题量收敛用例据此设计（不额外造题）。
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import type { RowDataPacket } from 'mysql2/promise';

import { app } from '../app.js';
import { prepareTestDb } from './db.js';
import { closePool, query } from '../db/pool.js';
import { DEFAULT_PRACTICE_SETTINGS } from '../modules/practice/practiceSettings.defaults.js';
import type { PracticeConfigDto, PracticeSettings, PracticeSession } from '../types/domain.js';

/* ============================ 常量与工具 ============================ */

const BANK = 'bank-security';
const OTHER_BANK = 'bank-culture';
/** 独立练题用户（隔离进度/错题，避免与其它测试文件互相污染） */
const P_USER = { id: 'user-qa-v19b', username: 'qa_v19b', password: 'qa-v19b-123' };

const bearer = (token: string): Record<string, string> => ({ Authorization: `Bearer ${token}` });

/** 内网登录。 */
async function internalLogin(username: string, password: string): Promise<string> {
  const res = await request(app).post('/api/auth/login').send({ username, password });
  expect(res.body.code, JSON.stringify(res.body)).toBe(0);
  return (res.body.data.token ?? res.body.data.accessToken) as string;
}

/** 练题端登录。 */
async function practiceLogin(username: string, password: string): Promise<string> {
  const res = await request(app)
    .post('/api/practice/auth/login')
    .set({ 'X-Forwarded-For': '198.51.100.245', 'X-Device-Fp': 'v19b' })
    .send({ username, password });
  expect(res.body.code, JSON.stringify(res.body)).toBe(0);
  return res.body.data.token as string;
}

/** 读取完整练题设置（admin）。 */
async function getSettings(adminToken: string): Promise<PracticeSettings> {
  const res = await request(app).get('/api/settings/practice').set(bearer(adminToken));
  expect(res.body.code, JSON.stringify(res.body)).toBe(0);
  return res.body.data as PracticeSettings;
}

/** 更新练题设置（合并式 patch，便于用例只改关心的字段）。 */
async function patchSettings(adminToken: string, patch: Partial<PracticeSettings>) {
  const current = await getSettings(adminToken);
  return request(app)
    .put('/api/settings/practice')
    .set(bearer(adminToken))
    .send({ ...current, ...patch });
}

/** 恢复全部默认设置（用例间互不干扰）。 */
async function resetSettings(adminToken: string): Promise<void> {
  const res = await request(app)
    .put('/api/settings/practice')
    .set(bearer(adminToken))
    .send(DEFAULT_PRACTICE_SETTINGS);
  expect(res.body.code, JSON.stringify(res.body)).toBe(0);
}

/** 练题端公开配置。 */
async function getConfig(token: string): Promise<PracticeConfigDto> {
  const res = await request(app).get('/api/practice/config').set(bearer(token));
  expect(res.body.code, JSON.stringify(res.body)).toBe(0);
  return res.body.data as PracticeConfigDto;
}

/** 生成练习序列（可省略 mode）。 */
async function createSession(
  token: string,
  payload: { bankId?: string; mode?: 'sequence' | 'random'; count?: number },
) {
  return request(app)
    .post('/api/practice/sessions')
    .set(bearer(token))
    .send({ bankId: BANK, ...payload });
}

/** 提交单题作答。 */
function check(token: string, sessionToken: string, questionId: string, answer: number[]) {
  return request(app).post('/api/practice/check').set(bearer(token)).send({ sessionToken, questionId, answer });
}

/** 取 bank-security 的单选题（种子 q-01：正确答案 [1]，4 个选项）。 */
async function pickSingle(): Promise<{ id: string; answer: number[] }> {
  const rows = await query<RowDataPacket[]>(
    `SELECT id, answer FROM questions WHERE bank_id = ? AND type = 'single' ORDER BY id ASC LIMIT 1`,
    [BANK],
  );
  const row = rows[0]!;
  const raw = typeof row.answer === 'string' ? JSON.parse(row.answer) : row.answer;
  return { id: String(row.id), answer: (raw as number[]) ?? [0] };
}

/** 错题本条目当前状态（不存在返回 null）。 */
async function wrongEntry(questionId: string): Promise<{ streak: number; wrongCount: number } | null> {
  const rows = await query<RowDataPacket[]>(
    `SELECT wrong_count, correct_streak FROM practice_wrong_book WHERE user_id = ? AND question_id = ? LIMIT 1`,
    [P_USER.id, questionId],
  );
  const row = rows[0];
  return row ? { streak: Number(row.correct_streak), wrongCount: Number(row.wrong_count) } : null;
}

/** 题库开放标记。 */
async function setBankOpen(bankId: string, open: boolean): Promise<void> {
  await query(`UPDATE question_banks SET allow_practice = ? WHERE id = ?`, [open ? 1 : 0, bankId]);
}

/** 清空今日任务（每日一练按 (user, date) 生成一次）。 */
async function clearTodayTasks(): Promise<void> {
  await query(`DELETE FROM practice_daily_tasks WHERE user_id = ?`, [P_USER.id]);
}

/* ============================ 准备 / 清理 ============================ */

let adminToken = '';
let practiceToken = '';

beforeAll(async () => {
  await prepareTestDb();
  const hash = await bcrypt.hash(P_USER.password, 10);
  await query(
    `INSERT INTO users (id, username, password_hash, name, role, department_id, status, created_at)
     VALUES (?, ?, ?, 'QA练题设置用户', 'examinee', NULL, 'active', NOW(3))`,
    [P_USER.id, P_USER.username, hash],
  );
  adminToken = await internalLogin('admin', 'admin123');
  practiceToken = await practiceLogin(P_USER.username, P_USER.password);
});

afterAll(async () => {
  await closePool();
});

/* ============================ 用例 ============================ */

describe('配置读写与校验', () => {
  it('GET /api/practice/config 默认值与后端默认一致', async () => {
    const cfg = await getConfig(practiceToken);
    expect(cfg).toMatchObject({
      defaultPracticeMode: 'sequence',
      sessionMinCount: 1,
      sessionMaxCount: 50,
      showAnswer: true,
      showAnalysis: true,
      reportEnabled: true,
      wrongBookEnabled: true,
      favoriteEnabled: true,
      dailyEnabled: true,
    });
  });

  it('GET /api/settings/practice 返回完整 16 字段', async () => {
    const s = await getSettings(adminToken);
    expect(Object.keys(s).sort()).toEqual(Object.keys(DEFAULT_PRACTICE_SETTINGS).sort());
    expect(s.sessionMaxCount).toBe(50);
  });

  it('PUT 修改后 config 立即反映（题量区间 / 答案可见性）', async () => {
    await resetSettings(adminToken);
    const res = await patchSettings(adminToken, {
      sessionMinCount: 2,
      sessionMaxCount: 8,
      showAnswer: false,
      showAnalysis: false,
      defaultPracticeMode: 'random',
    });
    expect(res.body.code, JSON.stringify(res.body)).toBe(0);

    const cfg = await getConfig(practiceToken);
    expect(cfg).toMatchObject({
      sessionMinCount: 2,
      sessionMaxCount: 8,
      showAnswer: false,
      showAnalysis: false,
      defaultPracticeMode: 'random',
    });
  });

  it('PUT 题量上限小于下限 → 1001', async () => {
    await resetSettings(adminToken);
    const res = await patchSettings(adminToken, { sessionMinCount: 9, sessionMaxCount: 3 });
    expect(res.body.code).toBe(1001);
    expect(String(res.body.message)).toContain('上限');
  });

  it('PUT 越界的重置时点 → 1001', async () => {
    await resetSettings(adminToken);
    const res = await patchSettings(adminToken, { dailyResetHour: 24 });
    expect(res.body.code).toBe(1001);
  });

  it('练题端 Token 不能访问内网设置接口（非 0）', async () => {
    const current = await getSettings(adminToken);
    const res = await request(app)
      .put('/api/settings/practice')
      .set(bearer(practiceToken))
      .send(current);
    expect(res.body.code).not.toBe(0);
  });

  it('GET /api/practice/config 需要登录 → 1002/401', async () => {
    const res = await request(app).get('/api/practice/config');
    expect(res.status).toBe(401);
    expect(res.body.code).toBe(1002);
  });
});

describe('判分可见性（showAnswer / showAnalysis）', () => {
  it('关闭答案与解析：仍能判分，但不下发答案/解析', async () => {
    await resetSettings(adminToken);
    await patchSettings(adminToken, { showAnswer: false, showAnalysis: false });

    const { id, answer } = await pickSingle();
    const session = await createSession(practiceToken, { count: 50 });
    const sessionToken = (session.body.data as PracticeSession).sessionToken;

    const res = await check(practiceToken, sessionToken, id, answer);
    expect(res.body.code, JSON.stringify(res.body)).toBe(0);
    expect(res.body.data.correct).toBe(true);
    expect(res.body.data.correctAnswer).toEqual([]);
    expect(res.body.data.analysis).toBe('');
    expect(res.body.data.answerVisible).toBe(false);
    expect(res.body.data.analysisVisible).toBe(false);
  });

  it('开启答案与解析：正常下发', async () => {
    await resetSettings(adminToken);
    const { id, answer } = await pickSingle();
    const session = await createSession(practiceToken, { count: 50 });
    const sessionToken = (session.body.data as PracticeSession).sessionToken;

    const res = await check(practiceToken, sessionToken, id, answer);
    expect(res.body.code, JSON.stringify(res.body)).toBe(0);
    expect(res.body.data.correctAnswer).toEqual(answer);
    expect(res.body.data.answerVisible).toBe(true);
    expect((res.body.data.analysis as string).length).toBeGreaterThan(0);
  });
});

describe('错题本自动移除（wrongAutoRemoveStreak）', () => {
  it('阈值为 0：答对不移除（仅答错入本）', async () => {
    await resetSettings(adminToken);
    const { id, answer } = await pickSingle();
    const session = await createSession(practiceToken, { count: 50 });
    const sessionToken = (session.body.data as PracticeSession).sessionToken;

    // 先答错 → 入错题本
    const wrongAnswer = [answer[0] === 0 ? 1 : 0];
    await check(practiceToken, sessionToken, id, wrongAnswer);
    expect(await wrongEntry(id)).not.toBeNull();

    // 再答对 → 阈值 0，仍在错题本
    await check(practiceToken, sessionToken, id, answer);
    const entry = await wrongEntry(id);
    expect(entry).not.toBeNull();
    expect(entry!.streak).toBe(1);
  });

  it('阈值为 2：连续答对 2 次后自动移出', async () => {
    await resetSettings(adminToken);
    await query(`DELETE FROM practice_wrong_book WHERE user_id = ?`, [P_USER.id]);
    await patchSettings(adminToken, { wrongAutoRemoveStreak: 2 });

    const { id, answer } = await pickSingle();
    const session = await createSession(practiceToken, { count: 50 });
    const sessionToken = (session.body.data as PracticeSession).sessionToken;

    await check(practiceToken, sessionToken, id, [answer[0] === 0 ? 1 : 0]);
    expect(await wrongEntry(id)).not.toBeNull();

    // 第 1 次答对 → streak=1，仍在
    await check(practiceToken, sessionToken, id, answer);
    expect((await wrongEntry(id))?.streak).toBe(1);

    // 第 2 次答对 → 达阈值，移出
    await check(practiceToken, sessionToken, id, answer);
    expect(await wrongEntry(id)).toBeNull();
  });

  it('再次答错会把连续答对计数清零', async () => {
    await resetSettings(adminToken);
    await query(`DELETE FROM practice_wrong_book WHERE user_id = ?`, [P_USER.id]);
    await patchSettings(adminToken, { wrongAutoRemoveStreak: 3 });

    const { id, answer } = await pickSingle();
    const session = await createSession(practiceToken, { count: 50 });
    const sessionToken = (session.body.data as PracticeSession).sessionToken;

    await check(practiceToken, sessionToken, id, [answer[0] === 0 ? 1 : 0]);
    await check(practiceToken, sessionToken, id, answer); // streak=1
    expect((await wrongEntry(id))?.streak).toBe(1);

    await check(practiceToken, sessionToken, id, [answer[0] === 0 ? 1 : 0]); // 答错清零
    const entry = await wrongEntry(id);
    expect(entry?.streak).toBe(0);
    expect(entry?.wrongCount).toBe(2);
  });
});

describe('单次题量区间收敛与默认模式', () => {
  it('客户端题量超上限 → 收敛到上限（题库 6 题，上限 2）', async () => {
    await resetSettings(adminToken);
    await patchSettings(adminToken, { sessionMinCount: 1, sessionMaxCount: 2 });
    const res = await createSession(practiceToken, { count: 50 });
    expect(res.body.code, JSON.stringify(res.body)).toBe(0);
    expect((res.body.data as PracticeSession).total).toBeLessThanOrEqual(2);
  });

  it('客户端题量低于下限 → 抬升到下限', async () => {
    await resetSettings(adminToken);
    await patchSettings(adminToken, { sessionMinCount: 3, sessionMaxCount: 50 });
    const res = await createSession(practiceToken, { count: 1 });
    expect(res.body.code, JSON.stringify(res.body)).toBe(0);
    expect((res.body.data as PracticeSession).total).toBe(3);
  });

  it('不传 mode 时使用后台默认练题方式（随机）', async () => {
    await resetSettings(adminToken);
    await patchSettings(adminToken, { defaultPracticeMode: 'random', sessionMaxCount: 50 });
    const res = await createSession(practiceToken, { count: 50 });
    expect(res.body.code, JSON.stringify(res.body)).toBe(0);
    expect((res.body.data as PracticeSession).total).toBeGreaterThan(0);
  });
});

describe('页面入口开关', () => {
  it('关闭学习报告 → 1017', async () => {
    await resetSettings(adminToken);
    await patchSettings(adminToken, { reportEnabled: false });
    const res = await request(app).get('/api/practice/report/summary').set(bearer(practiceToken));
    expect(res.body.code).toBe(1017);
  });

  it('关闭错题本 → 列表 1017', async () => {
    await resetSettings(adminToken);
    await patchSettings(adminToken, { wrongBookEnabled: false });
    const res = await request(app).get('/api/practice/wrong-book').set(bearer(practiceToken));
    expect(res.body.code).toBe(1017);
  });

  it('关闭收藏 → 收藏与取消收藏 1017，但收藏 id 列表降级为空集', async () => {
    await resetSettings(adminToken);
    await patchSettings(adminToken, { favoriteEnabled: false });

    const list = await request(app).get('/api/practice/favorites').set(bearer(practiceToken));
    expect(list.body.code).toBe(1017);

    const add = await request(app)
      .post('/api/practice/favorites')
      .set(bearer(practiceToken))
      .send({ questionId: 'q-01' });
    expect(add.body.code).toBe(1017);

    const ids = await request(app).get('/api/practice/favorites/ids').set(bearer(practiceToken));
    expect(ids.body.code, JSON.stringify(ids.body)).toBe(0);
    expect(ids.body.data).toEqual([]);
  });

  it('重新开启后恢复可用', async () => {
    await resetSettings(adminToken);
    const res = await request(app).get('/api/practice/report/summary').set(bearer(practiceToken));
    expect(res.body.code, JSON.stringify(res.body)).toBe(0);
  });
});

describe('每日一练最少题量门限（dailyMinQuestionCount）', () => {
  it('可抽题量低于门限 → 视为今日无题可练', async () => {
    await resetSettings(adminToken);
    // 只开放 bank-security（6 题），并限制题型为多选（2 题），门限设为 3
    await setBankOpen(OTHER_BANK, false);
    await setBankOpen(BANK, true);
    await clearTodayTasks();
    await patchSettings(adminToken, {
      dailyEnabled: true,
      dailyBankScope: 'all',
      dailyTypes: ['multiple'],
      dailyQuestionCount: 10,
      dailyMinQuestionCount: 3,
    });

    const res = await request(app).get('/api/practice/daily').set(bearer(practiceToken));
    expect(res.body.code, JSON.stringify(res.body)).toBe(0);
    expect(res.body.data.enabled).toBe(true);
    expect(res.body.data.total).toBe(0);

    const session = await request(app).post('/api/practice/daily/session').set(bearer(practiceToken));
    expect(session.body.code).toBe(1014);
  });

  it('门限降到 1 后恢复出题', async () => {
    await resetSettings(adminToken);
    await setBankOpen(OTHER_BANK, false);
    await setBankOpen(BANK, true);
    await clearTodayTasks();
    await patchSettings(adminToken, {
      dailyEnabled: true,
      dailyBankScope: 'all',
      dailyTypes: ['multiple'],
      dailyQuestionCount: 10,
      dailyMinQuestionCount: 1,
    });

    const res = await request(app).get('/api/practice/daily').set(bearer(practiceToken));
    expect(res.body.code, JSON.stringify(res.body)).toBe(0);
    expect(res.body.data.total).toBe(2);
  });
});
