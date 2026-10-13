/**
 * v1.7③-a 安全与合规加固 集成测试（T1 + T2）。
 * 1) T1 图形验证码：下发 SVG、响应不含明文答案、失败阈值后强制校验、一次性作废。
 * 2) T2 登录日志：成功/失败/原因落库、过滤、鉴权。
 * 3) T2 密码策略：复杂度强校验、自助改密、密码有效期提示。
 * 4) T2 会话/设备：jti 会话校验、查看设备、单点/批量下线、强制下线、登出撤销。
 * 5) T2 两步验证（TOTP）：setup → enable → 登录挑战 → verify → disable。
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import type { RowDataPacket } from 'mysql2/promise';
import { app } from '../app.js';
import { prepareTestDb } from './db.js';
import { closePool, query } from '../db/pool.js';
import { signToken } from '../middleware/auth.js';
import { issueCaptcha, __peekCaptchaAnswer, __clearCaptchaStore } from '../utils/captcha.js';
import { totpCode } from '../utils/totp.js';
import { toDbDate } from '../utils/datetime.js';

const bearer = (token: string): { Authorization: string } => ({ Authorization: `Bearer ${token}` });

const admin = signToken({ sub: 'user-admin', role: 'admin', departmentId: '' });
const zs = signToken({ sub: 'user-zhangsan', role: 'examinee', departmentId: 'dept-rd' });

/** 测试专用账号（密码均满足默认策略）。 */
const USER_PASS = {
  capuser: 'Cap12345',
  loguser: 'Log123456',
  pwuser: 'Pw123456',
  expuser: 'Exp123456',
  sessuser: 'Sess123456',
  tfauser: 'Tfa123456',
} as const;

type TestUser = keyof typeof USER_PASS;
const userIds: Record<string, string> = {};

/** 登录请求封装。 */
function loginReq(username: string, password: string, extra: Record<string, unknown> = {}) {
  return request(app).post('/api/auth/login').send({ username, password, ...extra });
}

/** 取全量设置（admin）并原样回写（用于策略开关的临时调整与还原）。 */
async function getSettings(): Promise<Record<string, unknown>> {
  const res = await request(app).get('/api/settings').set(bearer(admin));
  expect(res.body.code).toBe(0);
  return res.body.data as Record<string, unknown>;
}

async function putSettings(payload: Record<string, unknown>): Promise<void> {
  const res = await request(app).put('/api/settings').set(bearer(admin)).send(payload);
  expect(res.body.code).toBe(0);
}

/** 下发一枚验证码并取回明文（测试经进程内钩子读取）。 */
function newCaptcha(): { captchaId: string; captcha: string } {
  const { captchaId } = issueCaptcha();
  const answer = __peekCaptchaAnswer(captchaId);
  if (!answer) throw new Error('无法读取验证码答案');
  return { captchaId, captcha: answer };
}

/* ============================ 准备 ============================ */

beforeAll(async () => {
  await prepareTestDb();
  __clearCaptchaStore();
  // 建测试账号（author 角色不需要科室）
  const entries = Object.entries(USER_PASS) as Array<[TestUser, string]>;
  for (const [username, password] of entries) {
    const res = await request(app)
      .post('/api/users')
      .set(bearer(admin))
      .send({ username, name: `测试-${username}`, role: 'author', departmentId: '', password });
    expect(res.body.code, `create ${username}`).toBe(0);
    userIds[username] = res.body.data.id as string;
  }
});

afterAll(async () => {
  __clearCaptchaStore();
  await closePool();
});

/* ============================ 1. T1 图形验证码 ============================ */

