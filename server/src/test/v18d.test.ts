/**
 * v1.8④ U4 —— 富文本附件对象存储 集成测试。
 *
 * 覆盖：
 *  1) 设置默认值与校验（`richTextImageMaxMb` / `richTextImageMaxCount`）；
 *  2) 上传：鉴权（未登录 1002）、类型白名单（非图片 1006）、体积上限（1006）、成功落盘 + 落库；
 *  3) 读取**双通道鉴权**：签名 URL（`<img>` 场景，无 Authorization 头）可读；
 *     无签名时必须「本人或 admin/author」；篡改签名 / 他人访问 / 不存在 → 拒绝；
 *  4) 净化白名单：站内附件 URL 保留，外链 / 协议相对地址 / 路径穿越被丢弃；
 *  5) 作答链路：暂存答案保留站内图片 URL，同时剥离 XSS 与外链图片。
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import type { Response } from 'supertest';
import { app } from '../app.js';
import { prepareTestDb } from './db.js';
import { closePool } from '../db/pool.js';
import { signToken } from '../middleware/auth.js';
import { sanitizeRichText } from '../utils/richText.js';
import { attachmentStore } from '../utils/attachmentStore.js';
import { signAttachment } from '../modules/attachments/attachments.service.js';
import * as attachmentsRepo from '../modules/attachments/attachments.repo.js';
import type { AttachmentDto } from '../types/domain.js';

const bearer = (token: string): { Authorization: string } => ({ Authorization: `Bearer ${token}` });

const admin = signToken({ sub: 'user-admin', role: 'admin', departmentId: '' });
const author = signToken({ sub: 'user-author', role: 'author', departmentId: '' });
const zhangsan = signToken({ sub: 'user-zhangsan', role: 'examinee', departmentId: 'dept-rd' });

/** 1×1 透明 PNG。 */
const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

/** 二进制响应解析器（附件读取返回字节流，需自行收集）。 */
function binaryParser(res: Response, callback: (err: Error | null, body: Buffer) => void): void {
  const chunks: Buffer[] = [];
  res.on('data', (chunk: Buffer) => chunks.push(Buffer.from(chunk)));
  res.on('end', () => callback(null, Buffer.concat(chunks)));
}

async function getSettings(): Promise<Record<string, unknown>> {
  const res = await request(app).get('/api/settings').set(bearer(admin));
  expect(res.body.code).toBe(0);
  return res.body.data as Record<string, unknown>;
}

async function putSettings(overrides: Record<string, unknown>): Promise<void> {
  const base = await getSettings();
  const res = await request(app).put('/api/settings').set(bearer(admin)).send({ ...base, ...overrides });
  expect(res.body.code).toBe(0);
}

function upload(
  token: string | undefined,
  buffer: Buffer = TINY_PNG,
  filename = 'answer.png',
  contentType = 'image/png',
) {
  const req = request(app).post('/api/attachments');
  if (token) req.set(bearer(token));
  return req.attach('file', buffer, { filename, contentType });
}

/** 本次测试产生的存储键（结束时清理磁盘文件）。 */
const createdKeys: string[] = [];

beforeAll(async () => {
  await prepareTestDb();
});

afterAll(async () => {
  for (const key of createdKeys) {
    await attachmentStore.remove(key).catch(() => {
      /* 清理失败忽略 */
    });
  }
  await closePool();
});

describe('U4 作图片设置', () => {
  it('默认值：单张 2MB、最多 3 张', async () => {
    const s = await getSettings();
    expect(s.richTextImageMaxMb).toBe(2);
    expect(s.richTextImageMaxCount).toBe(3);
  });

  it('越界 → 1001', async () => {
    const base = await getSettings();
    const small = await request(app)
      .put('/api/settings')
      .set(bearer(admin))
      .send({ ...base, richTextImageMaxMb: 0 });
    expect(small.body.code).toBe(1001);

    const many = await request(app)
      .put('/api/settings')
      .set(bearer(admin))
      .send({ ...base, richTextImageMaxCount: 11 });
    expect(many.body.code).toBe(1001);
  });
});

