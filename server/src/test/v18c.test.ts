/**
 * v1.8① U1 —— 监考大屏实时推送（SSE）集成 + 单元测试。
 *
 * 覆盖：
 *  1) 设置项默认值与校验（`monitorPushEnabled` 默认开启、`monitorPushIntervalSeconds` 3~60）；
 *  2) 推送接口鉴权与错误：非 admin → 1003；考试不存在 → 1004（JSON 而非 SSE）；
 *     开关关闭 → 503 / 1016（前端据此回退轮询）；
 *  3) SSE 连接：返回 `text/event-stream`，首帧 `ready`（含推送间隔与订阅数）+ `monitor` 快照，
 *     客户端断开后连接被正确回收；
 *  4) 连接中心纯逻辑：帧格式、单考试/全局上限、广播送达数、共享 ticker 惰性启停。
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { app } from '../app.js';
import { prepareTestDb } from './db.js';
import { closePool } from '../db/pool.js';
import { signToken } from '../middleware/auth.js';
import { DEFAULT_SETTINGS } from '../modules/settings/settings.defaults.js';
import * as monitorStream from '../modules/exams/examMonitor.stream.js';
import type { MonitorStreamInfoDto } from '../types/domain.js';

const bearer = (token: string): { Authorization: string } => ({ Authorization: `Bearer ${token}` });

const admin = signToken({ sub: 'user-admin', role: 'admin', departmentId: '' });
const author = signToken({ sub: 'user-author', role: 'author', departmentId: '' });
const EXAM_ID = 'exam-demo';

async function getSettings(): Promise<Record<string, unknown>> {
  const res = await request(app).get('/api/settings').set(bearer(admin));
  expect(res.body.code).toBe(0);
  return res.body.data as Record<string, unknown>;
}

async function putSettings(overrides: Record<string, unknown>): Promise<void> {
  const base = await getSettings();
  const res = await request(app)
    .put('/api/settings')
    .set(bearer(admin))
    .send({ ...base, ...overrides });
  expect(res.body.code).toBe(0);
}

/** 读取 SSE 流的前若干帧后主动断开。 */
function readStream(
  path: string,
  token: string,
  opts: { until: string; timeoutMs?: number },
): Promise<{ status: number; headers: http.IncomingHttpHeaders; text: string }> {
  const server = app.listen(0);
  const port = (server.address() as AddressInfo).port;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      req.destroy();
      server.close();
      reject(new Error('读取 SSE 超时'));
    }, opts.timeoutMs ?? 5000);

    const req = http.request(
      { host: '127.0.0.1', port, method: 'GET', path, headers: { Authorization: `Bearer ${token}` } },
      (res) => {
        let text = '';
        res.setEncoding('utf8');
        res.on('data', (chunk: string) => {
          text += chunk;
          if (text.includes(opts.until)) {
            clearTimeout(timer);
            req.destroy();
            server.close();
            resolve({ status: res.statusCode ?? 0, headers: res.headers, text });
          }
        });
        res.on('end', () => {
          clearTimeout(timer);
          server.close();
          resolve({ status: res.statusCode ?? 0, headers: res.headers, text });
        });
      },
    );
    req.on('error', (err) => {
      clearTimeout(timer);
      server.close();
      reject(err);
    });
    req.end();
  });
}

