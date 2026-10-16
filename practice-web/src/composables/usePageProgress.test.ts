import { beforeEach, describe, expect, it } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';
import { installPageProgress, usePageProgress } from './usePageProgress';

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => { resolve = r; });
  return { promise, resolve };
}

function makeRouter() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: ['/home', '/private', '/login', '/slow', '/next', '/error', '/abort'].map((path) => ({
      path, component: { template: '<div />' },
    })),
  });
  installPageProgress(router);
  return router;
}

const progress = usePageProgress();
beforeEach(() => progress.done(progress.start()));

describe('路由加载进度', () => {
  it('鉴权重定向完成后不残留进度条', async () => {
    const router = makeRouter();
    router.beforeEach((to) => to.path === '/private' ? '/login' : true);
    await router.push('/private');
    expect(router.currentRoute.value.path).toBe('/login');
    expect(progress.active.value).toBe(false);
  });

  it('旧导航被取消时不提前关闭正在等待的新导航', async () => {
    const router = makeRouter();
    await router.push('/home');
    const old = deferred();
    const next = deferred();
    const oldEntered = deferred();
    const nextEntered = deferred();
    router.beforeEach(async (to) => {
      if (to.path === '/slow') { oldEntered.resolve(); await old.promise; }
      if (to.path === '/next') { nextEntered.resolve(); await next.promise; }
    });
    const oldNavigation = router.push('/slow');
    await oldEntered.promise;
    const nextNavigation = router.push('/next');
    await nextEntered.promise;
    old.resolve();
    await oldNavigation;
    expect(progress.active.value).toBe(true);
    next.resolve();
    await nextNavigation;
    expect(progress.active.value).toBe(false);
  });

  it('取消、错误、重复导航均能正确结束且后续可再次加载', async () => {
    const router = makeRouter();
    await router.push('/home');
    router.beforeEach((to) => {
      if (to.path === '/error') throw new Error('chunk load failed');
      if (to.path === '/abort') return false;
      return true;
    });
    await router.push('/abort');
    expect(progress.active.value).toBe(false);
    await expect(router.push('/error')).rejects.toThrow('chunk load failed');
    expect(progress.active.value).toBe(false);
    await router.push('/home');
    expect(progress.active.value).toBe(false);
    await router.push('/next');
    expect(progress.active.value).toBe(false);
  });
});
