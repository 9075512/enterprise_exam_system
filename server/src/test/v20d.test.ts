/**
 * v2.0⑥ 考生首页个性化（科室级可配置）—— 集成测试。
 *
 * 背景：v2.0② 把首页数据收敛到 `GET /api/home/summary` 后，快捷入口 / 推荐题库仍恒为
 * 内置默认。本次新增 `home_dept_configs` 表，按科室下发**差异化**内容：
 *
 *   生效优先级：本科室配置行 → 全局默认行（department_id = '*'）→ 内置默认
 *
 * 本文件护栏：
 *  1) 未配置时零回归（快捷入口全部启用、无推荐题库）；
 *  2) 全局默认行对**所有**科室生效；科室行只影响本科室且优先于全局行；
 *  3) 文案覆盖（空文案回落目录默认）；
 *  4) 推荐题库只接受 `allow_practice = 1` 的题库，且**解析时二次过滤**
 *     （配置后被关闭对外练题 → 自动摘除，不留死链）；
 *  5) 目录扩容兼容：旧配置未提及的新 key 默认启用（不静默消失）；
 *  6) 管理端鉴权（author / examinee → 1003）与参数校验（1001）。
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import type { RowDataPacket } from 'mysql2/promise';

import { app } from '../app.js';
import { prepareTestDb } from './db.js';
import { closePool, query } from '../db/pool.js';
import { nowDb } from '../utils/datetime.js';
import type {
  HomeConfigOverviewDto,
  HomeDeptConfigDto,
  HomeShortcutConfigItemDto,
  HomeSummaryDto,
} from '../types/domain.js';

/* ============================ 常量与工具 ============================ */

/** 全局默认行哨兵 id。 */
const GLOBAL_ID = '*';

/** 三个考生：研发部 / 市场部 / 未分配科室（逐一验证「科室级」差异） */
const U_RD = { id: 'user-qa-home-rd', username: 'qa_home_rd', password: 'qa-home-1', dept: 'dept-rd' };
const U_MKT = { id: 'user-qa-home-mkt', username: 'qa_home_mkt', password: 'qa-home-2', dept: 'dept-mkt' };
const U_NONE = { id: 'user-qa-home-none', username: 'qa_home_none', password: 'qa-home-3', dept: null };

const bearer = (token: string): Record<string, string> => ({ Authorization: `Bearer ${token}` });

/** 内网登录，返回 token。 */
async function internalLogin(username: string, password: string): Promise<string> {
  const res = await request(app).post('/api/auth/login').send({ username, password });
  expect(res.body.code, JSON.stringify(res.body)).toBe(0);
  return (res.body.data.token ?? res.body.data.accessToken) as string;
}

/** 考生首页聚合。 */
async function summary(token: string): Promise<HomeSummaryDto> {
  const res = await request(app).get('/api/home/summary').set(bearer(token));
  expect(res.body.code, JSON.stringify(res.body)).toBe(0);
  return res.body.data as HomeSummaryDto;
}

/** 便捷断言：快捷入口 → { key: enabled }。 */
function enabledMap(s: HomeSummaryDto): Record<string, boolean> {
  return Object.fromEntries(s.shortcuts.map((x) => [x.key, x.enabled]));
}

/** 便捷断言：快捷入口 → { key: text }。 */
function textMap(s: HomeSummaryDto): Record<string, string> {
  return Object.fromEntries(s.shortcuts.map((x) => [x.key, x.text]));
}

/** 保存配置。 */
function putConfig(
  token: string,
  deptId: string,
  shortcuts: HomeShortcutConfigItemDto[],
  recommendedBankIds: string[] = [],
) {
  return request(app)
    .put(`/api/home/configs/${encodeURIComponent(deptId)}`)
    .set(bearer(token))
    .send({ shortcuts, recommendedBankIds });
}

/** 删除配置。 */
function delConfig(token: string, deptId: string) {
  return request(app).delete(`/api/home/configs/${encodeURIComponent(deptId)}`).set(bearer(token));
}