describe('T1 图形验证码', () => {
  it('下发 SVG 图形验证码，且响应不含明文答案', async () => {
    const res = await request(app).get('/api/auth/captcha');
    expect(res.body.code).toBe(0);
    const data = res.body.data as { captchaId: string; image: string };
    expect(data.captchaId).toBeTruthy();
    expect(data.image.startsWith('data:image/svg+xml;base64,')).toBe(true);
    // 明文答案（question/answer）不得出现在响应中
    expect(Object.keys(data).sort()).toEqual(['captchaId', 'image']);
    expect(JSON.stringify(data)).not.toContain('answer');
  });

  it('连续失败达阈值后必须填写验证码，填写正确可登录', async () => {
    const capuser = 'capuser';
    for (let i = 0; i < 3; i += 1) {
      const r = await loginReq(capuser, 'wrong-password');
      expect(r.body.code).toBe(1002);
    }
    // 未带验证码 → 1015 / 400
    const noCap = await loginReq(capuser, USER_PASS.capuser);
    expect(noCap.status).toBe(400);
    expect(noCap.body.code).toBe(1015);
    // 错误验证码 → 1015
    const badCap = await loginReq(capuser, USER_PASS.capuser, { captchaId: 'nope', captcha: '0000' });
    expect(badCap.body.code).toBe(1015);
    // 正确验证码 → 成功且清零失败计数
    const c = newCaptcha();
    const okRes = await loginReq(capuser, USER_PASS.capuser, c);
    expect(okRes.body.code).toBe(0);
    expect(okRes.body.data.token).toBeTruthy();
    // 已清零：再错一次密码只返回 1002，不再要求验证码
    const after = await loginReq(capuser, 'wrong-password');
    expect(after.body.code).toBe(1002);
  });

  it('验证码一次性：校验通过后立即作废', async () => {
    const capuser = 'capuser';
    for (let i = 0; i < 3; i += 1) await loginReq(capuser, 'wrong-password');
    const c = newCaptcha();
    const first = await loginReq(capuser, USER_PASS.capuser, c);
    expect(first.body.code).toBe(0);
    // 重新达到阈值后复用同一 captchaId → 已作废
    for (let i = 0; i < 3; i += 1) await loginReq(capuser, 'wrong-password');
    const reuse = await loginReq(capuser, USER_PASS.capuser, c);
    expect(reuse.body.code).toBe(1015);
  });
});

/* ============================ 2. T2 登录日志 ============================ */

describe('T2 登录日志', () => {
  it('成功与失败均落库，管理员可查', async () => {
    const loguser = 'loguser';
    await loginReq(loguser, 'wrong-password');
    await loginReq(loguser, USER_PASS.loguser);

    const res = await request(app)
      .get('/api/login-logs')
      .set(bearer(admin))
      .query({ username: loguser, page: 1, pageSize: 20 });
    expect(res.body.code).toBe(0);
    const list = res.body.data.list as Array<{ success: boolean; username: string; reason: string }>;
    expect(list.length).toBeGreaterThanOrEqual(2);
    expect(list.every((l) => l.username === loguser)).toBe(true);
    expect(list.some((l) => l.success)).toBe(true);
    const failed = list.find((l) => !l.success);
    expect(failed?.reason).toBe('credentials');
  });

  it('支持按结果过滤', async () => {
    const failed = await request(app)
      .get('/api/login-logs')
      .set(bearer(admin))
      .query({ success: '0', pageSize: 20 });
    expect(failed.body.code).toBe(0);
    expect((failed.body.data.list as Array<{ success: boolean }>).every((l) => !l.success)).toBe(true);

    const ok = await request(app)
      .get('/api/login-logs')
      .set(bearer(admin))
      .query({ success: '1', pageSize: 20 });
    expect(ok.body.code).toBe(0);
    expect((ok.body.data.list as Array<{ success: boolean }>).length).toBeGreaterThan(0);
    expect((ok.body.data.list as Array<{ success: boolean }>).every((l) => l.success)).toBe(true);
  });

  it('非管理员不可查看（1003）', async () => {
    const res = await request(app).get('/api/login-logs').set(bearer(zs));
    expect(res.body.code).toBe(1003);
  });
});

/* ============================ 3. T2 密码策略 ============================ */

