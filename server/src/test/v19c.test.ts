/**
 * v1.9⑥ 公告与轮播图 —— 集成测试。
 *
 * 背景：管理端此前没有面向考生的内容发布能力；本次新增 announcements / banners 两张表，
 * 一份内容可选择发布到「考试端 / 练题端 / 两端」，并支持启停、置顶、排序与生效时间窗。
 * 本文件锁死以下口径：
 *   1) 管理端接口仅 admin 可访问（未登录 401、author/examinee 403）；
 *   2) 入参校验：标题/图片必填、时间窗必须 endAt > startAt（越界/非法 → 1001）；
 *   3) 列表过滤（target / enabled / keyword）与分页 total 同口径；
 *   4) 考生侧可见性**服务端统一判定**：enabled=1 + target ∈ {scope, both} + 时间窗内；
 *      任一条件不满足即不可见；置顶优先、轮播按 sortOrder 升序；
 *   5) 考试端走 `/api/content/feed?scope=exam`，练题端走 `/api/practice/feed`（含 both），
 *      两端读同一批数据、各自收窄；
 *   6) 增删改均落审计（content.create / content.update / content.delete）。
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import type { RowDataPacket } from 'mysql2/promise';

import { app } from '../app.js';
import { prepareTestDb } from './db.js';
import { closePool, query } from '../db/pool.js';
import { nowDb } from '../utils/datetime.js';
import { signToken } from '../middleware/auth.js';
import type { AnnouncementDto, AuditLogDto, BannerDto, ContentFeedDto, Page } from '../types/domain.js';

const bearer = (token: string): { Authorization: string } => ({ Authorization: `Bearer ${token}` });

const admin = signToken({ sub: 'user-admin', role: 'admin', departmentId: '' });
const author = signToken({ sub: 'user-author', role: 'author', departmentId: '' });
const examinee = signToken({ sub: 'user-zhangsan', role: 'examinee', departmentId: 'dept-rd' });

/** 独立练题用户（避免与其它测试文件的练题态互相污染） */
const P_USER = { id: 'user-qa-content', username: 'qa_content', password: 'qa-content-123' };

let practiceToken = '';

const future = (): string => new Date(Date.now() + 3600_000).toISOString();
const past = (): string => new Date(Date.now() - 3600_000).toISOString();

/** 公告默认入参（可覆盖）。 */
function annPayload(over: Record<string, unknown> = {}): Record<string, unknown> {
  return { title: '测试公告', content: '公告正文内容', target: 'both', level: 'normal', ...over };
}

/** 轮播默认入参（可覆盖）。 */
function bannerPayload(over: Record<string, unknown> = {}): Record<string, unknown> {
  return { title: '测试轮播', imageUrl: 'https://example.com/a.png', linkUrl: '', target: 'both', sortOrder: 0, ...over };
}

async function createAnn(payload: Record<string, unknown>): Promise<AnnouncementDto> {
  const res = await request(app).post('/api/content/announcements').set(bearer(admin)).send(payload);
  expect(res.body.code, JSON.stringify(res.body)).toBe(0);
  return res.body.data as AnnouncementDto;
}

async function createBanner(payload: Record<string, unknown>): Promise<BannerDto> {
  const res = await request(app).post('/api/content/banners').set(bearer(admin)).send(payload);
  expect(res.body.code, JSON.stringify(res.body)).toBe(0);
  return res.body.data as BannerDto;
}

/** 考试端内容聚合。 */
async function examFeed(token = admin): Promise<ContentFeedDto> {
  const res = await request(app).get('/api/content/feed').query({ scope: 'exam' }).set(bearer(token));
  expect(res.body.code, JSON.stringify(res.body)).toBe(0);
  return res.body.data as ContentFeedDto;
}

/** 练题端内容聚合。 */
async function practiceFeed(token = practiceToken): Promise<ContentFeedDto> {
  const res = await request(app).get('/api/practice/feed').set(bearer(token));
  expect(res.body.code, JSON.stringify(res.body)).toBe(0);
  return res.body.data as ContentFeedDto;
}

/** 练题端登录。 */
async function practiceLogin(): Promise<string> {
  const res = await request(app)
    .post('/api/practice/auth/login')
    .set({ 'X-Forwarded-For': '198.51.100.245', 'X-Device-Fp': 'content' })
    .send({ username: P_USER.username, password: P_USER.password });
  expect(res.body.code, JSON.stringify(res.body)).toBe(0);
  return res.body.data.token as string;
}

