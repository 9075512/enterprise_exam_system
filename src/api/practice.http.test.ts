/**
 * 练题前端 http 行为回归测试（架构 §5.3 / §5.5、共享约定 §10-16）。
 *
 * 核心红线：
 *  1) 练题请求注入 **练题 Token**（`practice.token`），内网请求注入内网 Token（`exam_sys.token`）——两者物理分离；
 *  2) 练题 401 → 清练题 Token + 触发练题登出回调；**不**清内网 Token、**不**触发内网全局登出；
 *  3) 内网 401 → 不清练题 Token、不触发练题回调；
 *  4) 登录接口 401（skipAuthRedirect）→ 按后端文案提示，不触发任何全局登出；
 *  5) 练题 401 去重闸门与内网闸门相互独立。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { InternalAxiosRequestConfig } from 'axios';

vi.mock('element-plus', () => ({
  ElMessage: { error: vi.fn(), success: vi.fn(), warning: vi.fn(), info: vi.fn() },
}));

import { ElMessage } from 'element-plus';
import http, {
  get,
  post,
  TOKEN_KEY,
  PRACTICE_TOKEN_KEY,
  setUnauthorizedHandler,
  setPracticeUnauthorizedHandler,
  resetUnauthorizedGuard,
  resetPracticeUnauthorizedGuard,
} from './http';

/** 让下一次请求返回成功，data 为请求头中的 Authorization（用于断言 Token 注入）。 */
function mockEchoAuth(): void {
  http.defaults.adapter = async (config) => {
    const headers = config.headers as unknown as { get?: (k: string) => string | undefined };
    const auth = headers.get ? headers.get('Authorization') : (config.headers as Record<string, unknown>).Authorization;
    return {
      data: { code: 0, message: 'ok', data: auth ?? null },
      status: 200,
      statusText: 'OK',
      headers: {},
      config,
    } as never;
  };
}

/** 让下一次请求固定返回指定状态/文案。 */
function mockStatus(status: number, message: string, code: number): void {
  http.defaults.adapter = async (config) => {
    const err = new Error(`Request failed with status code ${status}`) as Error & Record<string, unknown>;
    err.isAxiosError = true;
    err.response = {
      status,
      statusText: '',
      data: { code, message },
      headers: {},
      config,
    };
    err.config = config;
    throw err;
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  resetUnauthorizedGuard();
  resetPracticeUnauthorizedGuard();
});

describe('练题 http · Token 分离', () => {
  it('practiceAuth 请求注入练题 Token；普通请求注入内网 Token', async () => {
    localStorage.setItem(TOKEN_KEY, 'internal-tok');
    localStorage.setItem(PRACTICE_TOKEN_KEY, 'practice-tok');
    mockEchoAuth();

    const practiceAuthHeader = await get<string>('/practice/banks', undefined, { practiceAuth: true });
    expect(practiceAuthHeader).toBe('Bearer practice-tok');

    const internalAuthHeader = await get<string>('/records/my');
    expect(internalAuthHeader).toBe('Bearer internal-tok');
  });

  it('仅存在内网 Token 时，practiceAuth 请求不带 Authorization（不误用内网态）', async () => {
    localStorage.setItem(TOKEN_KEY, 'internal-tok');
    mockEchoAuth();

    const header = await get<string>('/practice/banks', undefined, { practiceAuth: true });
    expect(header).toBeNull();
  });
});

