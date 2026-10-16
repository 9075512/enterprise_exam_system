/**
 * 系统设置接口测试（/api/settings）。
 * 覆盖：公开读免登录 / 完整读需登录 / 写需 admin / zod 边界中文文案 /
 * 默认值合并（旧数据缺字段或整行缺失）/ 设置实时生效（密码最小长度、默认密码）。
 *
 * 数据落在测试库 enterprise_exam_system_test（由 prepareTestDb 重建），
 * 每个会改动设置的用例结束前恢复默认值，避免相互干扰。
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../app.js';
import { prepareTestDb } from './db.js';
import { closePool, query } from '../db/pool.js';
import { signToken } from '../middleware/auth.js';
import { DEFAULT_SETTINGS } from '../modules/settings/settings.defaults.js';

/** 构造 Bearer 请求头。 */
const bearer = (token: string): { Authorization: string } => ({ Authorization: `Bearer ${token}` });

const admin = signToken({ sub: 'user-admin', role: 'admin', departmentId: '' });
const author = signToken({ sub: 'user-author', role: 'author', departmentId: '' });
const zs = signToken({ sub: 'user-zhangsan', role: 'examinee', departmentId: 'dept-rd' });

/** 以 admin 身份把设置整体恢复为默认值。 */
async function resetSettings(): Promise<void> {
  await request(app).put('/api/settings').set(bearer(admin)).send(DEFAULT_SETTINGS);
}

