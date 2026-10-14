/**
 * 表单页「sticky 底部操作条」显隐组合式函数（设计规范 §9.3）。
 *
 * 场景：长表单（如系统设置）滚到底部后，页头的「保存」按钮已移出视野，
 * 想保存得先滚回顶部。这里用一个不可见的哨兵元素观测：
 * 哨兵滚出视野（= 页头操作区不可见）→ 显示贴底的底部操作条。
 *
 * 用 IntersectionObserver 而非 scroll 监听：不占主线程、无需节流，
 * 且能自动适配任意滚动容器（本项目为 `.layout__content`）。
 *
 * 用法：
 *   const { sentinelRef, revealed } = useStickyActionBar();
 *   // 模板：<div ref="sentinelRef" aria-hidden="true" /> 紧跟在页头之后
 */
import { onBeforeUnmount, onMounted, ref, type Ref } from 'vue';

export function useStickyActionBar(): {
  /** 哨兵元素 ref：放在页头操作区之后 */
  sentinelRef: Ref<HTMLElement | null>;
  /** 页头操作区已滚出视野时置为 true（此时显示底部操作条） */
  revealed: Ref<boolean>;
} {
  const sentinelRef = ref<HTMLElement | null>(null);
  const revealed = ref(false);
  let observer: IntersectionObserver | null = null;

  onMounted(() => {
    if (!sentinelRef.value || typeof IntersectionObserver === 'undefined') return;
    observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry) revealed.value = !entry.isIntersecting;
      },
      { threshold: 0 },
    );
    observer.observe(sentinelRef.value);
  });

  onBeforeUnmount(() => {
    observer?.disconnect();
    observer = null;
  });

  return { sentinelRef, revealed };
}
