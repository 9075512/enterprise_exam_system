import { beforeEach, describe, expect, it, vi } from 'vitest';
import { effectScope } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import type { Page } from '@/types';
import { usePagination } from './usePagination';

vi.mock('@/stores/settings', () => ({ useSettingsStore: () => ({ settings: { defaultPageSize: 20 } }) }));

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

const result = (page: number): Page<string> => ({ list: [`第 ${page} 页`], total: 80, page, pageSize: 20 });

beforeEach(() => setActivePinia(createPinia()));

describe('usePagination 快速翻页与失败恢复', () => {
  it('响应乱序时，列表、页码与总数都以最新请求为准', async () => {
    const old = deferred<Page<string>>();
    const latest = deferred<Page<string>>();
    const fn = vi.fn().mockReturnValueOnce(old.promise).mockReturnValueOnce(latest.promise);
    const state = usePagination<string>(fn);
    const first = state.load();
    state.page.value = 2;
    const second = state.load();
    latest.resolve(result(2));
    await second;
    old.resolve({ ...result(1), total: 10, pageSize: 5 });
    await first;
    expect(state.list.value).toEqual(['第 2 页']);
    expect([state.page.value, state.pageSize.value, state.total.value]).toEqual([2, 20, 80]);
  });

  it('旧请求失败不会结束新请求的 loading 或显示旧错误', async () => {
    const old = deferred<Page<string>>();
    const latest = deferred<Page<string>>();
    const state = usePagination<string>(vi.fn().mockReturnValueOnce(old.promise).mockReturnValueOnce(latest.promise));
    const first = state.load();
    const second = state.load();
    old.reject(new Error('旧错误'));
    await first;
    expect(state.loading.value).toBe(true);
    expect(state.error.value).toBeNull();
    latest.resolve(result(2));
    await second;
    expect(state.loading.value).toBe(false);
  });

  it('清空筛选目标后，在途响应不能把列表重新填回', async () => {
    const pending = deferred<Page<string>>();
    const state = usePagination<string>(() => pending.promise);
    const request = state.load();
    state.clear();
    pending.resolve(result(3));
    await request;
    expect(state.list.value).toEqual([]);
    expect([state.page.value, state.total.value]).toEqual([1, 0]);
    expect(state.loading.value).toBe(false);
  });

  it('查询失败不产生未处理拒绝，下一次查询能恢复', async () => {
    const error = new Error('网络中断');
    const state = usePagination<string>(vi.fn().mockRejectedValueOnce(error).mockResolvedValueOnce(result(1)));
    await expect(state.load()).resolves.toBeUndefined();
    expect(state.error.value).toBe(error);
    expect(state.loading.value).toBe(false);
    await state.load();
    expect(state.error.value).toBeNull();
    expect(state.list.value).toEqual(['第 1 页']);
  });

  it('重新查询和改变每页条数时都从第一页加载', async () => {
    const fn = vi.fn(async (page: number, pageSize: number) => ({ ...result(page), pageSize }));
    const state = usePagination<string>(fn);
    state.page.value = 4;
    state.reset();
    expect(fn).toHaveBeenLastCalledWith(1, 20);
    await Promise.resolve();
    state.page.value = 3;
    state.onSizeChange(50);
    expect(fn).toHaveBeenLastCalledWith(1, 50);
  });

  it('卸载后不再回填列表', async () => {
    const pending = deferred<Page<string>>();
    const scope = effectScope();
    const state = scope.run(() => usePagination<string>(() => pending.promise))!;
    const request = state.load();
    scope.stop();
    pending.resolve(result(1));
    await request;
    expect(state.list.value).toEqual([]);
    expect(state.loading.value).toBe(false);
  });
});