/** 全部目录 key（启用）。 */
function allEnabled(): HomeShortcutConfigItemDto[] {
  return [
    { key: 'my-exams', enabled: true },
    { key: 'my-scores', enabled: true },
    { key: 'my-retakes', enabled: true },
    { key: 'notifications', enabled: true },
  ];
}

/** 清空全部首页配置（用例间互不干扰）。 */
async function clearConfigs(): Promise<void> {
  await query(`DELETE FROM home_dept_configs`);
}

/* ============================ 准备 / 清理 ============================ */

let adminToken = '';
let authorToken = '';
const tokens: Record<string, string> = {};

beforeAll(async () => {
  await prepareTestDb();
  for (const u of [U_RD, U_MKT, U_NONE]) {
    const hash = await bcrypt.hash(u.password, 10);
    await query(
      `INSERT INTO users (id, username, password_hash, name, role, role_id, department_id, status, created_at)
       VALUES (?, ?, ?, ?, 'examinee', 'examinee', ?, 'active', ?)
       ON DUPLICATE KEY UPDATE id = id`,
      [u.id, u.username, hash, `QA首页-${u.username}`, u.dept, nowDb()],
    );
    tokens[u.id] = await internalLogin(u.username, u.password);
  }
  adminToken = await internalLogin('admin', 'admin123');
  authorToken = await internalLogin('author', 'author123');
}, 30000);

afterAll(async () => {
  await closePool();
});

/* ============================ 1. 未配置 → 零回归 ============================ */

describe('首页个性化 · 未配置时零回归', () => {
  it('快捷入口全部启用、推荐题库为空、目录顺序不变', async () => {
    await clearConfigs();
    for (const id of [U_RD.id, U_MKT.id, U_NONE.id]) {
      const s = await summary(tokens[id]);
      expect(enabledMap(s)).toEqual({
        'my-exams': true,
        'my-scores': true,
        'my-retakes': true,
        notifications: true,
      });
      expect(s.shortcuts.map((x) => x.key)).toEqual(['my-exams', 'my-scores', 'my-retakes', 'notifications']);
      expect(s.recommendedBanks).toEqual([]);
    }
  });

  it('未分配科室的考生走全局默认（不报错）', async () => {
    await clearConfigs();
    const s = await summary(tokens[U_NONE.id]);
    expect(s.shortcuts.every((x) => x.enabled)).toBe(true);
  });
});

/* ============================ 2. 全局默认行 ============================ */

describe('首页个性化 · 全局默认行', () => {
  it('全局行对所有科室生效（含未分配科室）', async () => {
    await clearConfigs();
    const saved = await putConfig(
      adminToken,
      GLOBAL_ID,
      allEnabled().map((s) => (s.key === 'my-retakes' ? { ...s, enabled: false } : s)),
    );
    expect(saved.body.code, JSON.stringify(saved.body)).toBe(0);
    expect(saved.body.data.isGlobal).toBe(true);
    expect(saved.body.data.departmentName).toBe('全局默认');

    for (const id of [U_RD.id, U_MKT.id, U_NONE.id]) {
      const s = await summary(tokens[id]);
      expect(enabledMap(s)['my-retakes']).toBe(false);
      expect(enabledMap(s)['my-exams']).toBe(true);
    }
  });

  it('文案覆盖生效；空文案回落目录默认文案', async () => {
    await clearConfigs();
    const res = await putConfig(adminToken, GLOBAL_ID, [
      { key: 'my-exams', enabled: true, text: '去考试' },
      { key: 'my-scores', enabled: true, text: '   ' },
      { key: 'my-retakes', enabled: true },
      { key: 'notifications', enabled: true },
    ]);
    expect(res.body.code, JSON.stringify(res.body)).toBe(0);

    const t = textMap(await summary(tokens[U_RD.id]));
    expect(t['my-exams']).toBe('去考试');
    expect(t['my-scores']).toBe('我的成绩');
    expect(t['my-retakes']).toBe('我的补考');
    // 目录固有字段不受覆盖影响（path/desc/icon 恒由服务端目录决定）
    const s = await summary(tokens[U_RD.id]);
    const it = s.shortcuts.find((x) => x.key === 'my-exams')!;
    expect(it.path).toBe('/exam/my');
    expect(it.icon).toBe('AlarmClock');
  });
});

