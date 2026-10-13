/**
 * v2.0⑤ 练题端打卡与激励 —— 集成测试。
 *
 * 背景：v1.9⑤ 起练题端已有「学习报告」，但缺少**正向激励**。本次在零迁移前提下，
 * 由既有 `practice_answers` / `practice_daily_tasks` / `practice_wrong_book` 派生：
 *   - 连续打卡天数（streakDays：今日未练则从昨日回溯，不因「今天还没练」归零）；
 *   - 历史最长连续天数（bestStreak，断链后仍保留峰值）；
 *   - 9 枚成就徽章（题量 / 打卡 / 正确率 / 每日一练 / 错题清零）。
 *
 * 本文件护栏：
 *  1) 默认开启 + `GET /api/practice/config` 下发 achievementEnabled（练题端首页据此显隐）；
 *  2) 空数据用户不得出现负值 / 假解锁；
 *  3) 连续打卡与「历史最长」两套口径互不干扰（断链不清零 bestStreak）；
 *  4) 徽章解锁阈值精确（50 题 + 90% 正确率才解锁「精准射手」）；
 *  5) 模块关闭 → 1017/404（与 v1.9⑤ 报告/错题本/收藏夹同一约定）。
 *
 * 口径说明：业务日由 `practiceDayOffsetMinutes(dailyResetHour)` 折算，插入明细时
 * 直接使用 `bizDayRangeUtc(day, offset).startUtc`，确保与服务的取日逻辑完全一致。
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import type { RowDataPacket } from 'mysql2/promise';

import { app } from '../app.js';
import { prepareTestDb } from './db.js';
import { closePool, query } from '../db/pool.js';
import { nowDb } from '../utils/datetime.js';
import { addDays, bizDayRangeUtc, bizToday, practiceDayOffsetMinutes } from '../modules/practice/practice.time.js';
import type { PracticeAchievementsDto, PracticeConfigDto, PracticeSettings } from '../types/domain.js';

/* ============================ 常量与工具 ============================ */

/** 独立练题用户（隔离作答/任务，避免与其它测试文件互相污染） */
const A_USER = { id: 'user-qa-ach', username: 'qa_ach', password: 'qa-ach-123' };

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
    .set({ 'X-Forwarded-For': '198.51.100.248', 'X-Device-Fp': 'ach' })
    .send({ username, password });
  expect(res.body.code, JSON.stringify(res.body)).toBe(0);
  return res.body.data.token as string;
}

/** 练题端公开配置。 */
async function getConfig(token: string): Promise<PracticeConfigDto> {
  const res = await request(app).get('/api/practice/config').set(bearer(token));
  expect(res.body.code, JSON.stringify(res.body)).toBe(0);
  return res.body.data as PracticeConfigDto;
}

/** 内网练题配置（admin）。 */
async function getSettings(token: string): Promise<PracticeSettings> {
  const res = await request(app).get('/api/settings/practice').set(bearer(token));
  expect(res.body.code, JSON.stringify(res.body)).toBe(0);
  return res.body.data as PracticeSettings;
}

/** 内网更新练题配置（admin，读改写）。 */
async function patchSettings(token: string, patch: Partial<PracticeSettings>) {
  const current = await getSettings(token);
  return request(app)
    .put('/api/settings/practice')
    .set(bearer(token))
    .send({ ...current, ...patch });
}

/** 打卡与成就总览。 */
function achievements(token: string) {
  return request(app).get('/api/practice/achievements').set(bearer(token));
}

/** 清空该用户的作答明细（切换用例场景用）。 */
async function clearAnswers(): Promise<void> {
  await query(`DELETE FROM practice_answers WHERE user_id = ?`, [A_USER.id]);
}

/** 清空该用户的每日任务。 */
async function clearDailyTasks(): Promise<void> {
  await query(`DELETE FROM practice_daily_tasks WHERE user_id = ?`, [A_USER.id]);
}

let offset = 0;
let questionIds: string[] = [];
let seq = 0;

/**
 * 在某业务日插入 n 条首答明细（correct 条答对，其余答错）。
 * 时间取该业务日的 UTC 起点，与服务的 `bizDayRangeUtc` 取日口径严格一致。
 */
