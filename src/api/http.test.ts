/**
 * 回归测试：401 处理闸门。
 *
 * 背景（真实缺陷）：登出时若先删 Token 再发请求，后端必然返回 401；
 * 而 401 会触发全局登出回调，回调又发起登出请求 —— 形成无限递归弹窗。
 * 修复后要求：同一轮「会话失效」只提示一次、只回调一次，直到重新登录才复位。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { InternalAxiosRequestConfig } from 'axios';

vi.mock('element-plus', () => ({
  ElMessage: { error: vi.fn(), success: vi.fn(), warning: vi.fn(), info: vi.fn() },
}));

import { ElMessage } from 'element-plus';
import http, { post, setUnauthorizedHandler, resetUnauthorizedGuard, TOKEN_KEY } from './http';

/** 构造一个「后端返回 401」的 axios 错误 */
function make401(config: InternalAxiosRequestConfig, message = '登录状态已失效，请重新登录'): unknown {
  const err = new Error('Request failed with status code 401') as Error & Record<string, unknown>;
  err.isAxiosError = true;
  err.response = {
    status: 401,
    statusText: 'Unauthorized',
    data: { code: 1002, message },
    headers: {},
    config,
  };
  err.config = config;
  return err;
}

/** 让本次请求固定返回 401（可指定后端文案） */
function mock401(message?: string): void {
  http.defaults.adapter = async (config) => {
    throw make401(config as InternalAxiosRequestConfig, message);
  };
}

describe('http 401 闸门', () => {
  beforeEach(() => {
    resetUnauthorizedGuard();
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('并发多个 401：只提示一次、只回调一次（防无限弹窗）', async () => {
    const onUnauthorized = vi.fn();
    setUnauthorizedHandler(onUnauthorized);
    mock401();

    const settled = await Promise.allSettled([
      http.get('/a'),
      http.get('/b'),
      http.get('/c'),
    ]);

    expect(settled.every((s) => s.status === 'rejected')).toBe(true);
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
    expect(vi.mocked(ElMessage.error)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(ElMessage.error)).toHaveBeenCalledWith('登录状态已失效，请重新登录');
  });

  it('401 后本地 Token 被清除', async () => {
    setUnauthorizedHandler(vi.fn());
    mock401();
    localStorage.setItem(TOKEN_KEY, 'tok');

    await http.get('/a').catch(() => undefined);

    expect(localStorage.getItem(TOKEN_KEY)).toBeNull();
  });

  it('resetUnauthorizedGuard 后再次 401 会重新提示（保证重新登录后仍能提示）', async () => {
    const onUnauthorized = vi.fn();
    setUnauthorizedHandler(onUnauthorized);
    mock401();

    await http.get('/a').catch(() => undefined);
    expect(onUnauthorized).toHaveBeenCalledTimes(1);

    // 未复位：静默
    await http.get('/b').catch(() => undefined);
    expect(onUnauthorized).toHaveBeenCalledTimes(1);

    // 复位（模拟重新登录成功）：恢复提示
    resetUnauthorizedGuard();
    await http.get('/c').catch(() => undefined);
    expect(onUnauthorized).toHaveBeenCalledTimes(2);
  });

  it('skipAuthRedirect + suppressErrorToast（登出）：401 时不提示、不触发全局登出', async () => {
    const onUnauthorized = vi.fn();
    setUnauthorizedHandler(onUnauthorized);
    mock401();

    await post('/auth/logout', undefined, {
      skipAuthRedirect: true,
      suppressErrorToast: true,
    }).catch(() => undefined);

    expect(onUnauthorized).not.toHaveBeenCalled();
    expect(vi.mocked(ElMessage.error)).not.toHaveBeenCalled();
  });

  it('仅 skipAuthRedirect（登录）：401 提示后端真实文案，且不触发全局登出、不锁死闸门', async () => {
    const onUnauthorized = vi.fn();
    setUnauthorizedHandler(onUnauthorized);
    mock401('账号或密码不正确');

    await post('/auth/login', {}, { skipAuthRedirect: true }).catch(() => undefined);

    // 不弹「登录状态已失效」，而是弹后端返回的原始文案
    expect(onUnauthorized).not.toHaveBeenCalled();
    expect(vi.mocked(ElMessage.error)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(ElMessage.error)).toHaveBeenCalledWith('账号或密码不正确');

    // 关键回归：闸门未被锁死 —— 第二次登录失败仍必须有提示
    vi.clearAllMocks();
    await post('/auth/login', {}, { skipAuthRedirect: true }).catch(() => undefined);
    expect(vi.mocked(ElMessage.error)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(ElMessage.error)).toHaveBeenCalledWith('账号或密码不正确');
  });

  it('登录失败不影响后续会话失效提示（闸门与登录互不干扰）', async () => {
    const onUnauthorized = vi.fn();
    setUnauthorizedHandler(onUnauthorized);
    mock401('账号或密码不正确');

    // 先来一次登录失败
    await post('/auth/login', {}, { skipAuthRedirect: true }).catch(() => undefined);
    expect(onUnauthorized).not.toHaveBeenCalled();

    // 业务请求 401 仍应触发一次全局登出提示（闸门未被登录失败污染）
    vi.clearAllMocks();
    await http.get('/records/my').catch(() => undefined);
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
    expect(vi.mocked(ElMessage.error)).toHaveBeenCalledWith('登录状态已失效，请重新登录');
  });
});