/** 假 sink：记录收到的全部数据块（用于连接中心纯逻辑测试）。 */
interface FakeSink {
  chunks: string[];
  write(chunk: string): boolean;
}
function fakeSink(): FakeSink {
  const chunks: string[] = [];
  return {
    chunks,
    write(chunk: string): boolean {
      chunks.push(chunk);
      return true;
    },
  };
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

beforeAll(async () => {
  await prepareTestDb();
});

afterAll(async () => {
  monitorStream.resetMonitorStream();
  await closePool();
});

describe('U1 推送设置', () => {
  it('默认值：推送默认开启、间隔默认 5 秒', async () => {
    const s = await getSettings();
    expect(s.monitorPushEnabled).toBe(true);
    expect(s.monitorPushIntervalSeconds).toBe(5);
    expect(DEFAULT_SETTINGS.monitorPushEnabled).toBe(true);
    expect(DEFAULT_SETTINGS.monitorPushIntervalSeconds).toBe(5);
  });

  it('间隔越界 / 开关类型错误 → 1001', async () => {
    const base = await getSettings();

    const tooSmall = await request(app)
      .put('/api/settings')
      .set(bearer(admin))
      .send({ ...base, monitorPushIntervalSeconds: 2 });
    expect(tooSmall.body.code).toBe(1001);

    const tooBig = await request(app)
      .put('/api/settings')
      .set(bearer(admin))
      .send({ ...base, monitorPushIntervalSeconds: 61 });
    expect(tooBig.body.code).toBe(1001);

    const wrongType = await request(app)
      .put('/api/settings')
      .set(bearer(admin))
      .send({ ...base, monitorPushEnabled: 'yes' });
    expect(wrongType.body.code).toBe(1001);
  });
});

describe('U1 推送接口（鉴权与开关门控）', () => {
  it('非 admin 访问推送流 → 1003', async () => {
    const res = await request(app).get(`/api/exams/${EXAM_ID}/monitor/stream`).set(bearer(author));
    expect(res.body.code).toBe(1003);
  });

  it('未认证访问推送流 → 1002', async () => {
    const res = await request(app).get(`/api/exams/${EXAM_ID}/monitor/stream`);
    expect(res.body.code).toBe(1002);
  });

  it('考试不存在 → 1004（以 JSON 返回，而非建立 SSE）', async () => {
    const res = await request(app)
      .get('/api/exams/exam-not-exist/monitor/stream')
      .set(bearer(admin));
    expect(res.status).toBe(404);
    expect(res.body.code).toBe(1004);
    expect(String(res.headers['content-type'])).not.toContain('text/event-stream');
  });

  it('推送开关关闭 → 503 / 1016（前端据此回退轮询）', async () => {
    await putSettings({ monitorPushEnabled: false });
    const res = await request(app).get(`/api/exams/${EXAM_ID}/monitor/stream`).set(bearer(admin));
    expect(res.status).toBe(503);
    expect(res.body.code).toBe(1016);
  });
});

describe('U1 SSE 连接', () => {
  it('连接成功：text/event-stream + ready + monitor 首帧', async () => {
    await putSettings({ monitorPushEnabled: true, monitorPushIntervalSeconds: 3 });

    const { status, headers, text } = await readStream(
      `/api/exams/${EXAM_ID}/monitor/stream`,
      admin,
      { until: 'event: monitor' },
    );

    expect(status).toBe(200);
    expect(String(headers['content-type'])).toContain('text/event-stream');
    expect(headers['cache-control']).toContain('no-cache');
    expect(text).toContain('event: ready');
    expect(text).toContain('event: monitor');

    // ready 载荷：推送间隔取设置值、订阅数 ≥ 1
    const readyLine = text.split('\n').find((l) => l.startsWith('data: ') && l.includes('"intervalSeconds"'));
    expect(readyLine).toBeTruthy();
    const info = JSON.parse(readyLine!.slice('data: '.length)) as MonitorStreamInfoDto;
    expect(info.intervalSeconds).toBe(3);
    expect(info.examClients).toBeGreaterThanOrEqual(1);
    expect(info.totalClients).toBeGreaterThanOrEqual(1);

    // monitor 载荷：一份完整监考快照
    const monitorLine = [...text.split('\n')].reverse().find((l) => l.startsWith('data: ') && l.includes('"summary"'));
    expect(monitorLine).toBeTruthy();
    const snapshot = JSON.parse(monitorLine!.slice('data: '.length)) as { rows: unknown[]; summary: unknown };
    expect(Array.isArray(snapshot.rows)).toBe(true);
    expect(snapshot.summary).toBeTruthy();
  });

  it('客户端断开后连接与推送循环被回收', async () => {
    await readStream(`/api/exams/${EXAM_ID}/monitor/stream`, admin, { until: 'event: monitor' });
    // close 事件为异步派发，轮询等待归零
    for (let i = 0; i < 20 && monitorStream.clientCount(EXAM_ID) > 0; i += 1) await sleep(50);
    expect(monitorStream.clientCount(EXAM_ID)).toBe(0);
    expect(monitorStream.hasExamTicker(EXAM_ID)).toBe(false);
    expect(monitorStream.totalClientCount()).toBe(0);
  });
});

describe('U1 连接中心（纯逻辑）', () => {
  it('帧格式：event+data 与注释帧', () => {
    expect(monitorStream.sseFrame('monitor', { a: 1 })).toBe('event: monitor\ndata: {"a":1}\n\n');
    expect(monitorStream.sseComment('ping')).toBe(': ping\n\n');
  });

  it('单考试订阅上限：超出被拒绝且不影响既有连接', () => {
    monitorStream.resetMonitorStream();
    const sinks: FakeSink[] = [];
    for (let i = 0; i < monitorStream.MAX_CLIENTS_PER_EXAM; i += 1) {
      const sink = fakeSink();
      sinks.push(sink);
      expect(monitorStream.addClient('exam-limit', sink).ok).toBe(true);
    }
    const extra = monitorStream.addClient('exam-limit', fakeSink());
    expect(extra.ok).toBe(false);
    expect(extra.ok === false && extra.reason).toBe('exam-limit');
    expect(monitorStream.clientCount('exam-limit')).toBe(monitorStream.MAX_CLIENTS_PER_EXAM);

    // 注销一个后可再次加入
    monitorStream.removeClient('exam-limit', sinks[0]!);
    expect(monitorStream.addClient('exam-limit', fakeSink()).ok).toBe(true);

    monitorStream.resetMonitorStream();
  });

  it('广播只送达本场考试的订阅者，并返回送达数', () => {
    monitorStream.resetMonitorStream();
    const a = fakeSink();
    const b = fakeSink();
    const other = fakeSink();
    monitorStream.addClient('exam-a', a);
    monitorStream.addClient('exam-a', b);
    monitorStream.addClient('exam-b', other);

    expect(monitorStream.broadcast('exam-a', 'monitor', { n: 1 })).toBe(2);
    expect(a.chunks).toHaveLength(1);
    expect(b.chunks).toHaveLength(1);
    expect(other.chunks).toHaveLength(0);
    expect(monitorStream.broadcast('exam-none', 'monitor', {})).toBe(0);

    monitorStream.resetMonitorStream();
  });

  it('共享 ticker：同一考试只启一个循环，无订阅者时自动停止', async () => {
    monitorStream.resetMonitorStream();
    const sink = fakeSink();
    monitorStream.addClient('exam-tick', sink);

    let calls = 0;
    monitorStream.startExamTicker('exam-tick', 20, async () => {
      calls += 1;
      return { calls };
    });
    // 重复启动不叠加
    monitorStream.startExamTicker('exam-tick', 20, async () => {
      calls += 100;
      return { calls };
    });
    expect(monitorStream.hasExamTicker('exam-tick')).toBe(true);

    await sleep(120);
    expect(calls).toBeGreaterThanOrEqual(2);
    expect(sink.chunks.some((c) => c.includes('event: monitor'))).toBe(true);

    // 最后一个订阅者离开 → ticker 停止
    monitorStream.removeClient('exam-tick', sink);
    expect(monitorStream.hasExamTicker('exam-tick')).toBe(false);
    const after = calls;
    await sleep(80);
    expect(calls).toBe(after);

    monitorStream.resetMonitorStream();
  });

  it('ticker 内查询失败时下发 error 事件而非中断连接', async () => {
    monitorStream.resetMonitorStream();
    const sink = fakeSink();
    monitorStream.addClient('exam-err', sink);
    monitorStream.startExamTicker('exam-err', 20, async () => {
      throw new Error('查询失败');
    });
    await sleep(80);
    expect(sink.chunks.some((c) => c.includes('event: error') && c.includes('查询失败'))).toBe(true);
    // 连接仍在（未被移除）
    expect(monitorStream.clientCount('exam-err')).toBe(1);
    monitorStream.resetMonitorStream();
  });
});
