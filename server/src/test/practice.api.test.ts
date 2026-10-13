/**
 * 公网练题功能（增量）—— 集成 / 对抗性测试（QA 独立复验）。
 *
 * 覆盖（对齐架构 v1.4-rev §4、§10 与主理人验收清单）：
 *  1) 鉴权与越权：未登录 401；内网 JWT 不能解锁练题；练题 token 不能进考试域；伪造/过期 token 401。
 *  2) 登录防护：统一失败文案、失败锁定 1011、验证码触发/校验 1012、限流 1010、登录只读 users。
 *  3) 内容边界：allow_practice 过滤、答案/解析不下发、会话内判分约束、会话过期。
 *  4) 判分口径：练题 check 与考试 grade 对同一题逐例一致（含多选漏选/错选/乱序/空答）。
 *  5) 隔离红线：练题不写 exam_records；练习代码路径不含考试域表名（源码扫描）。
 *  6) 进度/错题本：进度 (user,bank) 唯一；错题累计；「首次作答为准」。
 *
 * 说明：数据落在测试库 enterprise_exam_system_test（setup-env 已注入）；串行执行。
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { readFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';
import type { RowDataPacket } from 'mysql2/promise';

import { app } from '../app.js';
import { prepareTestDb } from './db.js';
import { closePool, query } from '../db/pool.js';
import { signToken } from '../middleware/auth.js';
import { isAnswerCorrect } from '../utils/grading.js';
import { grade } from '../modules/records/records.service.js';
import { env } from '../config/env.js';
import { __peekCaptchaAnswer } from '../utils/captcha.js';
import { nowDb } from '../utils/datetime.js';
import type { ExamRecordDto, QuestionType } from '../types/domain.js';

/* ============================ 常量与工具 ============================ */

/** 开放练题的题库（测试中置 allow_practice=1） */
const OPEN_BANK = 'bank-security';
/** 未开放练题的题库（保持 allow_practice=0） */
const CLOSED_BANK = 'bank-culture';

/** 开放题库内题目及正确答案（与 seed.ts 逐字一致）。 */
const Q: Record<string, { type: QuestionType; answer: number[] }> = {
  'q-01': { type: 'single', answer: [1] },
  'q-02': { type: 'single', answer: [1] },
  'q-03': { type: 'multiple', answer: [0, 1, 3] },
  'q-04': { type: 'multiple', answer: [0, 1, 3] },
  'q-05': { type: 'judge', answer: [1] },
  'q-06': { type: 'judge', answer: [0] },
};

/** 独立写入用户（隔离进度/错题本断言，避免复用种子用户互相污染） */
const WRITER = { id: 'user-qa-writer', username: 'qa_writer', password: 'qa-pass-123' };

const bearer = (token: string): Record<string, string> => ({ Authorization: `Bearer ${token}` });

/** 模拟客户端（X-Forwarded-For 供 clientIp 使用；X-Device-Fp 供限流指纹）。 */
function client(ip: string, fp = 'qa'): Record<string, string> {
  return { 'X-Forwarded-For': ip, 'X-Device-Fp': fp };
}

/** 练题登录请求。 */
function login(
  username: string,
  password: string,
  opts: { ip?: string; fp?: string; captchaId?: string; captcha?: string } = {},
) {
  let req = request(app).post('/api/practice/auth/login');
  if (opts.ip) req = req.set('X-Forwarded-For', opts.ip);
  if (opts.fp) req = req.set('X-Device-Fp', opts.fp);
  const body: Record<string, unknown> = { username, password };
  if (opts.captchaId !== undefined) body.captchaId = opts.captchaId;
  if (opts.captcha !== undefined) body.captcha = opts.captcha;
  return req.send(body);
}

/** 登录并返回练题 token（断言成功）。 */
async function loginToken(username: string, password: string, ip: string): Promise<string> {
  const res = await login(username, password, { ip });
  expect(res.body.code).toBe(0);
  return res.body.data.token as string;
}

/** 下发并解出图形验证码（v1.7③ T1：答案不再随响应返回，测试经进程内钩子读取）。 */
async function newCaptcha(ip = '198.51.100.9', fp = 'cap'): Promise<{ captchaId: string; captcha: string }> {
  const res = await request(app)
    .get('/api/practice/auth/captcha')
    .set('X-Forwarded-For', ip)
    .set('X-Device-Fp', fp);
  expect(res.body.code).toBe(0);
  const { captchaId, image } = res.body.data as { captchaId: string; image: string };
  expect(image.startsWith('data:image/svg+xml;base64,')).toBe(true);
  const captcha = __peekCaptchaAnswer(captchaId);
  if (!captcha) throw new Error(`无法读取验证码答案：${captchaId}`);
  return { captchaId, captcha };
}

/** 建会话并取全量题目 id。 */
async function createSession(
  token: string,
  body: Record<string, unknown>,
): Promise<{ sessionToken: string; questionIds: string[]; total: number }> {
  const res = await request(app).post('/api/practice/sessions').set(bearer(token)).send(body);
  expect(res.body.code).toBe(0);
  return res.body.data as { sessionToken: string; questionIds: string[]; total: number };
}

/** 考试记录行数（隔离断言用）。 */
async function examRecordCount(): Promise<number> {
  const rows = await query<RowDataPacket[]>(`SELECT COUNT(*) AS c FROM exam_records`);
  return Number(rows[0]?.c ?? 0);
}

/* ============================ 准备/清理 ============================ */

beforeAll(async () => {
  await prepareTestDb();
  // 显式固定题库开放状态（不依赖种子默认值）：
  //   仅开放 bank-security；bank-culture 强制关闭，用于断言「未开放题库不可见/不可练」。
  await query(`UPDATE question_banks SET allow_practice = 1 WHERE id = ?`, [OPEN_BANK]);
  await query(`UPDATE question_banks SET allow_practice = 0 WHERE id = ?`, [CLOSED_BANK]);
  // 插入独立写入用户（弱关联 user_id；直接落测试库）
  const hash = await bcrypt.hash(WRITER.password, 10);
  await query(
    `INSERT INTO users (id, username, password_hash, name, role, department_id, status, created_at)
     VALUES (?, ?, ?, 'QA写入用户', 'examinee', NULL, 'active', ?)
     ON DUPLICATE KEY UPDATE id = id`,
    [WRITER.id, WRITER.username, hash, nowDb()],
  );
}, 30000);

