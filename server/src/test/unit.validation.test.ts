/**
 * 单元/集成测试：zod 校验失败的中文文案（全局 errorMap + 显式 message）。
 *
 * 覆盖两类「类型错误」类校验失败（此前会漏出 zod 英文默认文案）：
 *   1) query 分页参数越界 / 非数字；
 *   2) body 字段类型错误；
 * 断言：HTTP 400 / code 1001，且 message 非空、含中文、不含 zod 英文默认关键词。
 *
 * 说明：本测试只走到「鉴权 → 校验」即短路，不触达 service / DB（auth 仅校验 JWT）。
 */
import { describe, it, expect, afterAll } from 'vitest';
import request from 'supertest';
import '../utils/zodLocale.js'; // 显式确保全局中文 errorMap 已注册
import { app } from '../app.js';
import { closePool } from '../db/pool.js';
import { signToken } from '../middleware/auth.js';

/** 管理员令牌（校验失败发生在角色校验之后、service 之前）。 */
const adminToken = signToken({ sub: 'user-admin', role: 'admin', departmentId: '' });

/** zod 英文默认文案关键词（message 中不得出现）。 */
const ZOD_EN_KEYWORDS = ['Expected', 'received', 'Required', 'Invalid', 'nan', 'float', 'string', 'number'];

/** 断言：message 非空、含中文汉字、且不含 zod 英文默认关键词。 */
function expectChineseMessage(message: unknown): void {
  expect(typeof message).toBe('string');
  const text = String(message);
  expect(text.length).toBeGreaterThan(0);
  // 至少包含一个中日韩统一表意文字（汉字）
  expect(text).toMatch(/[\u4e00-\u9fa5]/);
  for (const kw of ZOD_EN_KEYWORDS) {
    expect(text).not.toContain(kw);
  }
}

describe('zod 中文校验文案（全局 errorMap）', () => {
  afterAll(async () => {
    await closePool();
  });

  describe('分页 query 参数（GET /api/questions）', () => {
    const cases: Array<{ query: string; expectExact?: string }> = [
      { query: 'page=abc' }, // 非数字 → NaN
      { query: 'page=0' }, // 小于下限
      { query: 'page=-1' }, // 小于下限
      { query: 'page=1.5' }, // 非整数
      { query: 'pageSize=0' }, // 小于下限
      { query: 'pageSize=10000', expectExact: '每页最多 100 条' }, // 超过上限（显式 message）
    ];

    for (const c of cases) {
      it(`GET /api/questions?${c.query} → 400/1001 且文案为中文`, async () => {
        const res = await request(app)
          .get(`/api/questions?${c.query}`)
          .set('Authorization', `Bearer ${adminToken}`);

        expect(res.status).toBe(400);
        expect(res.body.code).toBe(1001);
        expectChineseMessage(res.body.message);
        if (c.expectExact) {
          expect(res.body.message).toBe(c.expectExact);
        }
      });
    }

    it('page=0 文案含「页码」，page=1.5 文案含「整数」', async () => {
      const zero = await request(app).get('/api/questions?page=0').set('Authorization', `Bearer ${adminToken}`);
      expect(zero.body.message).toContain('页码');

      const float = await request(app).get('/api/questions?page=1.5').set('Authorization', `Bearer ${adminToken}`);
      expect(String(float.body.message)).toContain('整数');
    });
  });

  describe('body 字段类型错误（POST /api/exams）', () => {
    it('durationMinutes="abc" → 400/1001 且文案为中文', async () => {
      const res = await request(app)
        .post('/api/exams')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: '文案测试考试',
          paperId: 'paper-demo',
          departmentIds: ['dept-rd'],
          startTime: new Date().toISOString(),
          endTime: new Date().toISOString(),
          durationMinutes: 'abc',
          passScore: 60,
        });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe(1001);
      expectChineseMessage(res.body.message);
    });
  });
});