describe('系统设置（/api/settings）', () => {
  beforeAll(async () => {
    await prepareTestDb();
  }, 30000);

  afterAll(async () => {
    await resetSettings();
    await closePool();
  });

  describe('GET /settings/public（无需登录）', () => {
    it('无 Token → 200，且仅含 4 个公开字段', async () => {
      const res = await request(app).get('/api/settings/public');
      expect(res.status).toBe(200);
      expect(res.body.code).toBe(0);
      expect(Object.keys(res.body.data).sort()).toEqual([
        'copyright',
        'loginSlogan',
        'systemName',
        'systemShortName',
      ]);
      expect(res.body.data.systemName).toBe(DEFAULT_SETTINGS.systemName);
      expect(res.body.data.systemShortName).toBe(DEFAULT_SETTINGS.systemShortName);
    });
  });

  describe('鉴权与权限', () => {
    it('GET /settings 无 Token → 401 / 1002', async () => {
      const res = await request(app).get('/api/settings');
      expect(res.status).toBe(401);
      expect(res.body.code).toBe(1002);
    });

    it('GET /settings 考生可读 → 200 且返回完整字段', async () => {
      const res = await request(app).get('/api/settings').set(bearer(zs));
      expect(res.status).toBe(200);
      expect(res.body.code).toBe(0);
      expect(Object.keys(res.body.data).sort()).toEqual(Object.keys(DEFAULT_SETTINGS).sort());
    });

    it('PUT /settings 无 Token → 401 / 1002', async () => {
      const res = await request(app).put('/api/settings').send(DEFAULT_SETTINGS);
      expect(res.status).toBe(401);
      expect(res.body.code).toBe(1002);
    });

    it('PUT /settings author → 403 / 1003（且不生效）', async () => {
      const res = await request(app)
        .put('/api/settings')
        .set(bearer(author))
        .send({ ...DEFAULT_SETTINGS, cheatCountThreshold: 9 });
      expect(res.status).toBe(403);
      expect(res.body.code).toBe(1003);

      const after = await request(app).get('/api/settings').set(bearer(admin));
      expect(after.body.data.cheatCountThreshold).toBe(DEFAULT_SETTINGS.cheatCountThreshold);
    });

    it('PUT /settings 考生 → 403 / 1003', async () => {
      const res = await request(app)
        .put('/api/settings')
        .set(bearer(zs))
        .send({ ...DEFAULT_SETTINGS, cheatCountThreshold: 9 });
      expect(res.status).toBe(403);
      expect(res.body.code).toBe(1003);
    });
  });

  describe('PUT /settings（admin 更新并回读）', () => {
    it('题库分类可维护、去除首尾空格，旧客户端保存时保留分类', async () => {
      const categories = [' 临床技能 ', '规章制度'];
      const saved = await request(app).put('/api/settings').set(bearer(admin))
        .send({ ...DEFAULT_SETTINGS, bankCategories: categories });
      expect(saved.status).toBe(200);
      expect(saved.body.data.bankCategories).toEqual(['临床技能', '规章制度']);
      const read = await request(app).get('/api/settings').set(bearer(author));
      expect(read.body.data.bankCategories).toEqual(['临床技能', '规章制度']);
      const { bankCategories: _categories, ...legacy } = DEFAULT_SETTINGS;
      const oldClient = await request(app).put('/api/settings').set(bearer(admin)).send(legacy);
      expect(oldClient.body.data.bankCategories).toEqual(['临床技能', '规章制度']);
      await resetSettings();
    });

    it.each([[], [' '], ['重复', ' 重复 '], ['长'.repeat(61)], Array.from({ length: 101 }, (_, i) => `分类${i}`)]
      .map((values) => ({ values })))('拒绝空、重复、超长或过多分类 %#', async ({ values }) => {
        const res = await request(app).put('/api/settings').set(bearer(admin))
          .send({ ...DEFAULT_SETTINGS, bankCategories: values });
        expect(res.status).toBe(400);
      });

    it('cheatCountThreshold 改为 5 → 200 返回新值，GET 回读一致', async () => {
      const res = await request(app)
        .put('/api/settings')
        .set(bearer(admin))
        .send({ ...DEFAULT_SETTINGS, cheatCountThreshold: 5 });
      expect(res.status).toBe(200);
      expect(res.body.code).toBe(0);
      expect(res.body.data.cheatCountThreshold).toBe(5);

      const read = await request(app).get('/api/settings').set(bearer(zs));
      expect(read.body.data.cheatCountThreshold).toBe(5);

      await resetSettings();
    });
  });

  describe('校验边界（越界 → 400 / 1001 中文文案）', () => {
    const cases: Array<{ field: string; value: unknown; contains: string }> = [
      { field: 'cheatCountThreshold', value: 0, contains: '切屏次数阈值必须为 1~99' },
      { field: 'minPasswordLength', value: 3, contains: '密码最小长度必须为 6~32' },
      { field: 'importMaxFileMb', value: 99, contains: '导入文件大小上限必须为 1~50MB' },
      { field: 'examDefaultDuration', value: 0, contains: '考试默认时长必须为 1~600 分钟' },
      { field: 'cheatSecondsThreshold', value: 4, contains: '切屏累计秒数阈值必须为 5~3600' },
      { field: 'importMaxRows', value: 0, contains: '导入最大行数必须为 1~50000' },
    ];

    for (const c of cases) {
      it(`${c.field} = ${String(c.value)} → 400 / 1001 且文案为「${c.contains}」`, async () => {
        const res = await request(app)
          .put('/api/settings')
          .set(bearer(admin))
          .send({ ...DEFAULT_SETTINGS, [c.field]: c.value });
        expect(res.status).toBe(400);
        expect(res.body.code).toBe(1001);
        expect(res.body.message).toBe(c.contains);
        expect(res.body.message).toMatch(/[\u4e00-\u9fa5]/);
      });
    }
  });

  describe('默认值合并（兼容旧数据）', () => {
    it('库中 JSON 缺字段 → GET 仍返回完整对象，缺失字段回退默认', async () => {
      await query(`UPDATE system_settings SET settings = ? WHERE id = 1`, [
        JSON.stringify({ cheatCountThreshold: 7 }),
      ]);

      const res = await request(app).get('/api/settings').set(bearer(zs));
      expect(res.status).toBe(200);
      expect(Object.keys(res.body.data).sort()).toEqual(Object.keys(DEFAULT_SETTINGS).sort());
      expect(res.body.data.cheatCountThreshold).toBe(7);
      expect(res.body.data.importMaxRows).toBe(DEFAULT_SETTINGS.importMaxRows);
      expect(res.body.data.systemName).toBe(DEFAULT_SETTINGS.systemName);

      await resetSettings();
    });

    it('整行缺失 → GET 仍返回完整默认设置', async () => {
      await query(`DELETE FROM system_settings WHERE id = 1`);

      const res = await request(app).get('/api/settings').set(bearer(zs));
      expect(res.status).toBe(200);
      expect(res.body.data).toEqual(DEFAULT_SETTINGS);

      await resetSettings();
    });
  });

  describe('设置实时生效', () => {
    it('minPasswordLength=8 → changePassword 传 6 位新密码被拒（文案含 8）', async () => {
      await request(app)
        .put('/api/settings')
        .set(bearer(admin))
        .send({ ...DEFAULT_SETTINGS, minPasswordLength: 8 });

      const res = await request(app)
        .put('/api/auth/password')
        .set(bearer(zs))
        .send({ oldPassword: '123456', newPassword: 'abc123' });
      expect(res.status).toBe(400);
      expect(res.body.code).toBe(1001);
      expect(res.body.message).toContain('8');
      expect(res.body.message).toMatch(/[\u4e00-\u9fa5]/);

      await resetSettings();
    });

    it('defaultPassword=abc12345 → 新建用户不带密码，可用该默认密码登录成功', async () => {
      await request(app)
        .put('/api/settings')
        .set(bearer(admin))
        .send({ ...DEFAULT_SETTINGS, defaultPassword: 'abc12345' });

      const created = await request(app)
        .post('/api/users')
        .set(bearer(admin))
        .send({
          username: 'settings-pw-user',
          name: '设置密码用户',
          role: 'examinee',
          departmentId: 'dept-rd',
        });
      expect(created.body.code).toBe(0);

      const login = await request(app)
        .post('/api/auth/login')
        .send({ username: 'settings-pw-user', password: 'abc12345' });
      expect(login.status).toBe(200);
      expect(login.body.code).toBe(0);
      expect(login.body.data.user.username).toBe('settings-pw-user');

      await resetSettings();
    });
  });
});