afterAll(async () => {
  await closePool();
});

/* ================================================================== */
/* A. 鉴权与越权                                                       */
/* ================================================================== */

describe('A. 鉴权与越权', () => {
  it('未登录访问练题接口（除 login/captcha）→ 401 / 1002', async () => {
    const probes: Array<[string, string, Record<string, unknown>?]> = [
      ['get', '/api/practice/auth/me'],
      ['get', '/api/practice/banks'],
      ['get', `/api/practice/banks/${OPEN_BANK}/questions`],
      ['get', '/api/practice/questions?ids=q-01'],
      ['post', '/api/practice/sessions', { bankId: OPEN_BANK, mode: 'sequence' }],
      ['post', '/api/practice/check', { sessionToken: 'x', questionId: 'q-01', answer: [1] }],
      ['get', `/api/practice/progress?bankId=${OPEN_BANK}`],
      ['put', '/api/practice/progress', { bankId: OPEN_BANK }],
      ['get', '/api/practice/wrong-book'],
      ['post', '/api/practice/wrong-book/reans', {}],
    ];
    for (const [method, url, body] of probes) {
      const req = (request(app) as unknown as Record<string, (u: string) => request.Test>)[method](url);
      const res = await (body ? req.send(body) : req);
      expect(res.status, `${method} ${url}`).toBe(401);
      expect(res.body.code, `${method} ${url}`).toBe(1002);
    }
  });

  it('登录/验证码接口为公开（无需登录态）', async () => {
    const cap = await request(app).get('/api/practice/auth/captcha').set(client('198.51.100.50'));
    expect(cap.body.code).toBe(0);
    const bad = await login('zhangsan', 'wrong-pw', { ip: '198.51.100.51' });
    // 公开可达：返回凭据错误 1002，而非 401「未登录」（两者 HTTP 同为 401，靠 code 区分业务语义由 message 保证）
    expect(bad.status).toBe(401);
    expect(bad.body.message).toBe('账号或密码不正确');
  });

  it('携带内网 JWT 访问练题接口 → 401 / 1002（练题态与内网态隔离）', async () => {
    const internal = signToken({ sub: 'user-zhangsan', role: 'examinee', departmentId: 'dept-rd' });
    for (const url of ['/api/practice/banks', '/api/practice/auth/me']) {
      const res = await request(app).get(url).set(bearer(internal));
      expect(res.status, url).toBe(401);
      expect(res.body.code, url).toBe(1002);
    }
  });

  it('练题 token 不能解锁考试域接口（内网 /api/exams、/api/users → 401）', async () => {
    const ptoken = await loginToken('zhangsan', '123456', '198.51.100.52');
    for (const url of ['/api/exams', '/api/users', '/api/records/my']) {
      const res = await request(app).get(url).set(bearer(ptoken));
      expect(res.status, url).toBe(401);
      expect(res.body.code, url).toBe(1002);
    }
  });

  it('伪造 / 过期练题 token → 401 / 1002', async () => {
    const forged = jwt.sign({ sub: 'user-zhangsan', role: 'examinee' }, 'totally-wrong-secret', {
      algorithm: 'HS256',
    });
    const forgedRes = await request(app).get('/api/practice/banks').set(bearer(forged));
    expect(forgedRes.status).toBe(401);
    expect(forgedRes.body.code).toBe(1002);

    const expired = jwt.sign({ sub: 'user-zhangsan', role: 'examinee' }, env.PRACTICE_JWT_SECRET, {
      algorithm: 'HS256',
      expiresIn: '-1s',
    });
    const expiredRes = await request(app).get('/api/practice/banks').set(bearer(expired));
    expect(expiredRes.status).toBe(401);
    expect(expiredRes.body.code).toBe(1002);
  });

  it('练题接口响应带 Cache-Control: no-store', async () => {
    const res = await request(app).get('/api/practice/banks').set(client('198.51.100.53'));
    expect(res.headers['cache-control']).toBe('no-store');
  });
});

/* ================================================================== */
/* B. 登录防护（统一文案 / 锁定 / 验证码 / 限流 / users 只读）           */
/* ================================================================== */

