/**
 * v2.0① 公告富文本与图片 —— 集成测试。
 *
 * 背景：v1.9⑥ 的公告正文为纯文本；v2.0① 起支持富文本 + 图片，
 * 前端编辑器（contenteditable）输出的 HTML **必须由服务端白名单净化后落库**，
 * 前端渲染（v-html）不构成安全边界。
 *
 * 本文件锁死：
 *   1) 危险标签（script/style/iframe…）连同内容一并删除；
 *   2) 非法图片来源（javascript: / 协议相对 //evil.com）整张图片丢弃；
 *   3) 站内附件签名 URL 与内联 data:image 合法图片保留；
 *   4) 净化后为空（仅标签/空白）→ 1001；
 *   5) 超长（> 20000）→ 1001；
 *   6) 列表 / 详情返回的都是**净化后**的正文（幂等）。
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcryptjs';

import { app } from '../app.js';
import { prepareTestDb } from './db.js';
import { closePool, query } from '../db/pool.js';
import { nowDb } from '../utils/datetime.js';
import { signToken } from '../middleware/auth.js';
import type { AnnouncementDto, BannerDto, Page } from '../types/domain.js';

const bearer = (token: string): { Authorization: string } => ({ Authorization: `Bearer ${token}` });

const admin = signToken({ sub: 'user-admin', role: 'admin', departmentId: '' });
const author = signToken({ sub: 'user-author', role: 'author', departmentId: '' });
const P_USER = { id: 'user-qa-v20a', username: 'qa_v20a', password: 'qa-v20a-123' };
let practiceToken = '';

/** 公告默认入参（可覆盖）。 */
function annPayload(over: Record<string, unknown> = {}): Record<string, unknown> {
  return { title: '富文本公告', content: '<p>公告正文</p>', target: 'both', level: 'normal', ...over };
}

/** 轮播默认入参（可覆盖）。 */
function bannerPayload(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    title: '测试轮播',
    imageUrl: 'https://example.com/a.png',
    linkUrl: '',
    target: 'both',
    sortOrder: 0,
    ...over,
  };
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

/** 新建（期望失败），返回响应体。 */
async function createAnnRaw(payload: Record<string, unknown>): Promise<{ code: number; message: string }> {
  const res = await request(app).post('/api/content/announcements').set(bearer(admin)).send(payload);
  return res.body as { code: number; message: string };
}

async function practiceLogin(): Promise<string> {
  const res = await request(app)
    .post('/api/practice/auth/login')
    .set({ 'X-Forwarded-For': '198.51.100.246', 'X-Device-Fp': 'v20a' })
    .send({ username: P_USER.username, password: P_USER.password });
  expect(res.body.code, JSON.stringify(res.body)).toBe(0);
  return res.body.data.token as string;
}

beforeAll(async () => {
  await prepareTestDb();
  const hash = await bcrypt.hash(P_USER.password, 10);
  await query(
    `INSERT INTO users (id, username, password_hash, name, role, department_id, status, created_at)
     VALUES (?, ?, ?, 'QA富文本用户', 'examinee', NULL, 'active', ?)
     ON DUPLICATE KEY UPDATE id = id`,
    [P_USER.id, P_USER.username, hash, nowDb()],
  );
  practiceToken = await practiceLogin();
}, 30000);

afterAll(async () => {
  await closePool();
});