/* ============================ 3. 科室行优先 ============================ */

describe('首页个性化 · 科室级覆盖', () => {
  it('科室行只影响本科室，其它科室仍走全局默认', async () => {
    await clearConfigs();
    // 全局：关闭「消息中心」
    await putConfig(
      adminToken,
      GLOBAL_ID,
      allEnabled().map((s) => (s.key === 'notifications' ? { ...s, enabled: false } : s)),
    );
    // 研发部：关闭「我的补考」（其余沿用目录默认）
    const res = await putConfig(
      adminToken,
      U_RD.dept,
      allEnabled().map((s) => (s.key === 'my-retakes' ? { ...s, enabled: false } : s)),
    );
    expect(res.body.code, JSON.stringify(res.body)).toBe(0);

    const rd = enabledMap(await summary(tokens[U_RD.id]));
    expect(rd['my-retakes']).toBe(false); // 来自科室行
    expect(rd['notifications']).toBe(true); // 科室行存在 → 不再读全局行（覆盖语义）

    const mkt = enabledMap(await summary(tokens[U_MKT.id]));
    expect(mkt['my-retakes']).toBe(true); // 全局行未关闭 → 启用
    expect(mkt['notifications']).toBe(false); // 来自全局行
  });

  it('科室行完全覆盖全局行（不做合并：全局关闭的可被科室重新开启）', async () => {
    await clearConfigs();
    await putConfig(
      adminToken,
      GLOBAL_ID,
      allEnabled().map((s) => (s.key === 'my-scores' ? { ...s, enabled: false } : s)),
    );
    await putConfig(adminToken, U_MKT.dept, allEnabled());

    expect(enabledMap(await summary(tokens[U_MKT.id]))['my-scores']).toBe(true);
    // 研发部无科室行 → 仍受全局行约束
    expect(enabledMap(await summary(tokens[U_RD.id]))['my-scores']).toBe(false);
  });
});

/* ============================ 4. 推荐练题题库 ============================ */

describe('首页个性化 · 推荐练题题库', () => {
  it('推荐题库下发给本科室考生（含题量与推荐理由）', async () => {
    await clearConfigs();
    const res = await putConfig(adminToken, U_RD.dept, allEnabled(), ['bank-security']);
    expect(res.body.code, JSON.stringify(res.body)).toBe(0);

    const s = await summary(tokens[U_RD.id]);
    expect(s.recommendedBanks).toHaveLength(1);
    expect(s.recommendedBanks[0].bankId).toBe('bank-security');
    expect(s.recommendedBanks[0].bankName).toBe('安全知识题库');
    expect(s.recommendedBanks[0].questionCount).toBeGreaterThan(0);
    expect(s.recommendedBanks[0].reason).toBe('本科室推荐');

    // 其它科室不受影响
    expect((await summary(tokens[U_MKT.id])).recommendedBanks).toEqual([]);
  });

  it('题库被关闭对外练题后自动摘除（不留死链）', async () => {
    await clearConfigs();
    await putConfig(adminToken, U_RD.dept, allEnabled(), ['bank-security']);
    expect((await summary(tokens[U_RD.id])).recommendedBanks).toHaveLength(1);

    // 管理端把该题库关闭对外练题（复用 v1.6 的批量开放接口）
    const off = await request(app)
      .post('/api/banks/practice/batch')
      .set(bearer(adminToken))
      .send({ bankIds: ['bank-security'], allowPractice: false });
    expect(off.body.code, JSON.stringify(off.body)).toBe(0);

    // 配置未变，但解析结果已过滤 → 死链不留
    expect((await summary(tokens[U_RD.id])).recommendedBanks).toEqual([]);

    await request(app)
      .post('/api/banks/practice/batch')
      .set(bearer(adminToken))
      .send({ bankIds: ['bank-security'], allowPractice: true });
    // 恢复后无需重新配置即可再次生效
    expect((await summary(tokens[U_RD.id])).recommendedBanks).toHaveLength(1);
  });

  it('保存时校验：不存在 / 未开放对外练题的题库 → 1001', async () => {
    await clearConfigs();
    const miss = await putConfig(adminToken, U_RD.dept, allEnabled(), ['bank-not-exist']);
    expect(miss.body.code).toBe(1001);
    expect(String(miss.body.message)).toContain('不存在');

    await request(app)
      .post('/api/banks/practice/batch')
      .set(bearer(adminToken))
      .send({ bankIds: ['bank-culture'], allowPractice: false });
    const closed = await putConfig(adminToken, U_RD.dept, allEnabled(), ['bank-culture']);
    expect(closed.body.code).toBe(1001);
    expect(String(closed.body.message)).toContain('未开放对外练题');
    await request(app)
      .post('/api/banks/practice/batch')
      .set(bearer(adminToken))
      .send({ bankIds: ['bank-culture'], allowPractice: true });
  });

  it('超出数量上限（>6）→ 1001（zod 层拦截）', async () => {
    await clearConfigs();
    const res = await putConfig(adminToken, U_RD.dept, allEnabled(), [
      'b1', 'b2', 'b3', 'b4', 'b5', 'b6', 'b7',
    ]);
    expect(res.body.code).toBe(1001);
  });
});