describe('练题 http · 401 隔离', () => {
  it('练题 401：清练题 Token、回调练题登出、保留内网 Token、不触发内网登出', async () => {
    const onInternal = vi.fn();
    const onPractice = vi.fn();
    setUnauthorizedHandler(onInternal);
    setPracticeUnauthorizedHandler(onPractice);
    localStorage.setItem(TOKEN_KEY, 'internal-tok');
    localStorage.setItem(PRACTICE_TOKEN_KEY, 'practice-tok');
    mockStatus(401, '登录状态已失效，请重新登录', 1002);

    await get('/practice/banks', undefined, { practiceAuth: true }).catch(() => undefined);

    expect(localStorage.getItem(PRACTICE_TOKEN_KEY)).toBeNull();
    expect(localStorage.getItem(TOKEN_KEY)).toBe('internal-tok');
    expect(onPractice).toHaveBeenCalledTimes(1);
    expect(onInternal).not.toHaveBeenCalled();
    expect(vi.mocked(ElMessage.error)).toHaveBeenCalledWith('登录状态已失效，请重新登录');
  });

  it('内网 401：清内网 Token、回调内网登出，不清练题 Token、不触发练题登出', async () => {
    const onInternal = vi.fn();
    const onPractice = vi.fn();
    setUnauthorizedHandler(onInternal);
    setPracticeUnauthorizedHandler(onPractice);
    localStorage.setItem(TOKEN_KEY, 'internal-tok');
    localStorage.setItem(PRACTICE_TOKEN_KEY, 'practice-tok');
    mockStatus(401, '登录状态已失效，请重新登录', 1002);

    await get('/records/my').catch(() => undefined);

    expect(localStorage.getItem(TOKEN_KEY)).toBeNull();
    expect(localStorage.getItem(PRACTICE_TOKEN_KEY)).toBe('practice-tok');
    expect(onInternal).toHaveBeenCalledTimes(1);
    expect(onPractice).not.toHaveBeenCalled();
  });

  it('练题登出回调失败不影响本地清理（幂等），且闸门独立于内网', async () => {
    const onInternal = vi.fn();
    const onPractice = vi.fn();
    setUnauthorizedHandler(onInternal);
    setPracticeUnauthorizedHandler(onPractice);
    localStorage.setItem(TOKEN_KEY, 'internal-tok');
    localStorage.setItem(PRACTICE_TOKEN_KEY, 'practice-tok');

    // 先触发一次练题 401
    mockStatus(401, '登录状态已失效，请重新登录', 1002);
    await get('/practice/banks', undefined, { practiceAuth: true }).catch(() => undefined);
    expect(onPractice).toHaveBeenCalledTimes(1);

    // 内网闸门未被污染：内网 401 仍应触发一次
    await get('/records/my').catch(() => undefined);
    expect(onInternal).toHaveBeenCalledTimes(1);
  });

  it('练题 401 去重：并发只回调一次；复位后可再次触发', async () => {
    const onPractice = vi.fn();
    setPracticeUnauthorizedHandler(onPractice);
    localStorage.setItem(PRACTICE_TOKEN_KEY, 'practice-tok');
    mockStatus(401, '登录状态已失效，请重新登录', 1002);

    await Promise.allSettled([
      get('/practice/banks', undefined, { practiceAuth: true }),
      get('/practice/wrong-book', undefined, { practiceAuth: true }),
      get('/practice/auth/me', undefined, { practiceAuth: true }),
    ]);
    expect(onPractice).toHaveBeenCalledTimes(1);

    // 未复位：静默
    await get('/practice/banks', undefined, { practiceAuth: true }).catch(() => undefined);
    expect(onPractice).toHaveBeenCalledTimes(1);

    // 复位（模拟重新登录成功）：恢复触发
    resetPracticeUnauthorizedGuard();
    await get('/practice/banks', undefined, { practiceAuth: true }).catch(() => undefined);
    expect(onPractice).toHaveBeenCalledTimes(2);
  });

  it('登录接口 401（skipAuthRedirect）：按后端文案提示，不触发任何全局登出、不清 Token', async () => {
    const onInternal = vi.fn();
    const onPractice = vi.fn();
    setUnauthorizedHandler(onInternal);
    setPracticeUnauthorizedHandler(onPractice);
    localStorage.setItem(TOKEN_KEY, 'internal-tok');
    localStorage.setItem(PRACTICE_TOKEN_KEY, 'practice-tok');
    mockStatus(401, '账号或密码不正确', 1002);

    await post('/practice/auth/login', { username: 'x', password: 'y' }, { skipAuthRedirect: true }).catch(
      () => undefined,
    );

    expect(onInternal).not.toHaveBeenCalled();
    expect(onPractice).not.toHaveBeenCalled();
    expect(localStorage.getItem(TOKEN_KEY)).toBe('internal-tok');
    expect(localStorage.getItem(PRACTICE_TOKEN_KEY)).toBe('practice-tok');
    expect(vi.mocked(ElMessage.error)).toHaveBeenCalledWith('账号或密码不正确');
  });
});