describe('公告富文本净化（v2.0①）', () => {
  it('危险标签连同内容被删除，安全标签保留', async () => {
    const dto = await createAnn(
      annPayload({
        content: '<p>你好</p><script>alert(1)</script><style>body{}</style><iframe src="x"></iframe>',
      }),
    );
    expect(dto.content).toContain('<p>你好</p>');
    expect(dto.content).not.toMatch(/script|style|iframe/i);
    expect(dto.content).not.toContain('alert');
  });

  it('事件属性（onerror 等）被剔除', async () => {
    const dto = await createAnn(annPayload({ content: '<p onclick="x()">点我</p><b onmouseover="y()">粗</b>' }));
    expect(dto.content).not.toMatch(/on[a-z]+=/i);
    expect(dto.content).toContain('<p>点我</p>');
    expect(dto.content).toContain('<b>粗</b>');
  });

  it('站内附件签名图片保留，javascript: / 协议相对图片被丢弃', async () => {
    const dto = await createAnn(
      annPayload({
        content:
          '<p>看图</p>' +
          '<img src="/api/attachments/Ab12_cd34?t=abcdef123456">' +
          '<img src="javascript:alert(1)">' +
          '<img src="//evil.com/x.png">',
      }),
    );
    expect(dto.content).toContain('/api/attachments/Ab12_cd34?t=abcdef123456');
    expect(dto.content).not.toContain('javascript:');
    expect(dto.content).not.toContain('evil.com');
    // 合法图片 1 张，非法两张被整张丢弃
    expect((dto.content.match(/<img/gi) ?? []).length).toBe(1);
  });

  it('内联 data:image 小图保留（历史兼容）', async () => {
    const tiny = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
    const dto = await createAnn(annPayload({ content: `<p>内联</p><img src="${tiny}">` }));
    expect(dto.content).toContain('data:image/png;base64,');
  });

  it('净化后为空（仅标签 / 空白）→ 1001', async () => {
    const a = await createAnnRaw(annPayload({ content: '<p><br></p>' }));
    expect(a.code).toBe(1001);
    const b = await createAnnRaw(annPayload({ content: '   ' }));
    expect(b.code).toBe(1001);
    const c = await createAnnRaw(annPayload({ content: '<script>alert(1)</script>' }));
    expect(c.code).toBe(1001);
  });

  it('超长正文（> 20000）→ 1001', async () => {
    const long = `<p>${'甲'.repeat(20001)}</p>`;
    const res = await createAnnRaw(annPayload({ content: long }));
    expect(res.code).toBe(1001);
  });

  it('列表与详情返回的都是净化后正文（幂等）', async () => {
    const dto = await createAnn(annPayload({ title: '列表净化核验', content: '<p>正文</p><script>x</script>' }));
    const list = await request(app)
      .get('/api/content/announcements')
      .query({ keyword: '列表净化核验', page: 1, pageSize: 5 })
      .set(bearer(admin));
    expect(list.body.code, JSON.stringify(list.body)).toBe(0);
    const page = list.body.data as Page<AnnouncementDto>;
    const hit = page.list.find((a) => a.id === dto.id);
    expect(hit).toBeTruthy();
    expect(hit!.content).toBe(dto.content);
    expect(hit!.content).not.toMatch(/script/i);
  });

  it('编辑同样净化，且不引入未净化内容', async () => {
    const dto = await createAnn(annPayload({ title: '编辑净化核验' }));
    const res = await request(app)
      .put(`/api/content/announcements/${dto.id}`)
      .set(bearer(admin))
      .send(annPayload({ title: '编辑净化核验', content: '<p>改后</p><img src="javascript:void(0)">' }));
    expect(res.body.code, JSON.stringify(res.body)).toBe(0);
    const updated = res.body.data as AnnouncementDto;
    expect(updated.content).toContain('<p>改后</p>');
    expect(updated.content).not.toContain('javascript:');
  });

  it('双端 feed 下发净化后的正文', async () => {
    await createAnn(annPayload({ title: '双端净化核验', target: 'both', content: '<p>两端可见</p><script>y</script>' }));
    const examRes = await request(app).get('/api/content/feed').query({ scope: 'exam' }).set(bearer(admin));
    const examItem = (examRes.body.data.announcements as AnnouncementDto[]).find((a) => a.title === '双端净化核验');
    expect(examItem?.content).toContain('<p>两端可见</p>');
    expect(examItem?.content).not.toMatch(/script/i);

    const pracRes = await request(app).get('/api/practice/feed').set(bearer(practiceToken));
    const pracItem = (pracRes.body.data.announcements as AnnouncementDto[]).find((a) => a.title === '双端净化核验');
    expect(pracItem?.content).toContain('<p>两端可见</p>');
    expect(pracItem?.content).not.toMatch(/script/i);
  });
});