/* ============================ 5. 参数校验与鉴权 ============================ */

describe('首页个性化 · 校验与鉴权', () => {
  it('未知快捷入口 key → 1001', async () => {
    await clearConfigs();
    const res = await putConfig(adminToken, U_RD.dept, [{ key: 'unknown-entry', enabled: true }]);
    expect(res.body.code).toBe(1001);
    expect(String(res.body.message)).toContain('未知快捷入口');
  });

  it('全部快捷入口关闭 → 1001（至少保留一个）', async () => {
    await clearConfigs();
    const res = await putConfig(
      adminToken,
      U_RD.dept,
      allEnabled().map((s) => ({ ...s, enabled: false })),
    );
    expect(res.body.code).toBe(1001);
    expect(String(res.body.message)).toContain('至少保留一个');
  });

  it('文案超长（>12 字）→ 1001', async () => {
    await clearConfigs();
    const res = await putConfig(adminToken, U_RD.dept, [
      { key: 'my-exams', enabled: true, text: '这是一个非常冗长的快捷入口文案' },
    ]);
    expect(res.body.code).toBe(1001);
  });

  it('科室不存在 → 1001', async () => {
    await clearConfigs();
    const res = await putConfig(adminToken, 'dept-not-exist', allEnabled());
    expect(res.body.code).toBe(1001);
    expect(String(res.body.message)).toContain('科室不存在');
  });

  it('非 admin 读写配置 → 1003', async () => {
    await clearConfigs();
    expect((await request(app).get('/api/home/configs').set(bearer(authorToken))).body.code).toBe(1003);
    expect((await request(app).get('/api/home/configs').set(bearer(tokens[U_RD.id]))).body.code).toBe(1003);
    expect((await putConfig(authorToken, U_RD.dept, allEnabled())).body.code).toBe(1003);
    expect((await delConfig(authorToken, U_RD.dept)).body.code).toBe(1003);
    expect((await request(app).get('/api/home/configs')).body.code).toBe(1002);
  });
});

/* ============================ 6. 管理端总览与重置 ============================ */