describe('B. 登录防护', () => {
  it('失败文案统一：账号不存在与密码错误返回完全一致的 code/message', async () => {
    const ip = '203.0.113.40';
    const wrongPw = await login('lisi', 'definitely-wrong', { ip });
    const noUser = await login('no_such_user_zzz', 'whatever', { ip });
    expect(wrongPw.status).toBe(401);
    expect(noUser.status).toBe(401);
    expect(wrongPw.body.code).toBe(1002);
    expect(noUser.body.code).toBe(1002);
    expect(wrongPw.body.message).toBe('账号或密码不正确');
    expect(noUser.body.message).toBe('账号或密码不正确');
    expect(noUser.body.message).toBe(wrongPw.body.message);
  });

  it('连续失败：达软阈值要求验证码（1012），达硬阈值锁定（1011）', async () => {
    const ip = '203.0.113.10';
    const captchaIp = '198.51.100.60';
    const maxFails = env.PRACTICE_LOGIN_MAX_FAILS;
    const captchaAfter = env.PRACTICE_CAPTCHA_AFTER_FAILS;
    const user = 'zhangsan';

    // 1) 前 captchaAfter 次失败 → 1002（无验证码要求）
    for (let i = 0; i < captchaAfter; i += 1) {
      const res = await login(user, 'wrong-pw', { ip });
      expect(res.status, `fail#${i + 1}`).toBe(401);
      expect(res.body.code).toBe(1002);
    }

    // 2) 达软阈值：未带验证码 → 1012
    const needCaptcha = await login(user, 'wrong-pw', { ip });
    expect(needCaptcha.status).toBe(400);
    expect(needCaptcha.body.code).toBe(1012);

    // 3) 带错误验证码 → 1012（且不推进失败计数）
    const wrongCap = await login(user, 'wrong-pw', { ip, captchaId: 'nope', captcha: '0' });
    expect(wrongCap.body.code).toBe(1012);

    // 4) 逐次通过验证码 + 错误密码，把失败计数推到硬阈值
    for (let i = captchaAfter; i < maxFails; i += 1) {
      const c = await newCaptcha(captchaIp);
      const res = await login(user, 'wrong-pw', { ip, captchaId: c.captchaId, captcha: c.captcha });
      expect(res.body.code, `captcha-fail#${i + 1}`).toBe(1002);
    }

    // 5) 已锁定 → 1011 / 429
    const locked = await login(user, 'wrong-pw', { ip });
    expect(locked.status).toBe(429);
    expect(locked.body.code).toBe(1011);
  });

  it('验证码通过 + 正确密码 → 登录成功且解除失败计数', async () => {
    const ip = '203.0.113.20';
    const captchaIp = '198.51.100.61';
    const captchaAfter = env.PRACTICE_CAPTCHA_AFTER_FAILS;

    for (let i = 0; i < captchaAfter; i += 1) {
      await login('wangwu', 'wrong-pw', { ip });
    }
    // 触发验证码要求
    const needCaptcha = await login('wangwu', '123456', { ip });
    expect(needCaptcha.body.code).toBe(1012);

    // 正确验证码 + 正确密码 → 成功
    const c = await newCaptcha(captchaIp);
    const ok = await login('wangwu', '123456', { ip, captchaId: c.captchaId, captcha: c.captcha });
    expect(ok.body.code).toBe(0);
    expect(ok.body.data.token).toBeTruthy();
    expect(ok.body.data.user).toMatchObject({ id: 'user-wangwu', username: 'wangwu', name: '王五' });

    // 计数已清零：再来一次错误密码 → 1002（不再要求验证码）
    const after = await login('wangwu', 'wrong-pw', { ip });
    expect(after.body.code).toBe(1002);
  });

  it('登录限流：同 IP+设备 每分钟超过阈值 → 1010 / 429', async () => {
    const ip = '203.0.113.30';
    const limit = env.PRACTICE_RATE_LOGIN_PER_MIN;
    // captcha 与 login 共用 login 分组限流，用 captcha 端点稳定触发
    for (let i = 0; i < limit; i += 1) {
      const res = await request(app).get('/api/practice/auth/captcha').set(client(ip, 'rl'));
      expect(res.body.code, `req#${i + 1}`).toBe(0);
    }
    const over = await request(app).get('/api/practice/auth/captcha').set(client(ip, 'rl'));
    expect(over.status).toBe(429);
    expect(over.body.code).toBe(1010);
  });

  it('登录只读 users：登录前后 users 行（含 password_hash/status）完全不变', async () => {
    const before = await query<RowDataPacket[]>(
      `SELECT id, username, password_hash, name, role, status FROM users WHERE id = 'user-zhangsan'`,
    );
    const ok = await login('zhangsan', '123456', { ip: '203.0.113.70' });
    expect(ok.body.code).toBe(0);
    const after = await query<RowDataPacket[]>(
      `SELECT id, username, password_hash, name, role, status FROM users WHERE id = 'user-zhangsan'`,
    );
    expect(JSON.stringify(after[0])).toBe(JSON.stringify(before[0]));
  });
});

/* ================================================================== */
/* C. 内容边界（开放过滤 / 答案不下发 / 会话约束）                       */
/* ================================================================== */

