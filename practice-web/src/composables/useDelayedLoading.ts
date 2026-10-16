import { onScopeDispose, readonly, ref, watch, type Ref } from 'vue';

/** 仅延迟视觉反馈，不延迟请求完成或解锁操作；快请求不闪，慢请求保留最短可见时间。 */
export function useDelayedLoading(
  loading: Readonly<Ref<boolean>>,
  { delay = 150, minDuration = 250 } = {},
) {
  const visible = ref(false);
  let shownAt = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const stop = watch(loading, (active) => {
    clearTimeout(timer);
    if (active) {
      if (visible.value) return;
      timer = setTimeout(() => {
        shownAt = Date.now();
        visible.value = true;
      }, delay);
    } else if (visible.value) {
      const remaining = Math.max(0, minDuration - (Date.now() - shownAt));
      if (remaining === 0) visible.value = false;
      else timer = setTimeout(() => { visible.value = false; }, remaining);
    }
  }, { immediate: true, flush: 'sync' });

  onScopeDispose(() => {
    stop();
    clearTimeout(timer);
  });
  return readonly(visible);
}
