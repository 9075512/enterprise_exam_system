import type { Router } from 'vue-router';

/** A login redirect must resolve to an authenticated page, never login or the catch-all. */
export function practiceRedirect(router: Router, value: unknown): string {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//')) {
    return '/practice/home';
  }
  const target = router.resolve(value);
  return target.meta.requiresPracticeAuth ? target.fullPath : '/practice/home';
}
