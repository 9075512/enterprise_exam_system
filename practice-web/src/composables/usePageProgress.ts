/**
 * 顶栏进度细条（Loading 方案 ⑤）—— 路由级全局过渡。
 *
 * 可重入计数：并发导航（重定向链）时只有全部结束才熄灭；
 * 组件层负责 300ms 淡出，避免细条闪烁。
 * 用法：router.beforeEach 里 start()，afterEach/onError 里 done()。
 */
import { computed, ref } from 'vue';

const pending = ref(0);

export function usePageProgress() {
  return {
    /** 是否有进行中的导航 */
    active: computed(() => pending.value > 0),
    start(): void {
      pending.value += 1;
    },
    done(): void {
      pending.value = Math.max(0, pending.value - 1);
    },
  };
}