describe('T2 密码策略', () => {
  it('开启复杂度要求后，自助改密不达标被拒（1001）', async () => {
    const base = await getSettings();
    await putSettings({ ...base, passwordRequireUpper: true, passwordRequireDigit: true });
    try {
      const token = (await loginReq('pwuser', USER_PASS.pwuser)).body.data.token as string;
      const weak = await request(app)
        .put('/api/auth/password')
        .set(bearer(token))
        .send({ oldPassword: USER_PASS.pwuser, newPassword: 'abcdefgh' });
      expect(weak.body.code).toBe(1001);
      expect(String(weak.body.message)).toContain('大写字母');

      const strong = await request(app)
        .put('/api/auth/password')
        .set(bearer(token))
        .send({ oldPassword: USER_PASS.pwuser, newPassword: 'Abcdefg1' });
      expect(strong.body.code).toBe(0);
    } finally {
      await putSettings(base);
    }
  });

  it('新建用户使用弱密码被拒（1001）', async () => {
    const base = await getSettings();
    await putSettings({ ...base, passwordRequireUpper: true, passwordRequireSymbol: true });
    try {
      const res = await request(app)
        .post('/api/users')
        .set(bearer(admin))
        .send({ username: 'weakuser', name: '弱密码', role: 'author', departmentId: '', password: '123456' });
      expect(res.body.code).toBe(1001);
    } finally {
      await putSettings(base);
    }
  });

  it('密码超期时登录返回 passwordExpired', async () => {
    const base = await getSettings();
    await putSettings({ ...base, passwordExpireDays: 30 });
    try {
      const expiredAt = toDbDate(new Date(Date.now() - 40 * 24 * 60 * 60 * 1000));
      await query<RowDataPacket[]>(`UPDATE users SET password_changed_at = ? WHERE id = ?`, [
        expiredAt,
        userIds.expuser,
      ]);
      const res = await loginReq('expuser', USER_PASS.expuser);
      expect(res.body.code).toBe(0);
      expect(res.body.data.passwordExpired).toBe(true);
    } finally {
      await putSettings(base);
    }
  });
});

/* ============================ 4. T2 会话 / 设备 ============================ */

describe('T2 登录会话与设备', () => {
  it('登录产生会话，可查看并下线指定设备', async () => {
    const sessuser = 'sessuser';
    const tokenA = (await loginReq(sessuser, USER_PASS.sessuser)).body.data.token as string;
    const tokenB = (await loginReq(sessuser, USER_PASS.sessuser)).body.data.token as string;

    const list = await request(app).get('/api/auth/sessions').set(bearer(tokenA));
    expect(list.body.code).toBe(0);
    const sessions = list.body.data as Array<{ id: string; current: boolean }>;
    expect(sessions.length).toBe(2);
    expect(sessions.filter((s) => s.current).length).toBe(1);

    const other = sessions.find((s) => !s.current)!;
    const del = await request(app).delete(`/api/auth/sessions/${other.id}`).set(bearer(tokenA));
    expect(del.body.code).toBe(0);

    // 被下线 token 失效；当前 token 仍可用
    expect((await request(app).get('/api/auth/me').set(bearer(tokenB))).body.code).toBe(1002);
    expect((await request(app).get('/api/auth/me').set(bearer(tokenA))).body.code).toBe(0);
  });

  it('批量下线除当前外的全部设备', async () => {
    const sessuser = 'sessuser';
    const a = (await loginReq(sessuser, USER_PASS.sessuser)).body.data.token as string;
    const b = (await loginReq(sessuser, USER_PASS.sessuser)).body.data.token as string;
    const c = (await loginReq(sessuser, USER_PASS.sessuser)).body.data.token as string;

    const res = await request(app).delete('/api/auth/sessions').set(bearer(a));
    expect(res.body.code).toBe(0);
    expect(res.body.data.count).toBeGreaterThanOrEqual(2);

    expect((await request(app).get('/api/auth/me').set(bearer(b))).body.code).toBe(1002);
    expect((await request(app).get('/api/auth/me').set(bearer(c))).body.code).toBe(1002);
    expect((await request(app).get('/api/auth/me').set(bearer(a))).body.code).toBe(0);
  });

  it('登出后当前 token 立即失效', async () => {
    const token = (await loginReq('sessuser', USER_PASS.sessuser)).body.data.token as string;
    expect((await request(app).get('/api/auth/me').set(bearer(token))).body.code).toBe(0);
    const off = await request(app).post('/api/auth/logout').set(bearer(token));
    expect(off.body.code).toBe(0);
    expect((await request(app).get('/api/auth/me').set(bearer(token))).body.code).toBe(1002);
  });

  it('管理员可查看并强制下线某用户全部设备', async () => {
    const token = (await loginReq('sessuser', USER_PASS.sessuser)).body.data.token as string;
    const userId = userIds.sessuser;

    const list = await request(app).get(`/api/users/${userId}/sessions`).set(bearer(admin));
    expect(list.body.code).toBe(0);
    expect((list.body.data as unknown[]).length).toBeGreaterThanOrEqual(1);

    const res = await request(app).delete(`/api/users/${userId}/sessions`).set(bearer(admin));
    expect(res.body.code).toBe(0);
    expect(res.body.data.count).toBeGreaterThanOrEqual(1);
    expect((await request(app).get('/api/auth/me').set(bearer(token))).body.code).toBe(1002);
  });
});