describe('C. 内容边界', () => {
  let token = '';
  beforeAll(async () => {
    token = await loginToken('zhangsan', '123456', '198.51.100.70');
  });

  it('题库列表仅含开放题库（不含未开放的 bank-culture）', async () => {
    const res = await request(app).get('/api/practice/banks').set(bearer(token));
    expect(res.body.code).toBe(0);
    const ids = (res.body.data as Array<{ id: string }>).map((b) => b.id);
    expect(ids).toContain(OPEN_BANK);
    expect(ids).not.toContain(CLOSED_BANK);
  });

  it('未开放题库：题目 / 会话一律 404 / 1009（不暴露存在性）', async () => {
    const q = await request(app).get(`/api/practice/banks/${CLOSED_BANK}/questions`).set(bearer(token));
    expect(q.status).toBe(404);
    expect(q.body.code).toBe(1009);

    const s = await request(app)
      .post('/api/practice/sessions')
      .set(bearer(token))
      .send({ bankId: CLOSED_BANK, mode: 'sequence' });
    expect(s.status).toBe(404);
    expect(s.body.code).toBe(1009);

    const p = await request(app).get(`/api/practice/progress?bankId=${CLOSED_BANK}`).set(bearer(token));
    expect(p.status).toBe(404);
    expect(p.body.code).toBe(1009);
  });

  it('题目接口不含 answer / analysis 字段（逐字段断言）', async () => {
    const res = await request(app)
      .get(`/api/practice/banks/${OPEN_BANK}/questions?pageSize=50`)
      .set(bearer(token));
    expect(res.body.code).toBe(0);
    const list = res.body.data.list as Array<Record<string, unknown>>;
    expect(list.length).toBe(6);
    for (const item of list) {
      expect(item).not.toHaveProperty('answer');
      expect(item).not.toHaveProperty('analysis');
      expect(item.answer).toBeUndefined();
      expect(item.analysis).toBeUndefined();
      const keys = Object.keys(item).sort();
      expect(keys).toEqual(['bankId', 'id', 'options', 'stem', 'subject', 'type']);
    }

    const byIds = await request(app).get('/api/practice/questions?ids=q-01,q-03').set(bearer(token));
    expect(byIds.body.code).toBe(0);
    for (const item of byIds.body.data as Array<Record<string, unknown>>) {
      expect(item).not.toHaveProperty('answer');
      expect(item).not.toHaveProperty('analysis');
    }

    // 未开放题库的题 id 被过滤为空（不暴露）
    const closed = await request(app).get('/api/practice/questions?ids=q-07,q-08').set(bearer(token));
    expect(closed.body.code).toBe(0);
    expect(closed.body.data).toEqual([]);
  });

  it('check 仅对「本会话内」questionId 判分：会话外 id / 非本人会话 / 过期会话被拒', async () => {
    // 会话只含 1 题
    const one = await createSession(token, { bankId: OPEN_BANK, mode: 'sequence', count: 1 });
    expect(one.questionIds).toHaveLength(1);
    const inSession = one.questionIds[0];
    const full = await createSession(token, { bankId: OPEN_BANK, mode: 'sequence' });
    const outSession = full.questionIds.find((id) => id !== inSession)!;
    expect(outSession).toBeTruthy();

    // 会话内 → 正常判分
    const ok = await request(app)
      .post('/api/practice/check')
      .set(bearer(token))
      .send({ sessionToken: one.sessionToken, questionId: inSession, answer: Q[inSession].answer });
    expect(ok.body.code).toBe(0);
    expect(ok.body.data.correct).toBe(true);

    // 会话外（同库但不在 qids）→ 1009
    const outside = await request(app)
      .post('/api/practice/check')
      .set(bearer(token))
      .send({ sessionToken: one.sessionToken, questionId: outSession, answer: [0] });
    expect(outside.status).toBe(404);
    expect(outside.body.code).toBe(1009);

    // 伪造（错误密钥签名）的会话 token → 1009
    const forgedSession = jwt.sign(
      { sub: 'user-zhangsan', bankId: OPEN_BANK, qids: [inSession], mode: 'sequence' },
      'wrong-session-secret',
      { algorithm: 'HS256', expiresIn: '30m' },
    );
    const forgedRes = await request(app)
      .post('/api/practice/check')
      .set(bearer(token))
      .send({ sessionToken: forgedSession, questionId: inSession, answer: [0] });
    expect(forgedRes.body.code).toBe(1009);

    // 过期会话 → 1009
    const expiredSession = jwt.sign(
      { sub: 'user-zhangsan', bankId: OPEN_BANK, qids: [inSession], mode: 'sequence' },
      env.PRACTICE_SESSION_SECRET,
      { algorithm: 'HS256', expiresIn: '-1s' },
    );
    const expiredRes = await request(app)
      .post('/api/practice/check')
      .set(bearer(token))
      .send({ sessionToken: expiredSession, questionId: inSession, answer: [0] });
    expect(expiredRes.body.code).toBe(1009);

    // 他人会话（sub 不匹配）→ 1009
    const otherSession = jwt.sign(
      { sub: 'user-wangwu', bankId: OPEN_BANK, qids: [inSession], mode: 'sequence' },
      env.PRACTICE_SESSION_SECRET,
      { algorithm: 'HS256', expiresIn: '30m' },
    );
    const otherRes = await request(app)
      .post('/api/practice/check')
      .set(bearer(token))
      .send({ sessionToken: otherSession, questionId: inSession, answer: [0] });
    expect(otherRes.body.code).toBe(1009);

    // 未开放题库题目 + 合法签名会话（伪造 qids）→ 1009（双保险：题目必须开放）
    const closedSession = jwt.sign(
      { sub: 'user-zhangsan', bankId: OPEN_BANK, qids: ['q-07'], mode: 'sequence' },
      env.PRACTICE_SESSION_SECRET,
      { algorithm: 'HS256', expiresIn: '30m' },
    );
    const closedRes = await request(app)
      .post('/api/practice/check')
      .set(bearer(token))
      .send({ sessionToken: closedSession, questionId: 'q-07', answer: [0] });
    expect(closedRes.body.code).toBe(1009);
  });

  it('题型筛选：只返回指定题型；随机模式题量受限', async () => {
    const onlyMulti = await createSession(token, {
      bankId: OPEN_BANK,
      mode: 'sequence',
      types: ['multiple'],
    });
    expect(onlyMulti.questionIds.length).toBe(2);
    const byIds = await request(app)
      .get(`/api/practice/questions?ids=${onlyMulti.questionIds.join(',')}`)
      .set(bearer(token));
    for (const item of byIds.body.data as Array<{ type: string }>) {
      expect(item.type).toBe('multiple');
    }

    const rand = await createSession(token, { bankId: OPEN_BANK, mode: 'random', count: 2 });
    expect(rand.questionIds.length).toBe(2);
    expect(new Set(rand.questionIds).size).toBe(2);
  });
});

/* ================================================================== */
/* D. 判分口径一致性（练题 check ≡ 考试 grade）                         */
/* ================================================================== */

describe('D. 判分口径一致性', () => {
  it('同一题逐例：练题 check 结果 == 考试 grade 结果 == 权威纯函数', async () => {
    const token = await loginToken('wangwu', '123456', '198.51.100.80');
    const session = await createSession(token, { bankId: OPEN_BANK, mode: 'sequence' });

    const cases: Array<[string, number[], boolean]> = [
      ['q-01', [1], true],
      ['q-01', [0], false],
      ['q-01', [], false],
      ['q-01', [1, 0], false], // 单选多值 → 错
      ['q-03', [0, 1, 3], true],
      ['q-03', [3, 1, 0], true], // 多选顺序颠倒 → 对
      ['q-03', [0, 1], false], // 多选漏选 → 错
      ['q-03', [0, 1, 2], false], // 多选错选 → 错
      ['q-03', [0], false], // 多选只选一项 → 错
      ['q-03', [], false],
      ['q-05', [1], true],
      ['q-05', [0], false],
      ['q-06', [0], true],
    ];

    for (const [qid, answer, expected] of cases) {
      // 权威纯函数
      expect(isAnswerCorrect(Q[qid], answer), `${qid} ${JSON.stringify(answer)} 纯函数`).toBe(expected);

      // 练题 check
      const res = await request(app)
        .post('/api/practice/check')
        .set(bearer(token))
        .send({ sessionToken: session.sessionToken, questionId: qid, answer });
      expect(res.body.code, `${qid} ${JSON.stringify(answer)}`).toBe(0);
      expect(res.body.data.correct, `${qid} ${JSON.stringify(answer)} 练题`).toBe(expected);
      expect(res.body.data.correctAnswer).toEqual(Q[qid].answer);
      expect(res.body.data.type).toBe(Q[qid].type);

      // 考试 grade（构造仅含该题的快照）
      const record = {
        paperSnapshot: {
          questions: [
            { questionId: qid, score: 10, question: { id: qid, type: Q[qid].type, answer: Q[qid].answer } },
          ],
        },
        answers: { [qid]: answer },
      } as unknown as ExamRecordDto;
      expect(grade(record) > 0, `${qid} ${JSON.stringify(answer)} 考试`).toBe(expected);
    }
  });

  it('check 返回解析（非空字符串）', async () => {
    const token = await loginToken('wangwu', '123456', '198.51.100.81');
    const session = await createSession(token, { bankId: OPEN_BANK, mode: 'sequence' });
    const res = await request(app)
      .post('/api/practice/check')
      .set(bearer(token))
      .send({ sessionToken: session.sessionToken, questionId: 'q-01', answer: [1] });
    expect(typeof res.body.data.analysis).toBe('string');
    expect((res.body.data.analysis as string).length).toBeGreaterThan(0);
  });
});