describe('U4 上传', () => {
  it('登录用户上传成功：落盘 + 落库 + 返回带签名的站内 URL', async () => {
    const res = await upload(zhangsan);
    expect(res.body.code).toBe(0);
    const dto = res.body.data as AttachmentDto;

    expect(dto.id.startsWith('att-')).toBe(true);
    expect(dto.kind).toBe('image');
    expect(dto.mime).toBe('image/png');
    expect(dto.size).toBe(TINY_PNG.length);
    expect(dto.url).toBe(`/api/attachments/${dto.id}?t=${signAttachment(dto.id)}`);

    const row = await attachmentsRepo.findById(dto.id);
    expect(row).toBeTruthy();
    createdKeys.push(row!.storage_key);
    expect(await attachmentStore.exists(row!.storage_key)).toBe(true);
    // 存储键为 `yyyy/MM/<id>.<ext>`，不含任何客户端提供的信息
    expect(row!.storage_key).toMatch(/^\d{4}\/\d{2}\/[A-Za-z0-9_-]+\.png$/);
  });

  it('未登录上传 → 1002', async () => {
    const res = await upload(undefined);
    expect(res.body.code).toBe(1002);
  });

  it('非图片类型 → 1006', async () => {
    const res = await upload(zhangsan, Buffer.from('hello'), 'a.txt', 'text/plain');
    expect(res.body.code).toBe(1006);
  });

  it('超过单张上限 → 1006（上限随设置实时生效）', async () => {
    await putSettings({ richTextImageMaxMb: 1 });
    const big = Buffer.alloc(1 * 1024 * 1024 + 1024, 1);
    const res = await upload(zhangsan, big);
    expect(res.body.code).toBe(1006);
    await putSettings({ richTextImageMaxMb: 2 });
  });
});

describe('U4 读取（双通道鉴权）', () => {
  it('签名 URL：无 Authorization 头也能读（<img> 场景）', async () => {
    const created = (await upload(zhangsan)).body.data as AttachmentDto;
    const row = await attachmentsRepo.findById(created.id);
    createdKeys.push(row!.storage_key);

    const res = await request(app).get(created.url).buffer(true).parse(binaryParser);
    expect(res.status).toBe(200);
    expect(String(res.headers['content-type'])).toContain('image/png');
    expect(String(res.headers['cache-control'])).toContain('immutable');
    expect(Buffer.compare(res.body as unknown as Buffer, TINY_PNG)).toBe(0);
  });

  it('无签名时：本人可读，他人 / 未登录不可读，阅卷角色可读', async () => {
    const created = (await upload(zhangsan)).body.data as AttachmentDto;
    const row = await attachmentsRepo.findById(created.id);
    createdKeys.push(row!.storage_key);
    const plain = `/api/attachments/${created.id}`;

    const owner = await request(app).get(plain).set(bearer(zhangsan)).buffer(true).parse(binaryParser);
    expect(owner.status).toBe(200);

    const other = await request(app).get(plain).set(bearer(signToken({ sub: 'user-lisi', role: 'examinee', departmentId: 'dept-rd' })));
    expect(other.body.code).toBe(1003);

    const anonymous = await request(app).get(plain);
    expect(anonymous.body.code).toBe(1003);

    const grader = await request(app).get(plain).set(bearer(author)).buffer(true).parse(binaryParser);
    expect(grader.status).toBe(200);

    const boss = await request(app).get(plain).set(bearer(admin)).buffer(true).parse(binaryParser);
    expect(boss.status).toBe(200);
  });

  it('签名被篡改 → 1003；不存在的附件 → 1004', async () => {
    const created = (await upload(zhangsan)).body.data as AttachmentDto;
    const row = await attachmentsRepo.findById(created.id);
    createdKeys.push(row!.storage_key);

    const forged = await request(app).get(`/api/attachments/${created.id}?t=${'0'.repeat(32)}`);
    expect(forged.body.code).toBe(1003);

    const missing = await request(app).get(`/api/attachments/att-not-exist?t=${signAttachment('att-not-exist')}`);
    expect(missing.status).toBe(404);
    expect(missing.body.code).toBe(1004);
  });

  it('文件被清理后读取 → 1004（不产生半截响应）', async () => {
    const created = (await upload(zhangsan)).body.data as AttachmentDto;
    const row = await attachmentsRepo.findById(created.id);
    await attachmentStore.remove(row!.storage_key);

    const res = await request(app).get(created.url);
    expect(res.status).toBe(404);
    expect(res.body.code).toBe(1004);
  });
});

