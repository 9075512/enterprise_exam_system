import { describe, expect, it, vi } from 'vitest';
import { effectScope, nextTick, ref } from 'vue';
import { useRequest } from './useRequest';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

describe('useRequest 请求竞争与生命周期', () => {
  it('快速连续查询：较早响应不能提前结束最新请求的 loading', async () => {
    const old = deferred<string>();
    const latest = deferred<string>();
    const fn = vi.fn().mockReturnValueOnce(old.promise).mockReturnValueOnce(latest.promise);
    const state = useRequest<string>(fn, [], { immediate: false });
    const first = state.run();
    const second = state.run();
    old.resolve('旧结果');
    await first;
    expect(state.loading.value).toBe(true);
    expect(state.data.value).toBeNull();
    latest.resolve('新结果');
    await second;
    expect(state.data.value).toBe('新结果');
    expect(state.loading.value).toBe(false);
  });

  it('最新查询先成功：迟到的成功和失败都不能覆盖新结果', async () => {
    const oldSuccess = deferred<string>();
    const oldFailure = deferred<string>();
    const fn = vi.fn()
      .mockReturnValueOnce(oldSuccess.promise)
      .mockReturnValueOnce(oldFailure.promise)
      .mockResolvedValueOnce('新结果');
    const state = useRequest<string>(fn, [], { immediate: false });
    const first = state.run();
    const second = state.run();
    await state.run();
    oldSuccess.resolve('旧结果');
    oldFailure.reject(new Error('旧错误'));
    await Promise.all([first, second]);
    expect(state.data.value).toBe('新结果');
    expect(state.error.value).toBeNull();
    expect(state.loading.value).toBe(false);
  });

  it('失败可重试，切换实体时可立即清空旧数据', async () => {
    const error = new Error('网络中断');
    const fn = vi.fn().mockResolvedValueOnce('A').mockRejectedValueOnce(error).mockResolvedValueOnce('B');
    const state = useRequest<string>(fn, [], { immediate: false, keepPreviousData: false });
    await state.run();
    const failed = state.run();
    expect(state.data.value).toBeNull();
    await failed;
    expect(state.error.value).toBe(error);
    await state.refresh();
    expect(state.data.value).toBe('B');
    expect(state.error.value).toBeNull();
  });

  it('组件离开后不再回填数据，也不再发起依赖请求', async () => {
    const pending = deferred<string>();
    const dep = ref('A');
    const fn = vi.fn(() => pending.promise);
    const scope = effectScope();
    const state = scope.run(() => useRequest(fn, [dep], { immediate: false }))!;
    const request = state.run();
    scope.stop();
    pending.resolve('迟到结果');
    await request;
    dep.value = 'B';
    await nextTick();
    await state.run();
    expect(state.data.value).toBeNull();
    expect(state.loading.value).toBe(false);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('依赖变化仍会自动刷新', async () => {
    const dep = ref('A');
    const fn = vi.fn(async () => dep.value);
    const scope = effectScope();
    const state = scope.run(() => useRequest(fn, [dep], { immediate: false }))!;
    dep.value = 'B';
    await nextTick();
    await nextTick();
    expect(state.data.value).toBe('B');
    expect(fn).toHaveBeenCalledTimes(1);
    scope.stop();
  });
});