/* ============================ v2.0③ 触达回执 ============================ */

describe('内容触达回执与看板（v2.0③）', () => {
  it('未登录回执 → 401', async () => {
    const res = await request(app).post('/api/content/announcements/x/read');
    expect(res.status).toBe(401);
  });

  it('考试端已读回执幂等，管理端列表回传阅读人数', async () => {
    const dto = await createAnn(annPayload({ title: '回执核验' }));
    // 同一用户重复上报 → 去重为 1
    for (let i = 0; i < 3; i += 1) {
      const res = await request(app).post(`/api/content/announcements/${dto.id}/read`).set(bearer(admin));
      expect(res.body.code, JSON.stringify(res.body)).toBe(0);
    }
    const list = await request(app)
      .get('/api/content/announcements')
      .query({ keyword: '回执核验', page: 1, pageSize: 5 })
      .set(bearer(admin));
    const hit = (list.body.data as Page<AnnouncementDto>).list.find((a) => a.id === dto.id);
    expect(hit?.readCount).toBe(1);
  });

  it('练题端回执与考试端分端去重（同内容累计去重人数）', async () => {
    const dto = await createAnn(annPayload({ title: '双端回执核验', target: 'both' }));
    await request(app).post(`/api/content/announcements/${dto.id}/read`).set(bearer(admin));
    await request(app).post(`/api/practice/feed/announcements/${dto.id}/read`).set(bearer(practiceToken));
    // 练题端重复
    await request(app).post(`/api/practice/feed/announcements/${dto.id}/read`).set(bearer(practiceToken));

    const list = await request(app)
      .get('/api/content/announcements')
      .query({ keyword: '双端回执核验', page: 1, pageSize: 5 })
      .set(bearer(admin));
    const hit = (list.body.data as Page<AnnouncementDto>).list.find((a) => a.id === dto.id);
    // admin（考试端）1 人 + 练题用户 1 人 = 2
    expect(hit?.readCount).toBe(2);
  });

  it('轮播点击回执幂等', async () => {
    const dto = await createBanner(bannerPayload({ title: '点击核验' }));
    await request(app).post(`/api/content/banners/${dto.id}/click`).set(bearer(admin));
    await request(app).post(`/api/content/banners/${dto.id}/click`).set(bearer(admin));
    const list = await request(app)
      .get('/api/content/banners')
      .query({ keyword: '点击核验', page: 1, pageSize: 5 })
      .set(bearer(admin));
    const hit = (list.body.data as Page<BannerDto>).list.find((b) => b.id === dto.id);
    expect(hit?.clickCount).toBe(1);
  });

  it('回执目标不存在 → 404', async () => {
    const a = await request(app).post('/api/content/announcements/no-such/read').set(bearer(admin));
    expect(a.body.code).toBe(1004);
    const b = await request(app).post('/api/content/banners/no-such/click').set(bearer(admin));
    expect(b.body.code).toBe(1004);
  });

  it('触达看板仅 admin 可访问，返回受众规模与条目', async () => {
    const forbidden = await request(app).get('/api/content/stats').set(bearer(author));
    expect(forbidden.status).toBe(403);

    await createAnn(annPayload({ title: '看板核验', target: 'both' }));
    const res = await request(app).get('/api/content/stats').set(bearer(admin));
    expect(res.body.code, JSON.stringify(res.body)).toBe(0);
    const data = res.body.data as {
      audience: { exam: number; practice: number };
      announcements: Array<{ title: string; readRate: number }>;
    };
    expect(data.audience.exam).toBeGreaterThanOrEqual(0);
    expect(data.announcements.some((a) => a.title === '看板核验')).toBe(true);
  });
});

/* ============================ v2.0④ 批量与预约 ============================ */

