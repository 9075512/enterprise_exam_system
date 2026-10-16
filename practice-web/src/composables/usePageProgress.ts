/** 路由进度只跟踪最新导航；重定向不保证逐次触发 afterEach，不能使用累加计数。 */
import { computed, ref } from 'vue';
import type { Router, RouteLocationNormalized } from 'vue-router';

const pending = ref<number | null>(null);
let sequence = 0;

export function usePageProgress() {
  return {
    active: computed(() => pending.value !== null),
    start(): number {
      const id = ++sequence;
      pending.value = id;
      return id;
    },
    done(id: number | undefined): void {
      // 被新导航取代的旧请求完成/取消/报错，不能关闭当前进度。
      if (id === pending.value) pending.value = null;
    },
  };
}

/** 必须在鉴权等业务守卫之前注册。 */
export function installPageProgress(router: Router): void {
  const progress = usePageProgress();
  const navigations = new WeakMap<RouteLocationNormalized, number>();
  router.beforeEach((to) => {
    navigations.set(to, progress.start());
  });
  router.afterEach((to) => progress.done(navigations.get(to)));
  router.onError((_error, to) => progress.done(navigations.get(to)));
}