beforeAll(async () => {
  await prepareTestDb();
  const hash = await bcrypt.hash(P_USER.password, 10);
  await query(
    `INSERT INTO users (id, username, password_hash, name, role, role_id, department_id, status, created_at)
     VALUES (?, ?, ?, 'QA内容用户', 'examinee', 'examinee', NULL, 'active', ?)
     ON DUPLICATE KEY UPDATE id = id`,
    [P_USER.id, P_USER.username, hash, nowDb()],
  );
  practiceToken = await practiceLogin();
}, 30000);

afterAll(async () => {
  await closePool();
});

/* ============================ 权限 ============================ */

describe('内容管理接口权限', () => {
  it('未登录访问公告列表 → 401', async () => {
    const res = await request(app).get('/api/content/announcements');
    expect(res.status).toBe(401);
  });

  it('author 访问公告列表 → 403', async () => {
    const res = await request(app).get('/api/content/announcements').set(bearer(author));
    expect(res.status).toBe(403);
  });

  it('考生访问轮播图列表 → 403', async () => {
    const res = await request(app).get('/api/content/banners').set(bearer(examinee));
    expect(res.status).toBe(403);
  });
});

/* ============================ 公告 CRUD ============================ */

describe('公告管理', () => {
  it('新建公告返回完整 DTO，且当前生效', async () => {
    const dto = await createAnn(annPayload({ title: '开考通知', content: '本周五统一开考' }));
    expect(dto.id).toMatch(/^ann-/);
    expect(dto.title).toBe('开考通知');
    expect(dto.target).toBe('both');
    expect(dto.level).toBe('normal');
    expect(dto.pinned).toBe(false);
    expect(dto.enabled).toBe(true);
    expect(dto.startAt).toBeNull();
    expect(dto.endAt).toBeNull();
    expect(dto.active).toBe(true);
    expect(dto.createdByName).toBe('系统管理员');
  });

  it('标题为空 → 1001', async () => {
    const res = await request(app).post('/api/content/announcements').set(bearer(admin)).send(annPayload({ title: '  ' }));
    expect(res.body.code).toBe(1001);
  });

  it('内容为空 → 1001', async () => {
    const res = await request(app)
      .post('/api/content/announcements')
      .set(bearer(admin))
      .send(annPayload({ content: '' }));
    expect(res.body.code).toBe(1001);
  });

  it('发布范围非法 → 1001', async () => {
    const res = await request(app)
      .post('/api/content/announcements')
      .set(bearer(admin))
      .send(annPayload({ target: 'all' }));
    expect(res.body.code).toBe(1001);
  });

  it('结束时间早于开始时间 → 1001', async () => {
    const res = await request(app)
      .post('/api/content/announcements')
      .set(bearer(admin))
      .send(annPayload({ startAt: future(), endAt: past() }));
    expect(res.body.code).toBe(1001);
  });

  it('编辑公告覆盖全部字段', async () => {
    const dto = await createAnn(annPayload({ title: '待编辑', target: 'exam' }));
    const res = await request(app)
      .put(`/api/content/announcements/${dto.id}`)
      .set(bearer(admin))
      .send(annPayload({ title: '已编辑', target: 'practice', level: 'important', pinned: true, enabled: false }));
    expect(res.body.code, JSON.stringify(res.body)).toBe(0);
    const updated = res.body.data as AnnouncementDto;
    expect(updated.title).toBe('已编辑');
    expect(updated.target).toBe('practice');
    expect(updated.level).toBe('important');
    expect(updated.pinned).toBe(true);
    expect(updated.enabled).toBe(false);
    expect(updated.active).toBe(false);
  });

  it('编辑不存在的公告 → 404', async () => {
    const res = await request(app)
      .put('/api/content/announcements/ann-not-exist')
      .set(bearer(admin))
      .send(annPayload());
    expect(res.status).toBe(404);
  });

  it('删除公告后不可再编辑；重复删除 → 404', async () => {
    const dto = await createAnn(annPayload({ title: '待删除' }));
    const del = await request(app).delete(`/api/content/announcements/${dto.id}`).set(bearer(admin));
    expect(del.body.code, JSON.stringify(del.body)).toBe(0);
    const again = await request(app).delete(`/api/content/announcements/${dto.id}`).set(bearer(admin));
    expect(again.status).toBe(404);
  });

  it('列表支持 target / enabled / 关键字过滤且 total 同口径', async () => {
    await createAnn(annPayload({ title: '过滤-甲', target: 'exam', enabled: true }));
    await createAnn(annPayload({ title: '过滤-乙', target: 'practice', enabled: false }));
    await createAnn(annPayload({ title: '过滤-丙', target: 'exam', enabled: false }));

    const byTarget = await request(app)
      .get('/api/content/announcements')
      .query({ target: 'practice', page: 1, pageSize: 5 })
      .set(bearer(admin));
    expect(byTarget.body.code, JSON.stringify(byTarget.body)).toBe(0);
    const page = byTarget.body.data as Page<AnnouncementDto>;
    expect(page.list.every((a) => a.target === 'practice')).toBe(true);
    expect(page.total).toBe(page.list.length);

    const byKeyword = await request(app)
      .get('/api/content/announcements')
      .query({ keyword: '过滤-乙' })
      .set(bearer(admin));
    const kwPage = byKeyword.body.data as Page<AnnouncementDto>;
    expect(kwPage.total).toBe(1);
    expect(kwPage.list[0].title).toBe('过滤-乙');

    const disabled = await request(app)
      .get('/api/content/announcements')
      .query({ enabled: false })
      .set(bearer(admin));
    const disPage = disabled.body.data as Page<AnnouncementDto>;
    expect(disPage.list.every((a) => a.enabled === false)).toBe(true);
  });
});