describe('内容批量上下线与预约发布（v2.0④）', () => {
  async function byIds(ids: string[]): Promise<Map<string, AnnouncementDto>> {
    const list = await request(app)
      .get('/api/content/announcements')
      .query({ page: 1, pageSize: 100 })
      .set(bearer(admin));
    const page = list.body.data as Page<AnnouncementDto>;
    return new Map(page.list.filter((a) => ids.includes(a.id)).map((a) => [a.id, a]));
  }

  it('权限：author 调批量接口 → 403', async () => {
    const res = await request(app)
      .post('/api/content/announcements/batch')
      .set(bearer(author))
      .send({ ids: ['x'], action: 'disable' });
    expect(res.status).toBe(403);
  });

  it('入参校验：空 ids / 非法 action → 1001', async () => {
    const a = await request(app)
      .post('/api/content/announcements/batch')
      .set(bearer(admin))
      .send({ ids: [], action: 'disable' });
    expect(a.body.code).toBe(1001);
    const b = await request(app)
      .post('/api/content/announcements/batch')
      .set(bearer(admin))
      .send({ ids: ['x'], action: 'explode' });
    expect(b.body.code).toBe(1001);
  });

  it('批量下线后两端不可见，重新上线后恢复', async () => {
    const a1 = await createAnn(annPayload({ title: '批量A' }));
    const a2 = await createAnn(annPayload({ title: '批量B' }));

    const off = await request(app)
      .post('/api/content/announcements/batch')
      .set(bearer(admin))
      .send({ ids: [a1.id, a2.id], action: 'disable' });
    expect(off.body.code, JSON.stringify(off.body)).toBe(0);
    expect(off.body.data.affected).toBe(2);

    const map = await byIds([a1.id, a2.id]);
    expect(map.get(a1.id)?.enabled).toBe(false);

    const feed = await request(app).get('/api/content/feed').query({ scope: 'exam' }).set(bearer(admin));
    const titles = (feed.body.data.announcements as AnnouncementDto[]).map((x) => x.title);
    expect(titles).not.toContain('批量A');

    const on = await request(app)
      .post('/api/content/announcements/batch')
      .set(bearer(admin))
      .send({ ids: [a1.id, a2.id], action: 'enable' });
    expect(on.body.data.affected).toBe(2);
    const map2 = await byIds([a1.id, a2.id]);
    expect(map2.get(a1.id)?.enabled).toBe(true);
  });

  it('批量删除返回受影响行数', async () => {
    const d1 = await createAnn(annPayload({ title: '待删A' }));
    const d2 = await createAnn(annPayload({ title: '待删B' }));
    const res = await request(app)
      .post('/api/content/announcements/batch')
      .set(bearer(admin))
      .send({ ids: [d1.id, d2.id, 'no-such-id'], action: 'delete' });
    expect(res.body.code, JSON.stringify(res.body)).toBe(0);
    expect(res.body.data.affected).toBe(2);
    const map = await byIds([d1.id, d2.id]);
    expect(map.size).toBe(0);
  });

  it('轮播批量下线生效', async () => {
    const b1 = await createBanner(bannerPayload({ title: '轮播批量' }));
    const res = await request(app)
      .post('/api/content/banners/batch')
      .set(bearer(admin))
      .send({ ids: [b1.id], action: 'disable' });
    expect(res.body.code, JSON.stringify(res.body)).toBe(0);
    expect(res.body.data.affected).toBe(1);
    const list = await request(app)
      .get('/api/content/banners')
      .query({ keyword: '轮播批量', page: 1, pageSize: 5 })
      .set(bearer(admin));
    const hit = (list.body.data as Page<BannerDto>).list.find((b) => b.id === b1.id);
    expect(hit?.enabled).toBe(false);
  });

  it('预约发布：开始时间在未来 → 两端 feed 暂不可见，到点由时间窗自动放出', async () => {
    const future = new Date(Date.now() + 3600_000).toISOString();
    const dto = await createAnn(annPayload({ title: '预约发布预告', startAt: future }));
    const feed = await request(app).get('/api/content/feed').query({ scope: 'exam' }).set(bearer(admin));
    const titles = (feed.body.data.announcements as AnnouncementDto[]).map((x) => x.title);
    expect(titles).not.toContain('预约发布预告');
    // 管理端仍可见（未生效状态）
    const map = await byIds([dto.id]);
    expect(map.get(dto.id)?.active).toBe(false);
  });
});
