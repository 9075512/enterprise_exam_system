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
import type { AnnouncementDto, Page } from '../types/domain.js';

const bearer = (token: string): { Authorization: string } => ({ Authorization: `Bearer ${token}` });

const admin = signToken({ sub: 'user-admin', role: 'admin', departmentId: '' });
const P_USER = { id: 'user-qa-v20a', username: 'qa_v20a', password: 'qa-v20a-123' };
let practiceToken = '';

/** 公告默认入参（可覆盖）。 */
function annPayload(over: Record<string, unknown> = {}): Record<string, unknown> {
  return { title: '富文本公告', content: '<p>公告正文</p>', target: 'both', level: 'normal', ...over };
}

async function createAnn(payload: Record<string, unknown>): Promise<AnnouncementDto> {
  const res = await request(app).post('/api/content/announcements').set(bearer(admin)).send(payload);
  expect(res.body.code, JSON.stringify(res.body)).toBe(0);
  return res.body.data as AnnouncementDto;
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