describe('U4 富文本净化的图片来源白名单', () => {
  const id = 'att-abcdefghijklmn';
  const signed = `/api/attachments/${id}?t=${signAttachment(id)}`;

  it('保留站内附件 URL（含签名）', () => {
    const clean = sanitizeRichText(`<p>作答<img src="${signed}" alt="作答图片"></p>`);
    expect(clean).toContain(`src="${signed}"`);
  });

  it('丢弃外链 / 协议相对地址 / 站外路径', () => {
    for (const src of [
      'https://evil.com/x.png',
      'http://evil.com/x.png',
      '//evil.com/x.png',
      '/uploads/x.png',
      '/api/attachments/../../../etc/passwd',
    ]) {
      const clean = sanitizeRichText(`<img src="${src}">`);
      expect(clean).not.toContain('<img');
    }
  });

  it('数量上限对站内图片同样生效', () => {
    const one = `<img src="${signed}">`;
    const clean = sanitizeRichText(one.repeat(4), { maxImages: 2 });
    expect((clean.match(/<img/g) ?? []).length).toBe(2);
  });
});

describe('U4 作答链路（暂存即净化）', () => {
  it('暂存富文本答案：保留站内图片，剥离外链与脚本', async () => {
    // 1) 建简答题 → 组卷 → 建考
    const q = await request(app).post('/api/questions').set(bearer(admin)).send({
      bankId: 'bank-security',
      type: 'short',
      stem: '请描述你的处置过程（可附图）。',
      answer: ['按流程处置'],
      defaultScore: 10,
      subject: '信息安全',
    });
    expect(q.body.code).toBe(0);
    const questionId = q.body.data.id as string;

    const paper = await request(app)
      .post('/api/papers')
      .set(bearer(admin))
      .send({
        name: 'v18d 附件作答试卷',
        description: '',
        bankIds: ['bank-security'],
        questions: [{ questionId, score: 10 }],
      });
    expect(paper.body.code).toBe(0);

    const exam = await request(app)
      .post('/api/exams')
      .set(bearer(admin))
      .send({
        name: 'v18d 附件作答考试',
        paperId: paper.body.data.id,
        departmentIds: ['dept-rd'],
        startTime: new Date(Date.now() - 3600_000).toISOString(),
        endTime: new Date(Date.now() + 3600_000).toISOString(),
        durationMinutes: 60,
        passScore: 6,
        maxAttempts: 1,
      });
    expect(exam.body.code).toBe(0);

    // 2) 考生开考
    const start = await request(app).post(`/api/exams/${exam.body.data.id}/start`).set(bearer(zhangsan));
    expect(start.body.code).toBe(0);
    const recordId = start.body.data.id as string;

    // 3) 上传图片 → 用其 URL 作答（另附外链图片与脚本，均应被剥离）
    const attachment = (await upload(zhangsan)).body.data as AttachmentDto;
    const row = await attachmentsRepo.findById(attachment.id);
    createdKeys.push(row!.storage_key);

    const dirty = `<p><strong>已按流程处置</strong><img src="${attachment.url}"><img src="https://evil.com/track.png"></p><script>alert(1)</script>`;
    const saved = await request(app)
      .put(`/api/records/${recordId}/answers`)
      .set(bearer(zhangsan))
      .send({ answers: { [questionId]: [dirty] } });
    expect(saved.body.code).toBe(0);

    // 4) 读取详情：站内图片保留，外链与脚本消失
    const detail = await request(app).get(`/api/records/${recordId}`).set(bearer(zhangsan));
    expect(detail.body.code).toBe(0);
    const stored = (detail.body.data.answers[questionId] as string[])[0];
    expect(stored).toContain(`src="${attachment.url}"`);
    expect(stored).toContain('<strong>已按流程处置</strong>');
    expect(stored).not.toContain('evil.com');
    expect(stored).not.toContain('script');
  });
});