/* ============================ 轮播图 ============================ */

describe('轮播图管理', () => {
  it('新建轮播图返回完整 DTO', async () => {
    const dto = await createBanner(bannerPayload({ title: '迎新横幅', linkUrl: 'https://example.com/notice' }));
    expect(dto.id).toMatch(/^bn-/);
    expect(dto.imageUrl).toBe('https://example.com/a.png');
    expect(dto.linkUrl).toBe('https://example.com/notice');
    expect(dto.sortOrder).toBe(0);
    expect(dto.active).toBe(true);
  });

  it('缺图片地址 → 1001', async () => {
    const res = await request(app)
      .post('/api/content/banners')
      .set(bearer(admin))
      .send(bannerPayload({ imageUrl: '' }));
    expect(res.body.code).toBe(1001);
  });

  it('排序值非法 → 1001', async () => {
    const res = await request(app)
      .post('/api/content/banners')
      .set(bearer(admin))
      .send(bannerPayload({ sortOrder: -1 }));
    expect(res.body.code).toBe(1001);
  });

  it('编辑与删除轮播图', async () => {
    const dto = await createBanner(bannerPayload({ title: '待改横幅' }));
    const upd = await request(app)
      .put(`/api/content/banners/${dto.id}`)
      .set(bearer(admin))
      .send(bannerPayload({ title: '已改横幅', sortOrder: 5, target: 'practice' }));
    expect(upd.body.code, JSON.stringify(upd.body)).toBe(0);
    expect((upd.body.data as BannerDto).title).toBe('已改横幅');
    expect((upd.body.data as BannerDto).sortOrder).toBe(5);

    const del = await request(app).delete(`/api/content/banners/${dto.id}`).set(bearer(admin));
    expect(del.body.code, JSON.stringify(del.body)).toBe(0);
    const missing = await request(app)
      .put(`/api/content/banners/${dto.id}`)
      .set(bearer(admin))
      .send(bannerPayload());
    expect(missing.status).toBe(404);
  });

  it('轮播图按 sortOrder 升序返回', async () => {
    await createBanner(bannerPayload({ title: '排序-后', sortOrder: 90 }));
    await createBanner(bannerPayload({ title: '排序-前', sortOrder: 1 }));
    const res = await request(app).get('/api/content/banners').query({ pageSize: 100 }).set(bearer(admin));
    const list = (res.body.data as Page<BannerDto>).list;
    const orders = list.map((b) => b.sortOrder);
    expect([...orders].sort((a, b) => a - b)).toEqual(orders);
  });
});

/* ============================ 可见性（考生侧） ============================ */

