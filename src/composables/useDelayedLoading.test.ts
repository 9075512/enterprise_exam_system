import { effectScope, ref } from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useDelayedLoading } from './useDelayedLoading';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

function setup(options?: { delay: number; minDuration: number }) {
  const scope = effectScope();
  const busy = ref(false);
  const visible = scope.run(() => useDelayedLoading(busy, options))!;
  return { scope, busy, visible };
}

describe('加载反馈时序', () => {
  it('快请求完成后不出现迟到的 loading', () => {
    const { scope, busy, visible } = setup();
    busy.value = true;
    vi.advanceTimersByTime(100);
    busy.value = false;
    vi.runAllTimers();
    expect(visible.value).toBe(false);
    scope.stop();
  });

  it('慢请求至少展示 250ms，但真实 busy 立即结束', () => {
    const { scope, busy, visible } = setup();
    busy.value = true;
    vi.advanceTimersByTime(150);
    expect(visible.value).toBe(true);
    busy.value = false;
    expect(busy.value).toBe(false);
    vi.advanceTimersByTime(249);
    expect(visible.value).toBe(true);
    vi.advanceTimersByTime(1);
    expect(visible.value).toBe(false);
    scope.stop();
  });

  it('短间隔新请求不会被上一次关闭定时器熄灭', () => {
    const { scope, busy, visible } = setup();
    busy.value = true;
    vi.advanceTimersByTime(150);
    busy.value = false;
    vi.advanceTimersByTime(50);
    busy.value = true;
    vi.advanceTimersByTime(500);
    expect(visible.value).toBe(true);
    busy.value = false;
    expect(visible.value).toBe(false);
    scope.stop();
  });

  it('慢启动才显示全屏反馈，完成即关闭', () => {
    const { scope, busy, visible } = setup({ delay: 800, minDuration: 0 });
    busy.value = true;
    vi.advanceTimersByTime(799);
    expect(visible.value).toBe(false);
    vi.advanceTimersByTime(1);
    expect(visible.value).toBe(true);
    busy.value = false;
    expect(visible.value).toBe(false);
    scope.stop();
  });

  it('组件卸载会清理等待显示和等待关闭的定时器', () => {
    for (const show of [false, true]) {
      const { scope, busy } = setup();
      busy.value = true;
      if (show) { vi.advanceTimersByTime(150); busy.value = false; }
      scope.stop();
      expect(vi.getTimerCount()).toBe(0);
    }
  });
});