/* ================================================================== */
/* E. 数据隔离红线                                                     */
/* ================================================================== */

describe('E. 数据隔离红线', () => {
  it('完整练题流程不写 exam_records（前后行数一致）', async () => {
    const before = await examRecordCount();
    const token = await loginToken('zhangsan', '123456', '198.51.100.90');
    const session = await createSession(token, { bankId: OPEN_BANK, mode: 'sequence' });
    await request(app)
      .post('/api/practice/check')
      .set(bearer(token))
      .send({ sessionToken: session.sessionToken, questionId: 'q-02', answer: [0] });
    await request(app)
      .put('/api/practice/progress')
      .set(bearer(token))
      .send({ bankId: OPEN_BANK, lastQuestionId: 'q-02' });
    await request(app).get('/api/practice/wrong-book').set(bearer(token));
    const after = await examRecordCount();
    expect(after).toBe(before);
  });

  it('练题代码路径不含考试域表名 / 不写 users·departments（源码静态扫描）', () => {
    const files = [
      '../modules/practice/practice.repo.ts',
      '../modules/practice/practice.service.ts',
      '../modules/practice/practice.router.ts',
      '../modules/practice/practice.session.ts',
      '../modules/practice/practice.time.ts',
      '../modules/practice/practiceSettings.repo.ts',
      '../modules/practice/practiceSettings.service.ts',
    ].map((p) => fileURLToPath(new URL(p, import.meta.url)));

    // 考试域表：练题代码路径**完全不出现**。
    // 注：`departments` 例外——仅允许「列级只读」取本人科室名（「我的」页展示），
    //     故不列入本正则，改由下方的 departmentsWrite 禁止其写操作。
    const forbiddenTables =
      /\b(exam_records|exams|papers|paper_questions|paper_bank_refs|import_batches)\b/;
    // 内网全局设置表：练题配置已独立到 practice_settings，练题代码**不得**读写 system_settings。
    const forbiddenSettingsTable = /\bsystem_settings\b/;
    const usersWrite = /(INSERT\s+INTO\s+users|UPDATE\s+users|DELETE\s+FROM\s+users)/i;
    const departmentsWrite = /(INSERT\s+INTO\s+departments|UPDATE\s+departments|DELETE\s+FROM\s+departments)/i;

    for (const file of files) {
      const raw = readFileSync(file, 'utf8');
      // 去掉块注释与行注释，仅扫描可执行代码
      const code = raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
      expect(forbiddenTables.test(code), `${file} 含考试域表名`).toBe(false);
      expect(forbiddenSettingsTable.test(code), `${file} 含 system_settings 引用`).toBe(false);
      expect(usersWrite.test(code), `${file} 含 users 写操作`).toBe(false);
      expect(departmentsWrite.test(code), `${file} 含 departments 写操作`).toBe(false);
    }
  });
});

/* ================================================================== */
/* F. 进度 / 错题本                                                    */
/* ================================================================== */

