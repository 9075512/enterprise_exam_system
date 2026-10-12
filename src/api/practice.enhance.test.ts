/**
 * 练题二期前端 API 契约测试（收藏夹 / 每日一练 / 学习报告 / 管理端练题配置）。
 *
 * 断言要点：
 *  1) URL、HTTP 方法、查询参数与请求体正确；
 *  2) 练题端接口均走 `practiceAuth: true`（注入**练题 Token**），与内网 Token 物理分离；
 *  3) 管理端 `/settings/practice` 走**内网 Token**（不是练题 Token）。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('element-plus', () => ({
  ElMessage: { error: vi.fn(), success: vi.fn(), warning: vi.fn(), info: vi.fn() },
}));

import http, { TOKEN_KEY, PRACTICE_TOKEN_KEY } from './http';
import * as practiceApi from './practice';
import { getPracticeSettings, updatePracticeSettings } from './settings';
import type { PracticeSettings } from '@/types';

interface Captured {
  method: string;
  url: string;
  params: Record<string, unknown> | undefined;
  data: unknown;
  auth: string | null;
}

let captured: Captured;

/** 捕获下一次请求的方法 / URL / 参数 / 请求体 / Authorization。 */
function mockCapture(payload: unknown = null): void {
  http.defaults.adapter = async (config) => {
    const headers = config.headers as unknown as { get?: (k: string) => string | undefined };
    const rawAuth = headers.get
      ? headers.get('Authorization')
      : ((config.headers as Record<string, unknown>).Authorization as string | undefined);
    let body: unknown;
    if (typeof config.data === 'string' && config.data !== '') {
      try {
        body = JSON.parse(config.data);
      } catch {
        body = config.data;
      }
    }
    captured = {
      method: (config.method ?? '').toUpperCase(),
      url: config.url ?? '',
      params: config.params as Record<string, unknown> | undefined,
      data: body,
      auth: rawAuth ?? null,
    };
    return {
      data: { code: 0, message: 'ok', data: payload },
      status: 200,
      statusText: 'OK',
      headers: {},
      config,
    } as never;
  };
}

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem(TOKEN_KEY, 'internal-tok');
  localStorage.setItem(PRACTICE_TOKEN_KEY, 'practice-tok');
  mockCapture();
});

describe('收藏夹 API', () => {
  it('列表：GET /practice/favorites，带分页与题库筛选，注入练题 Token', async () => {
    await practiceApi.favorites({ bankId: 'bank-security', page: 2, pageSize: 20 });
    expect(captured.method).toBe('GET');
    expect(captured.url).toBe('/practice/favorites');
    expect(captured.params).toMatchObject({ bankId: 'bank-security', page: 2, pageSize: 20 });
    expect(captured.auth).toBe('Bearer practice-tok');
  });

  it('列表：不传题库时 bankId 为 undefined（不下发空串）', async () => {
    await practiceApi.favorites();
    expect(captured.params?.bankId).toBeUndefined();
  });

  it('收藏态 id 列表：GET /practice/favorites/ids', async () => {
    await practiceApi.favoriteIds('bank-security');
    expect(captured.method).toBe('GET');
    expect(captured.url).toBe('/practice/favorites/ids');
    expect(captured.params).toMatchObject({ bankId: 'bank-security' });
  });

  it('收藏：POST /practice/favorites，请求体为 { questionId }', async () => {
    await practiceApi.addFavorite('q-01');
    expect(captured.method).toBe('POST');
    expect(captured.url).toBe('/practice/favorites');
    expect(captured.data).toEqual({ questionId: 'q-01' });
  });

  it('取消收藏：DELETE /practice/favorites/:id，且 id 已 URL 编码', async () => {
    await practiceApi.removeFavorite('q 01/x');
    expect(captured.method).toBe('DELETE');
    expect(captured.url).toBe('/practice/favorites/q%2001%2Fx');
    expect(captured.auth).toBe('Bearer practice-tok');
  });

  it('练收藏题：POST /practice/favorites/reans', async () => {
    await practiceApi.favoritesReans('bank-security');
    expect(captured.method).toBe('POST');
    expect(captured.url).toBe('/practice/favorites/reans');
    expect(captured.data).toEqual({ bankId: 'bank-security' });
  });
});

describe('每日一练 API', () => {
  it('今日任务：GET /practice/daily', async () => {
    await practiceApi.daily();
    expect(captured.method).toBe('GET');
    expect(captured.url).toBe('/practice/daily');
    expect(captured.auth).toBe('Bearer practice-tok');
  });

  it('今日任务会话：POST /practice/daily/session（无请求体）', async () => {
    await practiceApi.dailySession();
    expect(captured.method).toBe('POST');
    expect(captured.url).toBe('/practice/daily/session');
    expect(captured.data).toBeUndefined();
  });
});

describe('学习报告 API', () => {
  it('总览 / 科目 / 题库概览：三个 GET 路径正确', async () => {
    await practiceApi.reportSummary();
    expect(captured.url).toBe('/practice/report/summary');

    await practiceApi.reportSubjects();
    expect(captured.url).toBe('/practice/report/subjects');

    await practiceApi.reportBanks();
    expect(captured.url).toBe('/practice/report/banks');
  });

  it('趋势：默认 7 天；传 30 天下发 days=30', async () => {
    await practiceApi.reportTrend();
    expect(captured.url).toBe('/practice/report/trend');
    expect(captured.params).toMatchObject({ days: 7 });

    await practiceApi.reportTrend(30);
    expect(captured.params).toMatchObject({ days: 30 });
  });
});

describe('管理端练题配置 API（内网 Token）', () => {
  const sample: PracticeSettings = {
    dailyEnabled: true,
    dailyQuestionCount: 10,
    dailyTypes: ['single', 'judge'],
    dailyBankScope: 'practiced',
    favoriteLimit: 500,
  };

  it('读取：GET /settings/practice，注入内网 Token（非练题 Token）', async () => {
    await getPracticeSettings();
    expect(captured.method).toBe('GET');
    expect(captured.url).toBe('/settings/practice');
    expect(captured.auth).toBe('Bearer internal-tok');
  });

  it('保存：PUT /settings/practice，请求体为完整配置对象', async () => {
    await updatePracticeSettings(sample);
    expect(captured.method).toBe('PUT');
    expect(captured.url).toBe('/settings/practice');
    expect(captured.data).toEqual(sample);
    expect(captured.auth).toBe('Bearer internal-tok');
  });
});