describe('考生端内容可见性', () => {
  it('target=practice 的公告不出现在考试端，但出现在练题端', async () => {
    const only = await createAnn(annPayload({ title: '仅练题端', target: 'practice' }));
    const exam = await examFeed();
    expect(exam.announcements.some((a) => a.id === only.id)).toBe(false);
    const prac = await practiceFeed();
    expect(prac.announcements.some((a) => a.id === only.id)).toBe(true);
  });

  it('target=exam 的公告不出现在练题端', async () => {
    const only = await createAnn(annPayload({ title: '仅考试端', target: 'exam' }));
    const prac = await practiceFeed();
    expect(prac.announcements.some((a) => a.id === only.id)).toBe(false);
  });

  it('both 的公告两端都可见', async () => {
    const both = await createAnn(annPayload({ title: '两端可见', target: 'both' }));
    expect((await examFeed()).announcements.some((a) => a.id === both.id)).toBe(true);
    expect((await practiceFeed()).announcements.some((a) => a.id === both.id)).toBe(true);
  });

  it('已停用的公告两端都不可见', async () => {
    const off = await createAnn(annPayload({ title: '已停用', target: 'both', enabled: false }));
    expect((await examFeed()).announcements.some((a) => a.id === off.id)).toBe(false);
    expect((await practiceFeed()).announcements.some((a) => a.id === off.id)).toBe(false);
  });

  it('未到生效时间 / 已过生效时间 均不可见', async () => {
    const notYet = await createAnn(annPayload({ title: '未生效', target: 'both', startAt: future() }));
    const expired = await createAnn(annPayload({ title: '已过期', target: 'both', endAt: past() }));
    const ids = (await examFeed()).announcements.map((a) => a.id);
    expect(ids).not.toContain(notYet.id);
    expect(ids).not.toContain(expired.id);
  });

  it('在生效时间窗内的公告可见，且 active=true', async () => {
    const inWindow = await createAnn(
      annPayload({ title: '窗口内', target: 'both', startAt: past(), endAt: future() }),
    );
    const found = (await examFeed()).announcements.find((a) => a.id === inWindow.id);
    expect(found).toBeTruthy();
    expect(found!.active).toBe(true);
  });

  it('置顶公告排在非置顶之前', async () => {
    await createAnn(annPayload({ title: '普通公告A', target: 'exam' }));
    const pinned = await createAnn(annPayload({ title: '置顶公告Z', target: 'exam', pinned: true }));
    const list = (await examFeed()).announcements;
    expect(list[0]?.id).toBe(pinned.id);
  });

  it('停用 / 越范围的轮播图在考试端不可见', async () => {
    const off = await createBanner(bannerPayload({ title: '停用轮播', enabled: false }));
    const pracOnly = await createBanner(bannerPayload({ title: '练题轮播', target: 'practice' }));
    const ids = (await examFeed()).banners.map((b) => b.id);
    expect(ids).not.toContain(off.id);
    expect(ids).not.toContain(pracOnly.id);
  });
});

/* ============================ 练题端接口 ============================ */

describe('练题端内容接口', () => {
  it('未登录访问 → 401', async () => {
    const res = await request(app).get('/api/practice/feed');
    expect(res.status).toBe(401);
  });

  it('练题端 feed 只返回 target ∈ {practice, both} 的内容', async () => {
    const feed = await practiceFeed();
    expect(feed.announcements.every((a) => a.target === 'practice' || a.target === 'both')).toBe(true);
    expect(feed.banners.every((b) => b.target === 'practice' || b.target === 'both')).toBe(true);
    expect(feed.announcements.every((a) => a.enabled)).toBe(true);
    expect(feed.banners.every((b) => b.enabled)).toBe(true);
  });
});

/* ============================ 审计 ============================ */

describe('内容运营审计', () => {
  it('新建 / 编辑 / 删除均留痕', async () => {
    const dto = await createAnn(annPayload({ title: '审计公告' }));
    await request(app).put(`/api/content/announcements/${dto.id}`).set(bearer(admin)).send(annPayload({ title: '审计公告改' }));
    await request(app).delete(`/api/content/announcements/${dto.id}`).set(bearer(admin));

    // 审计写入为 fail-open 的旁路（不阻塞主业务），等一拍再断言
    await new Promise((resolve) => setTimeout(resolve, 80));

    const rows = await query<RowDataPacket[]>(
      `SELECT action, target_type, target_id FROM audit_logs WHERE target_id = ? ORDER BY created_at ASC`,
      [dto.id],
    );
    const actions = rows.map((r) => String(r.action));
    expect(actions).toEqual(['content.create', 'content.update', 'content.delete']);
    expect(rows.every((r) => String(r.target_type) === 'announcement')).toBe(true);
  });

  it('审计动作与目标类型均有中文文案', async () => {
    const res = await request(app).get('/api/audit-logs').query({ action: 'content.create' }).set(bearer(admin));
    expect(res.body.code, JSON.stringify(res.body)).toBe(0);
    const page = res.body.data as Page<AuditLogDto>;
    expect(page.total).toBeGreaterThan(0);
    expect(page.list.every((l) => l.action === 'content.create')).toBe(true);
  });
});