async function seedAnswers(day: string, n: number, correct: number): Promise<void> {
  const startUtc = bizDayRangeUtc(day, offset).startUtc;
  for (let i = 0; i < n; i += 1) {
    seq += 1;
    await query(
      `INSERT INTO practice_answers (id, user_id, question_id, answer, is_correct, answered_at)
       VALUES (?, ?, ?, JSON_ARRAY(1), ?, ?)`,
      [`pa-ach-${seq}`, A_USER.id, questionIds[i % questionIds.length], i < correct ? 1 : 0, startUtc],
    );
  }
}

/* ============================ 准备 / 清理 ============================ */

let adminToken = '';
let practiceToken = '';
let today = '';

beforeAll(async () => {
  await prepareTestDb();
  const hash = await bcrypt.hash(A_USER.password, 10);
  await query(
    `INSERT INTO users (id, username, password_hash, name, role, department_id, status, created_at)
     VALUES (?, ?, ?, 'QA打卡用户', 'examinee', NULL, 'active', ?)
     ON DUPLICATE KEY UPDATE id = id`,
    [A_USER.id, A_USER.username, hash, nowDb()],
  );
  adminToken = await internalLogin('admin', 'admin123');
  practiceToken = await practiceLogin(A_USER.username, A_USER.password);

  const rows = await query<RowDataPacket[]>(`SELECT id FROM questions ORDER BY id LIMIT 10`);
  questionIds = rows.map((r) => String(r.id));
  expect(questionIds.length).toBeGreaterThanOrEqual(5);

  const settings = await getSettings(adminToken);
  offset = practiceDayOffsetMinutes(settings.dailyResetHour);
  today = bizToday(offset);
}, 30000);

afterAll(async () => {
  await closePool();
});

/* ============================ 1. 配置与默认值 ============================ */

describe('打卡与激励 · 配置', () => {
  it('默认开启：练题端 config 下发 achievementEnabled = true', async () => {
    const cfg = await getConfig(practiceToken);
    expect(cfg.achievementEnabled).toBe(true);
  });

  it('内网设置返回该字段（与后端默认 key 集合一致）', async () => {
    const s = await getSettings(adminToken);
    expect(s).toHaveProperty('achievementEnabled');
    expect(s.achievementEnabled).toBe(true);
  });

  it('关闭后练题端 config 立即反映 false', async () => {
    const res = await patchSettings(adminToken, { achievementEnabled: false });
    expect(res.body.code, JSON.stringify(res.body)).toBe(0);
    const cfg = await getConfig(practiceToken);
    expect(cfg.achievementEnabled).toBe(false);
    await patchSettings(adminToken, { achievementEnabled: true });
  });
});

/* ============================ 2. 空数据用户 ============================ */

describe('打卡与激励 · 空数据', () => {
  it('未练过题：各项为 0，徽章全部未解锁（不得假解锁）', async () => {
    await clearAnswers();
    await clearDailyTasks();
    const res = await achievements(practiceToken);
    expect(res.body.code, JSON.stringify(res.body)).toBe(0);
    const d = res.body.data as PracticeAchievementsDto;

    expect(d.enabled).toBe(true);
    expect(d.streakDays).toBe(0);
    expect(d.bestStreak).toBe(0);
    expect(d.answeredTotal).toBe(0);
    expect(d.correctTotal).toBe(0);
    expect(d.accuracy).toBe(0);
    expect(d.dailyCompleted).toBe(0);
    expect(d.unlockedCount).toBe(0);
    expect(d.badges).toHaveLength(9);
    for (const b of d.badges) expect(b.unlocked, `徽章 ${b.key} 不应解锁`).toBe(false);
  });
});

/* ============================ 3. 连续打卡 ============================ */