describe('F. 进度与错题本', () => {
  describe('进度按 (user_id, bank_id) 唯一；计数服务端权威重算（PUT 幂等 upsert）', () => {
    it('客户端伪造超大计数 / delta 一律被忽略；重复 PUT 不产生多行', async () => {
      const token = await loginToken('lisi', '123456', '198.51.100.100');

      // 服务端权威值：直接读 practice_answers 首答聚合（不信任任何请求体计数）
      const agg = await query<RowDataPacket[]>(
        `SELECT COUNT(*) AS done, COALESCE(SUM(pa.is_correct), 0) AS correct
           FROM practice_answers pa JOIN questions q ON q.id = pa.question_id
          WHERE pa.user_id = ? AND q.bank_id = ?`,
        ['user-lisi', OPEN_BANK],
      );
      const done = Number(agg[0].done);
      const correct = Number(agg[0].correct);

      // 请求体塞入伪造计数 + 增量 —— 服务端必须完全忽略，以 practice_answers 聚合为准
      const first = await request(app)
        .put('/api/practice/progress')
        .set(bearer(token))
        .send({
          bankId: OPEN_BANK,
          lastQuestionId: 'q-03',
          doneCount: 9999,
          correctCount: 9999,
          doneCountDelta: 9999,
          correctCountDelta: 9999,
        });
      expect(first.body.code).toBe(0);
      expect(first.body.data).toMatchObject({ lastQuestionId: 'q-03', doneCount: done, correctCount: correct });
      expect(first.body.data.doneCount).not.toBe(9999);

      // 再次 PUT：仍为权威值（幂等，不累加客户端增量）
      const second = await request(app)
        .put('/api/practice/progress')
        .set(bearer(token))
        .send({ bankId: OPEN_BANK, lastQuestionId: 'q-04', doneCountDelta: 100, correctCountDelta: 100 });
      expect(second.body.code).toBe(0);
      expect(second.body.data).toMatchObject({ lastQuestionId: 'q-04', doneCount: done, correctCount: correct });

      const rows = await query<RowDataPacket[]>(
        `SELECT COUNT(*) AS c FROM practice_progress WHERE user_id = ? AND bank_id = ?`,
        ['user-lisi', OPEN_BANK],
      );
      expect(Number(rows[0].c)).toBe(1);

      const get = await request(app).get(`/api/practice/progress?bankId=${OPEN_BANK}`).set(bearer(token));
      expect(get.body.data).toMatchObject({ doneCount: done, correctCount: correct, lastQuestionId: 'q-04' });
    });

    it('有真实作答时，PUT 后计数恒等于首答聚合（客户端 delta 无影响）', async () => {
      const token = await loginToken('lisi', '123456', '198.51.100.102');
      const session = await createSession(token, { bankId: OPEN_BANK, mode: 'sequence' });
      // q-01 答对（+1/+1）；q-02 答错（+1/+0）
      await request(app)
        .post('/api/practice/check')
        .set(bearer(token))
        .send({ sessionToken: session.sessionToken, questionId: 'q-01', answer: [1] });
      await request(app)
        .post('/api/practice/check')
        .set(bearer(token))
        .send({ sessionToken: session.sessionToken, questionId: 'q-02', answer: [0] });

      const put = await request(app)
        .put('/api/practice/progress')
        .set(bearer(token))
        .send({ bankId: OPEN_BANK, lastQuestionId: 'q-02', doneCountDelta: 9999, correctCountDelta: 9999 });
      expect(put.body.code).toBe(0);
      // 权威值 = 2 次首答（1 对 1 错），与请求体伪造的 9999 无关
      expect(put.body.data).toMatchObject({ doneCount: 2, correctCount: 1, lastQuestionId: 'q-02' });
    });

    it('未开放题库的进度查询 / 保存 → 404 / 1009', async () => {
      const token = await loginToken('lisi', '123456', '198.51.100.101');
      const get = await request(app).get(`/api/practice/progress?bankId=${CLOSED_BANK}`).set(bearer(token));
      expect(get.body.code).toBe(1009);
      const put = await request(app)
        .put('/api/practice/progress')
        .set(bearer(token))
        .send({ bankId: CLOSED_BANK });
      expect(put.body.code).toBe(1009);
    });
  });

  describe('作答统计以「首次作答」为准 + 错题本累计', () => {
    let token = '';
    let sessionToken = '';

    beforeAll(async () => {
      token = await loginToken(WRITER.username, WRITER.password, '198.51.100.110');
      const session = await createSession(token, { bankId: OPEN_BANK, mode: 'sequence' });
      sessionToken = session.sessionToken;
    });

    it('初始进度为零值', async () => {
      const res = await request(app).get(`/api/practice/progress?bankId=${OPEN_BANK}`).set(bearer(token));
      expect(res.body.code).toBe(0);
      expect(res.body.data).toMatchObject({ doneCount: 0, correctCount: 0, lastQuestionId: null });
    });

    it('首次答对 → 写入明细、进度 +1/+1', async () => {
      const res = await request(app)
        .post('/api/practice/check')
        .set(bearer(token))
        .send({ sessionToken, questionId: 'q-01', answer: [1] });
      expect(res.body.data.correct).toBe(true);

      const rows = await query<RowDataPacket[]>(
        `SELECT is_correct FROM practice_answers WHERE user_id = ? AND question_id = 'q-01'`,
        [WRITER.id],
      );
      expect(rows).toHaveLength(1);
      expect(Number(rows[0].is_correct)).toBe(1);

      const p = await request(app).get(`/api/practice/progress?bankId=${OPEN_BANK}`).set(bearer(token));
      expect(p.body.data).toMatchObject({ doneCount: 1, correctCount: 1, lastQuestionId: 'q-01' });
    });

    it('重做答错 → 不覆盖首次结果、进度不变，但计入错题本', async () => {
      const res = await request(app)
        .post('/api/practice/check')
        .set(bearer(token))
        .send({ sessionToken, questionId: 'q-01', answer: [0] });
      expect(res.body.data.correct).toBe(false);

      // 首次结果未被覆盖，且仍只有一行
      const rows = await query<RowDataPacket[]>(
        `SELECT is_correct FROM practice_answers WHERE user_id = ? AND question_id = 'q-01'`,
        [WRITER.id],
      );
      expect(rows).toHaveLength(1);
      expect(Number(rows[0].is_correct)).toBe(1);

      // 进度不变
      const p = await request(app).get(`/api/practice/progress?bankId=${OPEN_BANK}`).set(bearer(token));
      expect(p.body.data).toMatchObject({ doneCount: 1, correctCount: 1 });

      // 错题本记录 q-01（wrong_count=1）
      const wb = await request(app).get('/api/practice/wrong-book').set(bearer(token));
      const item = (wb.body.data.list as Array<{ id: string; wrongCount: number }>).find((x) => x.id === 'q-01');
      expect(item?.wrongCount).toBe(1);
    });

    it('同一题重复答错 → wrong_count 累计；首次错误使进度 done+1/correct+0', async () => {
      await request(app)
        .post('/api/practice/check')
        .set(bearer(token))
        .send({ sessionToken, questionId: 'q-02', answer: [0] });
      await request(app)
        .post('/api/practice/check')
        .set(bearer(token))
        .send({ sessionToken, questionId: 'q-02', answer: [0] });

      const rows = await query<RowDataPacket[]>(
        `SELECT wrong_count FROM practice_wrong_book WHERE user_id = ? AND question_id = 'q-02'`,
        [WRITER.id],
      );
      expect(rows).toHaveLength(1);
      expect(Number(rows[0].wrong_count)).toBe(2);

      const p = await request(app).get(`/api/practice/progress?bankId=${OPEN_BANK}`).set(bearer(token));
      expect(p.body.data).toMatchObject({ doneCount: 2, correctCount: 1 });
    });

    it('错题本列表含累计次数；错题复习会话可生成（含题库过滤）', async () => {
      const wb = await request(app).get('/api/practice/wrong-book').set(bearer(token));
      expect(wb.body.code).toBe(0);
      const list = wb.body.data.list as Array<{ id: string; wrongCount: number }>;
      const q02 = list.find((x) => x.id === 'q-02');
      expect(q02?.wrongCount).toBe(2);

      const reans = await request(app)
        .post('/api/practice/wrong-book/reans')
        .set(bearer(token))
        .send({ bankId: OPEN_BANK });
      expect(reans.body.code).toBe(0);
      const ids = reans.body.data.questionIds as string[];
      expect(ids).toContain('q-01');
      expect(ids).toContain('q-02');

      const allReans = await request(app).post('/api/practice/wrong-book/reans').set(bearer(token)).send({});
      expect(allReans.body.code).toBe(0);
      expect((allReans.body.data.questionIds as string[]).length).toBeGreaterThanOrEqual(2);
    });

    it('错题复习指定未开放题库 → 404 / 1009', async () => {
      const res = await request(app)
        .post('/api/practice/wrong-book/reans')
        .set(bearer(token))
        .send({ bankId: CLOSED_BANK });
      expect(res.status).toBe(404);
      expect(res.body.code).toBe(1009);
    });
  });
});

