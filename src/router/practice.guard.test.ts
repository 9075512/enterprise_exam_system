/**
 * 练题路由守卫回归测试（架构 §5.2）。
 *
 * 红线：未登录访问受保护的练题路由（meta.requiresPracticeAuth）→ 重定向到练题登录页 `/practice`；
 * 练题路由与内网路由相互独立（练题路由存在且由练题登录态守卫）。
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import router from '@/router';

describe('练题路由守卫', () => {
  beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
  });

  it('注册了练题路由（login/home/session/reans）', () => {
    expect(router.hasRoute('practice-login')).toBe(true);
    expect(router.hasRoute('practice-home')).toBe(true);
    expect(router.hasRoute('practice-session')).toBe(true);
    expect(router.hasRoute('practice-reans')).toBe(true);
  });

  it('未登录访问 /practice/home → 重定向到 /practice 并保留 redirect', async () => {
    await router.push('/practice/home');
    expect(router.currentRoute.value.path).toBe('/practice');
    expect(router.currentRoute.value.query.redirect).toBe('/practice/home');
  });

  it('未登录访问 /practice/banks/:id → 重定向到 /practice', async () => {
    await router.push('/practice/banks/bank-security');
    expect(router.currentRoute.value.path).toBe('/practice');
  });

  it('练题登录页本身无需登录（不重定向）', async () => {
    await router.push('/practice');
    expect(router.currentRoute.value.path).toBe('/practice');
  });
});
