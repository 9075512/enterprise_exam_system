/**
 * v1.8② U2 —— 两步验证增强（恢复码 + 管理员强制重置）集成测试。
 *
 * 覆盖：
 *  1) 恢复码纯函数：生成 / 归一化 / 格式判别 / 模板渲染（twoFactorReset 事件）；
 *  2) 启用 2FA 一次性下发 10 个恢复码；
 *  3) 登录第二步使用恢复码（一次性：命中即作废、重复使用失败、格式非法失败）；
 *  4) 账号安全策略返回剩余恢复码数量；
 *  5) 重新生成恢复码：旧码失效、新码可用，并写审计；
 *  6) 管理员强制重置：清空 2FA、作废恢复码、撤销会话、写审计、发通知；之后登录不再要求 2FA。
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../app.js';
import { prepareTestDb } from './db.js';
import { closePool } from '../db/pool.js';
import { signToken } from '../middleware/auth.js';
import { totpCode } from '../utils/totp.js';
import {
  generateRecoveryCode,
  generateRecoveryCodes,
  isRecoveryCodeFormat,
  normalizeRecoveryCode,
  RECOVERY_CODE_COUNT,
} from '../utils/recoveryCode.js';
import { renderEvent, NOTIFY_TEMPLATES_DEFAULT } from '../utils/notifyTemplate.js';
import type { Page, NotificationDto, AccountSecurityPolicyDto, RecoveryCodesDto } from '../types/domain.js';

const bearer = (token: string): { Authorization: string } => ({ Authorization: `Bearer ${token}` });

const admin = signToken({ sub: 'user-admin', role: 'admin', departmentId: '' });
const zs = signToken({ sub: 'user-zhangsan', role: 'examinee', departmentId: 'dept-rd' });

const ZS_PASSWORD = '123456';

beforeAll(async () => {
  await prepareTestDb();
});

afterAll(async () => {
  await closePool();
});

/* ============================ 1. 纯函数 ============================ */

describe('U2 恢复码（纯函数）', () => {
  it('生成的恢复码格式为 XXXXX-XXXXX 且互不重复', () => {
    const one = generateRecoveryCode();
    expect(isRecoveryCodeFormat(one)).toBe(true);

    const many = generateRecoveryCodes(RECOVERY_CODE_COUNT);
    expect(many).toHaveLength(RECOVERY_CODE_COUNT);
    expect(new Set(many).size).toBe(RECOVERY_CODE_COUNT);
    expect(many.every((c) => isRecoveryCodeFormat(c))).toBe(true);
  });

  it('归一化兼容小写 / 空格 / 无连字符，并区分 TOTP 6 位码', () => {
    expect(normalizeRecoveryCode('abcd2-efgh3')).toBe('ABCD2-EFGH3');
    expect(normalizeRecoveryCode(' abcd2 efgh3 ')).toBe('ABCD2-EFGH3');
    expect(normalizeRecoveryCode('abcd2efgh3')).toBe('ABCD2-EFGH3');
    // 6 位纯数字验证码不是恢复码格式
    expect(isRecoveryCodeFormat('123456')).toBe(false);
    // 含易混字符（0/O/1/I/L）应判为非法
    expect(isRecoveryCodeFormat('ABCD0-EFGH1')).toBe(false);
  });

  it('twoFactorReset 事件默认模板可渲染', () => {
    expect(NOTIFY_TEMPLATES_DEFAULT.twoFactorReset.title).toBe('两步验证已被重置');
    const rendered = renderEvent(undefined, 'twoFactorReset', { username: 'zhangsan' });
    expect(rendered.content).toContain('zhangsan');
  });
});

/* ============================ 2. 集成用例 ============================ */

let recoveryCodes: string[] = [];
let secret = '';