/* ================================================================== */
/* G. 加固项（QA 复验后）：限流覆盖 / 停用即时失效 / 进度权威计数       */
/* ================================================================== */

describe('G. 加固项', () => {
  it('限流覆盖：POST /sessions 同 IP+设备 超阈值 → 429 / 1010', async () => {
    const ip = '198.51.100.140';
    const token = await loginToken('zhangsan', '123456', '198.51.100.141');
    const limit = env.PRACTICE_RATE_SESSION_PER_MIN;
    for (let i = 0; i < limit; i += 1) {
      const res = await request(app)
        .post('/api/practice/sessions')
        .set(client(ip, 'sess'))
        .set(bearer(token))
        .send({ bankId: OPEN_BANK, mode: 'sequence', count: 1 });
      expect(res.body.code, `session#${i + 1}`).toBe(0);
    }
    const over = await request(app)
      .post('/api/practice/sessions')
      .set(client(ip, 'sess'))
      .set(bearer(token))
      .send({ bankId: OPEN_BANK, mode: 'sequence', count: 1 });
    expect(over.status).toBe(429);
    expect(over.body.code).toBe(1010);
  });

  it('限流覆盖：GET/PUT /progress 与 /wrong-book(reans) 同 IP+设备 超阈值 → 429 / 1010', async () => {
    const token = await loginToken('zhangsan', '123456', '198.51.100.142');

    // progress 分组（GET 与 PUT 共用同一键）
    const pIp = '198.51.100.143';
    const pLimit = env.PRACTICE_RATE_PROGRESS_PER_MIN;
    for (let i = 0; i < pLimit; i += 1) {
      const res = await request(app)
        .get(`/api/practice/progress?bankId=${OPEN_BANK}`)
        .set(client(pIp, 'prog'))
        .set(bearer(token));
      expect(res.body.code, `progress#${i + 1}`).toBe(0);
    }
    const pOver = await request(app)
      .put('/api/practice/progress')
      .set(client(pIp, 'prog'))
      .set(bearer(token))
      .send({ bankId: OPEN_BANK });
    expect(pOver.status).toBe(429);
    expect(pOver.body.code).toBe(1010);

    // wrongbook 分组（GET 与 POST 共用同一键）
    const wIp = '198.51.100.144';
    const wLimit = env.PRACTICE_RATE_WRONGBOOK_PER_MIN;
    for (let i = 0; i < wLimit; i += 1) {
      const res = await request(app)
        .get('/api/practice/wrong-book')
        .set(client(wIp, 'wb'))
        .set(bearer(token));
      expect(res.body.code, `wrongbook#${i + 1}`).toBe(0);
    }
    const wOver = await request(app)
      .post('/api/practice/wrong-book/reans')
      .set(client(wIp, 'wb'))
      .set(bearer(token))
      .send({});
    expect(wOver.status).toBe(429);
    expect(wOver.body.code).toBe(1010);
  });

  it('内网停用账号：已签发练题 token 即时失效（401 / 1002）', async () => {
    const id = 'user-qa-disable';
    const hash = await bcrypt.hash('qa-disable-pass', 10);
    await query(
      `INSERT INTO users (id, username, password_hash, name, role, department_id, status, created_at)
       VALUES (?, 'qa_disable', ?, 'QA停用用户', 'examinee', NULL, 'active', ?)
       ON DUPLICATE KEY UPDATE status = 'active', password_hash = VALUES(password_hash)`,
      [id, hash, nowDb()],
    );
    const token = await loginToken('qa_disable', 'qa-disable-pass', '198.51.100.150');

    // 停用前：验签通过且账号 active → 可访问
    const before = await request(app).get('/api/practice/banks').set(bearer(token));
    expect(before.body.code).toBe(0);

    // 内网侧停用（模拟后台停用账号）
    await query(`UPDATE users SET status = 'disabled' WHERE id = ?`, [id]);

    // 同一 token：验签仍通过，但状态校验失败 → 即时 401 / 1002（无需等待 JWT 过期）
    const after = await request(app).get('/api/practice/banks').set(bearer(token));
    expect(after.status).toBe(401);
    expect(after.body.code).toBe(1002);

    // 复原，保证测试可重复
    await query(`UPDATE users SET status = 'active' WHERE id = ?`, [id]);
  });
});

/* ================================================================== */
/* H. QA 独立补充验证（第2轮）—— 不依赖工程师所写用例                    */
/* ================================================================== */