describe('打卡与激励 · 连续打卡', () => {
  it('今日起连续 3 天各作答 1 题 → streakDays = bestStreak = 3，「坚持三天」解锁', async () => {
    await clearAnswers();
    await clearDailyTasks();
    for (const d of [today, addDays(today, -1), addDays(today, -2)]) await seedAnswers(d, 1, 1);

    const d = (await achievements(practiceToken)).body.data as PracticeAchievementsDto;
    expect(d.streakDays).toBe(3);
    expect(d.bestStreak).toBe(3);
    expect(d.answeredTotal).toBe(3);
    // 初次练题 + 坚持三天
    expect(d.badges.find((b) => b.key === 'first')?.unlocked).toBe(true);
    expect(d.badges.find((b) => b.key === 'streak-3')?.unlocked).toBe(true);
    expect(d.badges.find((b) => b.key === 'streak-7')?.unlocked).toBe(false);
    expect(d.unlockedCount).toBe(2);
  });

  it('今日未练但昨日连练 2 天 → 从昨日回溯，不因「今天还没练」归零', async () => {
    await clearAnswers();
    await clearDailyTasks();
    for (const d of [addDays(today, -1), addDays(today, -2)]) await seedAnswers(d, 1, 1);

    const d = (await achievements(practiceToken)).body.data as PracticeAchievementsDto;
    expect(d.streakDays).toBe(2);
    expect(d.bestStreak).toBe(2);
  });

  it('前日与今日之间断档 → 当前连续为 1（今日），历史最长保留峰值', async () => {
    await clearAnswers();
    await clearDailyTasks();
    // 8~10 天前连续 3 天（峰值 3），今日单日（当前 1）
    for (const d of [addDays(today, -10), addDays(today, -9), addDays(today, -8)]) await seedAnswers(d, 1, 1);
    await seedAnswers(today, 1, 1);

    const d = (await achievements(practiceToken)).body.data as PracticeAchievementsDto;
    expect(d.streakDays).toBe(1);
    expect(d.bestStreak).toBe(3);
    expect(d.badges.find((b) => b.key === 'streak-3')?.current).toBe(3);
    expect(d.badges.find((b) => b.key === 'streak-7')?.unlocked).toBe(false);
  });
});

/* ============================ 4. 累计题量与正确率 ============================ */

describe('打卡与激励 · 累计题量与正确率', () => {
  it('49 题全对 → 「精准射手」未解锁（题量未达 50）', async () => {
    await clearAnswers();
    await clearDailyTasks();
    await seedAnswers(today, 49, 49);

    const d = (await achievements(practiceToken)).body.data as PracticeAchievementsDto;
    expect(d.answeredTotal).toBe(49);
    expect(d.accuracy).toBe(100);
    expect(d.badges.find((b) => b.key === 'accuracy-90')?.unlocked).toBe(false);
  });

  it('50 题全对 → 正确率 100%、「精准射手」解锁', async () => {
    await clearAnswers();
    await clearDailyTasks();
    await seedAnswers(today, 50, 50);

    const d = (await achievements(practiceToken)).body.data as PracticeAchievementsDto;
    expect(d.answeredTotal).toBe(50);
    expect(d.correctTotal).toBe(50);
    expect(d.accuracy).toBe(100);
    expect(d.badges.find((b) => b.key === 'accuracy-90')?.unlocked).toBe(true);
    expect(d.badges.find((b) => b.key === 'accuracy-90')?.current).toBe(100);
  });

  it('50 题 44 对（88%）→ 未达 90% 阈值，「精准射手」仍未解锁', async () => {
    await clearAnswers();
    await clearDailyTasks();
    await seedAnswers(today, 50, 44);

    const d = (await achievements(practiceToken)).body.data as PracticeAchievementsDto;
    expect(d.accuracy).toBe(88);
    expect(d.badges.find((b) => b.key === 'accuracy-90')?.unlocked).toBe(false);
  });

  it('累计 120 题全对 → 「百题斩」解锁、「五百题达人」未解锁', async () => {
    await clearAnswers();
    await clearDailyTasks();
    for (const d of [today, addDays(today, -1)]) await seedAnswers(d, 60, 60);

    const d = (await achievements(practiceToken)).body.data as PracticeAchievementsDto;
    expect(d.answeredTotal).toBe(120);
    expect(d.badges.find((b) => b.key === 'answered-100')?.unlocked).toBe(true);
    expect(d.badges.find((b) => b.key === 'answered-100')?.current).toBe(120);
    expect(d.badges.find((b) => b.key === 'answered-500')?.unlocked).toBe(false);
    // 累积 120 题且错题本为空 → 错题清零解锁
    expect(d.wrongTotal).toBe(0);
    expect(d.badges.find((b) => b.key === 'wrong-clear')?.unlocked).toBe(true);
  });
});

/* ============================ 5. 每日一练次数 ============================ */

