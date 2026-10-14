/**
 * sticky 操作条显隐护栏测试（对应 src/composables/useStickyActionBar.ts）
 *
 * 设计规范 §9.3：长表单页头操作区滚出视野后，显示贴底操作条。
 * jsdom 无 IntersectionObserver，这里用假实现驱动回调，验证显隐翻转与卸载断开。
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import { defineComponent, h, type Ref } from 'vue';
import { useStickyActionBar } from './useStickyActionBar';

let lastCallback: IntersectionObserverCallback | null = null;
let observedEl: Element | null = null;
let disconnected = false;
/** 暴露给断言用的 revealed ref */
let revealedRef: Ref<boolean> | null = null;

class FakeIntersectionObserver {
  root = null;
  rootMargin = '';
  thresholds: number[] = [];
  constructor(cb: IntersectionObserverCallback) {
    lastCallback = cb;
  }
  observe(el: Element): void {
    observedEl = el;
  }
  unobserve(): void {
    /* noop */
  }
  disconnect(): void {
    disconnected = true;
    observedEl = null;
  }
  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }
}

/** 触发一次 observer 回调 */
function emitIntersect(isIntersecting: boolean): void {
  lastCallback?.(
    [{ isIntersecting } as IntersectionObserverEntry],
    {} as IntersectionObserver,
  );
}

function buildComp() {
  return defineComponent({
    setup() {
      const { sentinelRef, revealed } = useStickyActionBar();
      revealedRef = revealed;
      return () => h('div', { ref: sentinelRef });
    },
  });
}

describe('useStickyActionBar · 底部操作条显隐', () => {
  const original = globalThis.IntersectionObserver;

  beforeEach(() => {
    lastCallback = null;
    observedEl = null;
    disconnected = false;
    revealedRef = null;
    (globalThis as unknown as { IntersectionObserver: unknown }).IntersectionObserver =
      FakeIntersectionObserver;
  });

  afterEach(() => {
    (globalThis as unknown as { IntersectionObserver: unknown }).IntersectionObserver = original;
  });

  it('初始为隐藏，并已开始观测哨兵元素', () => {
    mount(buildComp());
    expect(revealedRef?.value).toBe(false);
    expect(observedEl).not.toBeNull();
  });

  it('哨兵滚出视野 → 显示；回到视野 → 隐藏', () => {
    mount(buildComp());
    emitIntersect(false);
    expect(revealedRef?.value).toBe(true);

    emitIntersect(true);
    expect(revealedRef?.value).toBe(false);
  });

  it('卸载时断开观测', () => {
    const wrapper = mount(buildComp());
    wrapper.unmount();
    expect(disconnected).toBe(true);
  });
});