describe('H. QA 独立补充验证（第2轮）', () => {
  it('正常作答频率不被误伤：一次练习的 banks/sessions/check/progress/wrong-book 全程无 429', async () => {
    const token = await loginToken('wangwu', '123456', '198.51.100.160');
    const ip = '198.51.100.161';
    const fp = 'normal';

    const banks = await request(app).get('/api/practice/banks').set(client(ip, fp)).set(bearer(token));
    expect(banks.body.code).toBe(0);

    const sess = await request(app)
      .post('/api/practice/sessions')
      .set(client(ip, fp))
      .set(bearer(token))
      .send({ bankId: OPEN_BANK, mode: 'sequence' });
    expect(sess.body.code).toBe(0);
    const sessionToken = sess.body.data.sessionToken as string;
    const qids = sess.body.data.questionIds as string[];

    // 逐题作答：每题 1 次 check + 1 次 PUT progress（模拟真实作答节奏）
    for (let i = 0; i < qids.length; i += 1) {
      const check = await request(app)
        .post('/api/practice/check')
        .set(client(ip, fp))
        .set(bearer(token))
        .send({ sessionToken, questionId: qids[i], answer: [0] });
      expect(check.body.code, `check#${i + 1}`).toBe(0);

      const put = await request(app)
        .put('/api/practice/progress')
        .set(client(ip, fp))
        .set(bearer(token))
        .send({ bankId: OPEN_BANK, lastQuestionId: qids[i] });
      expect(put.body.code, `progress#${i + 1}`).toBe(0);
    }

    const wb = await request(app).get('/api/practice/wrong-book').set(client(ip, fp)).set(bearer(token));
    expect(wb.body.code).toBe(0);

    // 全程不应出现限流
    expect([banks, sess, wb].some((r) => r.status === 429)).toBe(false);
  });

  it('停用账号：/auth/me 即时 401/1002；停用期间无法重新登录取新 token；恢复后同一 token 可用', async () => {
    const id = 'user-qa-disable2';
    const username = 'qa_disable2';
    const password = 'qa-disable2-pass';
    const hash = await bcrypt.hash(password, 10);
    await query(
      `INSERT INTO users (id, username, password_hash, name, role, department_id, status, created_at)
       VALUES (?, ?, ?, 'QA停用2', 'examinee', NULL, 'active', ?)
       ON DUPLICATE KEY UPDATE status = 'active', password_hash = VALUES(password_hash)`,
      [id, username, hash, nowDb()],
    );
    const token = await loginToken(username, password, '198.51.100.170');

    const me0 = await request(app).get('/api/practice/auth/me').set(bearer(token));
    expect(me0.body.code).toBe(0);

    try {
      await query(`UPDATE users SET status = 'disabled' WHERE id = ?`, [id]);

      const me1 = await request(app).get('/api/practice/auth/me').set(bearer(token));
      expect(me1.status).toBe(401);
      expect(me1.body.code).toBe(1002);

      // 停用期间重新登录被拒，且文案统一（不暴露账号存在/状态）
      const relogin = await login(username, password, { ip: '198.51.100.171' });
      expect(relogin.status).toBe(401);
      expect(relogin.body.code).toBe(1002);
      expect(relogin.body.message).toBe('账号或密码不正确');
    } finally {
      await query(`UPDATE users SET status = 'active' WHERE id = ?`, [id]);
    }

    // 恢复后同一 token 立即恢复可用
    const me2 = await request(app).get('/api/practice/auth/me').set(bearer(token));
    expect(me2.body.code).toBe(0);
    expect(me2.body.data).toMatchObject({ id });
  });

  it('不存在/已删除用户的练题 token → 401 / 1002（status=null 分支）', async () => {
    const ghost = jwt.sign({ sub: 'user-does-not-exist-xyz', role: 'examinee' }, env.PRACTICE_JWT_SECRET, {
      algorithm: 'HS256',
      expiresIn: '12h',
    });
    const res = await request(app).get('/api/practice/banks').set(bearer(ghost));
    expect(res.status).toBe(401);
    expect(res.body.code).toBe(1002);
  });

  it('进度权威（独立复算）：PUT 恒等于 practice_answers 首答聚合，客户端计数完全无效', async () => {
    const id = 'user-qa-auth';
    const username = 'qa_auth';
    const password = 'qa-auth-pass';
    const hash = await bcrypt.hash(password, 10);
    await query(
      `INSERT INTO users (id, username, password_hash, name, role, department_id, status, created_at)
       VALUES (?, ?, ?, 'QA进度权威', 'examinee', NULL, 'active', ?)
       ON DUPLICATE KEY UPDATE status = 'active', password_hash = VALUES(password_hash)`,
      [id, username, hash, nowDb()],
    );
    const token = await loginToken(username, password, '198.51.100.190');
    const s = await createSession(token, { bankId: OPEN_BANK, mode: 'sequence' });

    // 1 对（q-03 multiple [0,1,3]）1 错（q-05 judge 正确答案 [1]，答 [0]）
    await request(app)
      .post('/api/practice/check')
      .set(bearer(token))
      .send({ sessionToken: s.sessionToken, questionId: 'q-03', answer: [0, 1, 3] });
    await request(app)
      .post('/api/practice/check')
      .set(bearer(token))
      .send({ sessionToken: s.sessionToken, questionId: 'q-05', answer: [0] });

    const put = await request(app)
      .put('/api/practice/progress')
      .set(bearer(token))
      .send({
        bankId: OPEN_BANK,
        lastQuestionId: 'q-05',
        doneCount: 12345,
        correctCount: 12345,
        doneCountDelta: 12345,
        correctCountDelta: 12345,
      });
    expect(put.body.code).toBe(0);
    expect(put.body.data).toMatchObject({ doneCount: 2, correctCount: 1, lastQuestionId: 'q-05' });

    const agg = await query<RowDataPacket[]>(
      `SELECT COUNT(*) AS done, COALESCE(SUM(pa.is_correct), 0) AS correct
         FROM practice_answers pa JOIN questions q ON q.id = pa.question_id
        WHERE pa.user_id = ? AND q.bank_id = ?`,
      [id, OPEN_BANK],
    );
    expect(Number(agg[0].done)).toBe(2);
    expect(Number(agg[0].correct)).toBe(1);

    // 单行 + 重复 PUT 稳定
    await request(app).put('/api/practice/progress').set(bearer(token)).send({ bankId: OPEN_BANK });
    const rows = await query<RowDataPacket[]>(
      `SELECT COUNT(*) AS c FROM practice_progress WHERE user_id = ? AND bank_id = ?`,
      [id, OPEN_BANK],
    );
    expect(Number(rows[0].c)).toBe(1);
  });
});