describe('打卡与激励 · 每日一练达人', () => {
  it('完成 10 次每日一练 → 「每日一练达人」解锁；9 次不解锁', async () => {
    await clearAnswers();
    await clearDailyTasks();
    await seedAnswers(today, 1, 1);

    // 9 次：仍未解锁
    for (let i = 0; i < 9; i += 1) {
      await query(
        `INSERT INTO practice_daily_tasks
           (id, user_id, practice_date, question_ids, total, done_count, correct_count, completed_at, created_at, updated_at)
         VALUES (?, ?, ?, JSON_ARRAY(), 0, 0, 0, ?, ?, ?)`,
        [`pdt-ach-${i}`, A_USER.id, addDays(today, -i - 1), nowDb(), nowDb(), nowDb()],
      );
    }
    let d = (await achievements(practiceToken)).body.data as PracticeAchievementsDto;
    expect(d.dailyCompleted).toBe(9);
    expect(d.badges.find((b) => b.key === 'daily-10')?.unlocked).toBe(false);

    // 第 10 次 → 解锁
    await query(
      `INSERT INTO practice_daily_tasks
         (id, user_id, practice_date, question_ids, total, done_count, correct_count, completed_at, created_at, updated_at)
       VALUES ('pdt-ach-10', ?, ?, JSON_ARRAY(), 0, 0, 0, ?, ?, ?)`,
      [A_USER.id, addDays(today, -10), nowDb(), nowDb(), nowDb()],
    );
    d = (await achievements(practiceToken)).body.data as PracticeAchievementsDto;
    expect(d.dailyCompleted).toBe(10);
    expect(d.badges.find((b) => b.key === 'daily-10')?.unlocked).toBe(true);
  });
});

/* ============================ 6. 模块关闭 ============================ */

describe('打卡与激励 · 模块关闭', () => {
  it('achievementEnabled = false → 接口 1017（404），恢复后数据依旧', async () => {
    await clearAnswers();
    await clearDailyTasks();
    await seedAnswers(today, 3, 3);
    const before = (await achievements(practiceToken)).body.data as PracticeAchievementsDto;

    const off = await patchSettings(adminToken, { achievementEnabled: false });
    expect(off.body.code, JSON.stringify(off.body)).toBe(0);

    const blocked = await achievements(practiceToken);
    expect(blocked.body.code).toBe(1017);
    expect(blocked.body.message).toContain('打卡与成就');
    expect((await getConfig(practiceToken)).achievementEnabled).toBe(false);

    await patchSettings(adminToken, { achievementEnabled: true });
    const after = (await achievements(practiceToken)).body.data as PracticeAchievementsDto;
    expect(after.answeredTotal).toBe(before.answeredTotal);
    expect(after.streakDays).toBe(before.streakDays);
    expect(after.badges.filter((b) => b.unlocked).map((b) => b.key).sort()).toEqual(
      before.badges.filter((b) => b.unlocked).map((b) => b.key).sort(),
    );
  });
});

/* ============================ 7. 权威性交叉校验 ============================ */

describe('打卡与激励 · 口径权威', () => {
  it('answeredTotal / correctTotal 与 practice_answers 直查一致，accuracy 为四舍五入整数', async () => {
    await clearAnswers();
    await clearDailyTasks();
    await seedAnswers(today, 7, 5);

    const rows = await query<RowDataPacket[]>(
      `SELECT COUNT(*) AS done, COALESCE(SUM(is_correct), 0) AS correct
         FROM practice_answers WHERE user_id = ?`,
      [A_USER.id],
    );
    const done = Number(rows[0]?.done ?? 0);
    const correct = Number(rows[0]?.correct ?? 0);

    const d = (await achievements(practiceToken)).body.data as PracticeAchievementsDto;
    expect(d.answeredTotal).toBe(done);
    expect(d.correctTotal).toBe(correct);
    expect(d.accuracy).toBe(Math.round((correct / done) * 100));
  });

  it('单条作答即可解锁「初次练题」（阈值 1）', async () => {
    await clearAnswers();
    await clearDailyTasks();
    await seedAnswers(today, 1, 0);
    const d = (await achievements(practiceToken)).body.data as PracticeAchievementsDto;
    expect(d.answeredTotal).toBe(1);
    expect(d.accuracy).toBe(0);
    expect(d.badges.find((b) => b.key === 'first')?.unlocked).toBe(true);
    expect(d.badges.find((b) => b.key === 'first')?.current).toBe(1);
  });
});