describe('U2 启用 2FA 与恢复码下发', () => {
  it('启用两步验证后一次性下发 10 个恢复码', async () => {
    const setup = await request(app).post('/api/auth/2fa/setup').set(bearer(zs));
    expect(setup.body.code).toBe(0);
    secret = setup.body.data.secret as string;
    expect(secret).toBeTruthy();

    const enable = await request(app)
      .post('/api/auth/2fa/enable')
      .set(bearer(zs))
      .send({ code: totpCode(secret) });
    expect(enable.body.code).toBe(0);
    const data = enable.body.data as RecoveryCodesDto;
    expect(data.recoveryCodes).toHaveLength(10);
    expect(data.recoveryCodes.every((c) => isRecoveryCodeFormat(c))).toBe(true);
    recoveryCodes = data.recoveryCodes;
  });

  it('账号安全策略返回 twoFactorEnabled 与剩余恢复码数量', async () => {
    const res = await request(app).get('/api/auth/2fa/policy').set(bearer(zs));
    expect(res.body.code).toBe(0);
    const policy = res.body.data as AccountSecurityPolicyDto;
    expect(policy.twoFactorEnabled).toBe(true);
    expect(policy.recoveryCodesRemaining).toBe(10);
  });

  it('错误验证码无法启用（未启用时先 setup）', async () => {
    const res = await request(app)
      .post('/api/auth/2fa/enable')
      .set(bearer(zs))
      .send({ code: '000000' });
    expect(res.body.code).not.toBe(0);
  });
});

describe('U2 登录第二步使用恢复码', () => {
  it('恢复码可完成第二步登录，且命中后立即作废', async () => {
    // 第一步：账号密码 → 需要 2FA
    const login = await request(app).post('/api/auth/login').send({ username: 'zhangsan', password: ZS_PASSWORD });
    expect(login.body.code).toBe(0);
    expect(login.body.data.twoFactorRequired).toBe(true);
    const challengeToken = login.body.data.challengeToken as string;
    expect(challengeToken).toBeTruthy();

    // 第二步：用第 1 个恢复码
    const used = recoveryCodes[0];
    const verify = await request(app).post('/api/auth/2fa/verify').send({ challengeToken, code: used });
    expect(verify.body.code).toBe(0);
    expect(verify.body.data.token).toBeTruthy();

    // 剩余数量 -1
    const policy = await request(app).get('/api/auth/2fa/policy').set(bearer(zs));
    expect((policy.body.data as AccountSecurityPolicyDto).recoveryCodesRemaining).toBe(9);

    // 同一恢复码再次使用 → 失败（一次性）
    const login2 = await request(app).post('/api/auth/login').send({ username: 'zhangsan', password: ZS_PASSWORD });
    const challenge2 = login2.body.data.challengeToken as string;
    const reuse = await request(app).post('/api/auth/2fa/verify').send({ challengeToken: challenge2, code: used });
    expect(reuse.body.code).not.toBe(0);
  });

  it('格式非法的码（如 6 位数字）无法通过', async () => {
    const login = await request(app).post('/api/auth/login').send({ username: 'zhangsan', password: ZS_PASSWORD });
    const challenge = login.body.data.challengeToken as string;
    const res = await request(app).post('/api/auth/2fa/verify').send({ challengeToken: challenge, code: '123456' });
    expect(res.body.code).not.toBe(0);
  });

  it('TOTP 动态码仍可用（开启 2FA 后正常路径不受影响）', async () => {
    const login = await request(app).post('/api/auth/login').send({ username: 'zhangsan', password: ZS_PASSWORD });
    const challenge = login.body.data.challengeToken as string;
    const res = await request(app)
      .post('/api/auth/2fa/verify')
      .send({ challengeToken: challenge, code: totpCode(secret) });
    expect(res.body.code).toBe(0);
    expect(res.body.data.token).toBeTruthy();
  });
});