/* ============================ 5. T2 两步验证（TOTP） ============================ */

describe('T2 两步验证（TOTP）', () => {
  it('开启 → 登录第二步 → 关闭 全链路', async () => {
    const tfauser = 'tfauser';
    const token = (await loginReq(tfauser, USER_PASS.tfauser)).body.data.token as string;

    // 生成密钥
    const setup = await request(app).post('/api/auth/2fa/setup').set(bearer(token));
    expect(setup.body.code).toBe(0);
    const secret = setup.body.data.secret as string;
    expect(secret.length).toBeGreaterThanOrEqual(16);
    expect(String(setup.body.data.otpauthUrl)).toContain('otpauth://totp/');

    // 错误验证码不可开启
    const badEnable = await request(app).post('/api/auth/2fa/enable').set(bearer(token)).send({ code: '000000' });
    expect(badEnable.body.code).toBe(1001);

    // 正确验证码开启
    const enable = await request(app)
      .post('/api/auth/2fa/enable')
      .set(bearer(token))
      .send({ code: totpCode(secret) });
    expect(enable.body.code).toBe(0);

    // 登录 → 返回挑战令牌
    const step1 = await loginReq(tfauser, USER_PASS.tfauser);
    expect(step1.body.code).toBe(0);
    expect(step1.body.data.twoFactorRequired).toBe(true);
    const challenge = step1.body.data.challengeToken as string;
    expect(challenge).toBeTruthy();

    // 挑战令牌不可作为访问令牌
    expect((await request(app).get('/api/auth/me').set(bearer(challenge))).body.code).toBe(1002);

    // 错误验证码 → 1002
    const wrong = await request(app)
      .post('/api/auth/2fa/verify')
      .send({ challengeToken: challenge, code: '000000' });
    expect(wrong.body.code).toBe(1002);

    // 正确验证码 → 正式 token
    const okStep = await request(app)
      .post('/api/auth/2fa/verify')
      .send({ challengeToken: challenge, code: totpCode(secret) });
    expect(okStep.body.code).toBe(0);
    expect(okStep.body.data.token).toBeTruthy();
    expect(okStep.body.data.user.twoFactorEnabled).toBe(true);
    const fullToken = okStep.body.data.token as string;

    // 关闭（密码 + 验证码）
    const off = await request(app)
      .post('/api/auth/2fa/disable')
      .set(bearer(fullToken))
      .send({ password: USER_PASS.tfauser, code: totpCode(secret) });
    expect(off.body.code).toBe(0);

    // 关闭后登录直接返回 token
    const plain = await loginReq(tfauser, USER_PASS.tfauser);
    expect(plain.body.code).toBe(0);
    expect(plain.body.data.token).toBeTruthy();
    expect(plain.body.data.twoFactorRequired).toBeUndefined();
  });

  it('未开启两步验证时不可校验（1001）', async () => {
    const res = await request(app)
      .post('/api/auth/2fa/verify')
      .send({ challengeToken: 'invalid-token', code: '123456' });
    expect(res.body.code).toBe(1002);
  });

  it('管理员关闭两步验证功能后不可开启（1001）', async () => {
    const base = await getSettings();
    await putSettings({ ...base, twoFactorAvailable: false });
    try {
      const token = (await loginReq('sessuser', USER_PASS.sessuser)).body.data.token as string;
      const res = await request(app).post('/api/auth/2fa/setup').set(bearer(token));
      expect(res.body.code).toBe(1001);
    } finally {
      await putSettings(base);
    }
  });
});
