import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CanceledError, type AxiosAdapter } from 'axios';
import { ElMessage } from 'element-plus';
import { get, PRACTICE_TOKEN_KEY, resetPracticeUnauthorizedGuard, setPracticeUnauthorizedHandler } from './http';

vi.mock('element-plus', () => ({ ElMessage: { error: vi.fn() } }));

const unauthorized: AxiosAdapter = async (config) => {
  throw {
    config,
    response: { status: 401, data: { code: 1002, message: '账号或密码不正确' } },
  };
};

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  resetPracticeUnauthorizedGuard();
});

describe('练题 HTTP 错误处理', () => {
  it('并发会话失效只清退和提示一次', async () => {
    const callback = vi.fn();
    setPracticeUnauthorizedHandler(callback);
    localStorage.setItem(PRACTICE_TOKEN_KEY, 'token');
    await Promise.allSettled([
      get('/a', undefined, { practiceAuth: true, adapter: unauthorized }),
      get('/b', undefined, { practiceAuth: true, adapter: unauthorized }),
    ]);
    expect(callback).toHaveBeenCalledOnce();
    expect(ElMessage.error).toHaveBeenCalledOnce();
    expect(localStorage.getItem(PRACTICE_TOKEN_KEY)).toBeNull();
  });

  it('skipAuthRedirect 不清会话，且不影响后续真正失效的处理', async () => {
    const callback = vi.fn();
    setPracticeUnauthorizedHandler(callback);
    localStorage.setItem(PRACTICE_TOKEN_KEY, 'token');
    await expect(get('/login', undefined, {
      practiceAuth: true, skipAuthRedirect: true, adapter: unauthorized,
    })).rejects.toMatchObject({ code: 1002 });
    expect(callback).not.toHaveBeenCalled();
    expect(localStorage.getItem(PRACTICE_TOKEN_KEY)).toBe('token');
    expect(ElMessage.error).toHaveBeenCalledWith('账号或密码不正确');
    await get('/private', undefined, { practiceAuth: true, adapter: unauthorized }).catch(() => undefined);
    expect(callback).toHaveBeenCalledOnce();
  });

  it('业务错误遵守静默配置，同时保留状态码和业务码', async () => {
    const adapter: AxiosAdapter = async (config) => ({
      data: { code: 1001, message: '参数不合法', data: null },
      status: 200, statusText: 'OK', headers: {}, config,
    });
    await expect(get('/validate', undefined, { adapter, suppressErrorToast: true }))
      .rejects.toMatchObject({ status: 200, code: 1001 });
    expect(ElMessage.error).not.toHaveBeenCalled();
    await expect(get('/validate', undefined, { adapter })).rejects.toThrow('参数不合法');
    expect(ElMessage.error).toHaveBeenCalledOnce();
  });

  it('主动取消不弹网络错误，调用方仍能识别取消', async () => {
    const canceled = new CanceledError('页面已离开');
    await expect(get('/request', undefined, { adapter: async () => { throw canceled; } })).rejects.toBe(canceled);
    expect(ElMessage.error).not.toHaveBeenCalled();
  });
});