describe('U2 重新生成恢复码', () => {
  it('重新生成后旧码失效、新码可用，并写审计', async () => {
    const oldCode = recoveryCodes[1];
    const regen = await request(app)
      .post('/api/auth/2fa/recovery-codes')
      .set(bearer(zs))
      .send({ password: ZS_PASSWORD, code: totpCode(secret) });
    expect(regen.body.code).toBe(0);
    const fresh = (regen.body.data as RecoveryCodesDto).recoveryCodes;
    expect(fresh).toHaveLength(10);
    expect(fresh).not.toContain(oldCode);

    // 剩余恢复码恢复为 10
    const policy = await request(app).get('/api/auth/2fa/policy').set(bearer(zs));
    expect((policy.body.data as AccountSecurityPolicyDto).recoveryCodesRemaining).toBe(10);

    // 旧码已失效
    const login = await request(app).post('/api/auth/login').send({ username: 'zhangsan', password: ZS_PASSWORD });
    const challenge = login.body.data.challengeToken as string;
    const oldTry = await request(app).post('/api/auth/2fa/verify').send({ challengeToken: challenge, code: oldCode });
    expect(oldTry.body.code).not.toBe(0);

    // 新码可用
    const login2 = await request(app).post('/api/auth/login').send({ username: 'zhangsan', password: ZS_PASSWORD });
    const challenge2 = login2.body.data.challengeToken as string;
    const newTry = await request(app)
      .post('/api/auth/2fa/verify')
      .send({ challengeToken: challenge2, code: fresh[0] });
    expect(newTry.body.code).toBe(0);

    // 审计留痕
    const logs = await request(app)
      .get('/api/audit-logs')
      .query({ action: 'user.two_factor_reset', pageSize: 20 })
      .set(bearer(admin));
    expect(logs.body.code).toBe(0);
    expect(logs.body.data.total).toBeGreaterThanOrEqual(1);

    recoveryCodes = fresh;
  });

  it('密码不正确时拒绝重新生成', async () => {
    const res = await request(app)
      .post('/api/auth/2fa/recovery-codes')
      .set(bearer(zs))
      .send({ password: 'wrong-password', code: totpCode(secret) });
    expect(res.body.code).not.toBe(0);
  });
});

describe('U2 管理员强制重置两步验证', () => {
  it('重置后清空 2FA、作废恢复码、写审计并发通知；登录不再要求第二步', async () => {
    const reset = await request(app).post('/api/users/user-zhangsan/2fa/reset').set(bearer(admin));
    expect(reset.body.code).toBe(0);

    // 策略：已关闭、剩余 0
    const policy = await request(app).get('/api/auth/2fa/policy').set(bearer(zs));
    const p = policy.body.data as AccountSecurityPolicyDto;
    expect(p.twoFactorEnabled).toBe(false);
    expect(p.recoveryCodesRemaining).toBe(0);

    // 旧恢复码不再有效（账号已无 2FA，登录直接成功且不需要 2FA）
    const login = await request(app).post('/api/auth/login').send({ username: 'zhangsan', password: ZS_PASSWORD });
    expect(login.body.code).toBe(0);
    expect(login.body.data.twoFactorRequired).toBeFalsy();
    expect(login.body.data.token).toBeTruthy();

    // 审计留痕
    const logs = await request(app)
      .get('/api/audit-logs')
      .query({ action: 'user.two_factor_reset', pageSize: 20 })
      .set(bearer(admin));
    expect(logs.body.data.total).toBeGreaterThanOrEqual(2); // 本人重新生成 1 次 + 管理员重置 1 次

    // 站内信通知
    const list = await request(app).get('/api/notifications').set(bearer(zs));
    expect(list.body.code).toBe(0);
    const page = list.body.data as Page<NotificationDto>;
    const hit = page.list.find((n) => n.title === '两步验证已被重置');
    expect(hit).toBeTruthy();
    expect(hit!.content).toContain('zhangsan');
  });

  it('对未开启 2FA 的账号重复重置 → 1001', async () => {
    const res = await request(app).post('/api/users/user-zhangsan/2fa/reset').set(bearer(admin));
    expect(res.body.code).toBe(1001);
  });

  it('仅 admin 可重置（出题人 → 1003）', async () => {
    const author = signToken({ sub: 'user-author', role: 'author', departmentId: '' });
    const res = await request(app).post('/api/users/user-zhangsan/2fa/reset').set(bearer(author));
    expect(res.body.code).toBe(1003);
  });
});