describe('首页个性化 · 管理端总览', () => {
  it('GET /configs 返回目录 / 科室列表 / 已配置项', async () => {
    await clearConfigs();
    await putConfig(adminToken, GLOBAL_ID, [
      { key: 'my-exams', enabled: false },
      { key: 'my-scores', enabled: true },
      { key: 'my-retakes', enabled: true },
      { key: 'notifications', enabled: true },
    ]);
    await putConfig(adminToken, U_RD.dept, allEnabled(), ['bank-security']);

    const res = await request(app).get('/api/home/configs').set(bearer(adminToken));
    expect(res.body.code, JSON.stringify(res.body)).toBe(0);
    const d = res.body.data as HomeConfigOverviewDto;

    expect(d.catalog.map((c) => c.key)).toEqual(['my-exams', 'my-scores', 'my-retakes', 'notifications']);
    expect(d.departments.map((x) => x.id)).toContain('dept-rd');
    expect(d.departments.map((x) => x.id)).toContain('dept-mkt');

    const ids = d.configs.map((c) => c.departmentId).sort();
    expect(ids).toEqual([GLOBAL_ID, 'dept-rd'].sort());

    const rd = d.configs.find((c) => c.departmentId === 'dept-rd') as HomeDeptConfigDto;
    expect(rd.departmentName).toBe('研发部');
    expect(rd.isGlobal).toBe(false);
    expect(rd.recommendedBankIds).toEqual(['bank-security']);
    expect(rd.recommendedBanks[0].bankName).toBe('安全知识题库');
    expect(rd.updatedBy).toBeTruthy();
    expect(rd.updatedByName).toBeTruthy();

    const g = d.configs.find((c) => c.departmentId === GLOBAL_ID) as HomeDeptConfigDto;
    expect(g.isGlobal).toBe(true);
    expect(g.departmentName).toBe('全局默认');
    expect(d.globalShortcuts).toHaveLength(4);
  });

  it('保存为覆盖语义：同科室二次保存直接生效，不产生重复行', async () => {
    await clearConfigs();
    await putConfig(adminToken, U_RD.dept, allEnabled(), ['bank-security']);
    await putConfig(
      adminToken,
      U_RD.dept,
      allEnabled().map((s) => (s.key === 'my-exams' ? { ...s, enabled: false } : s)),
      ['bank-culture'],
    );

    const rows = await query<RowDataPacket[]>(`SELECT COUNT(*) AS c FROM home_dept_configs`);
    expect(Number(rows[0]?.c ?? 0)).toBe(1);
    expect(enabledMap(await summary(tokens[U_RD.id]))['my-exams']).toBe(false);
    const banks = (await summary(tokens[U_RD.id])).recommendedBanks.map((b) => b.bankId);
    expect(banks).toEqual(['bank-culture']);
  });

  it('DELETE 回到全局默认；重复 DELETE 幂等', async () => {
    await clearConfigs();
    await putConfig(adminToken, GLOBAL_ID, allEnabled().map((s) => (s.key === 'my-retakes' ? { ...s, enabled: false } : s)));
    await putConfig(adminToken, U_RD.dept, allEnabled());

    expect((await delConfig(adminToken, U_RD.dept)).body.code).toBe(0);
    const after = enabledMap(await summary(tokens[U_RD.id]));
    expect(after['my-retakes']).toBe(false); // 回落全局行

    expect((await delConfig(adminToken, U_RD.dept)).body.code).toBe(0); // 幂等
  });

  it('全局默认行删除后回到内置默认（全部启用）', async () => {
    await clearConfigs();
    await putConfig(adminToken, GLOBAL_ID, allEnabled().map((s) => (s.key === 'my-exams' ? { ...s, enabled: false } : s)));
    expect(enabledMap(await summary(tokens[U_MKT.id]))['my-exams']).toBe(false);

    expect((await delConfig(adminToken, GLOBAL_ID)).body.code).toBe(0);
    expect(enabledMap(await summary(tokens[U_MKT.id]))['my-exams']).toBe(true);
  });

  it('目录扩容兼容：旧配置未提及的新 key 默认启用', async () => {
    await clearConfigs();
    // 模拟「配置保存时目录只有 my-exams」的历史数据（直插 DB，绕过接口校验）
    await query(
      `INSERT INTO home_dept_configs (department_id, shortcuts, recommended_banks, updated_by, updated_at)
       VALUES (?, ?, JSON_ARRAY(), 'user-admin', ?)`,
      [U_RD.dept, JSON.stringify([{ key: 'my-exams', enabled: false }]), nowDb()],
    );
    const map = enabledMap(await summary(tokens[U_RD.id]));
    expect(map['my-exams']).toBe(false);
    // 未出现在旧配置中的目录 key 补为启用，不静默消失
    expect(map['my-scores']).toBe(true);
    expect(map['my-retakes']).toBe(true);
    expect(map['notifications']).toBe(true);
  });
});
