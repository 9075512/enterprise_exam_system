import { describe, expect, it } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';
import { practiceRedirect } from './redirect';

const router = createRouter({
  history: createMemoryHistory(),
  routes: [
    { path: '/practice', component: {} },
    { path: '/practice/home', component: {}, meta: { requiresPracticeAuth: true } },
    { path: '/practice/banks/:bankId', component: {}, meta: { requiresPracticeAuth: true } },
    { path: '/:pathMatch(.*)*', redirect: '/practice' },
  ],
});

describe('practice login redirects', () => {
  it.each(['/practice', '/practice?redirect=/practice', '/unknown', '/', '//example.com', 'https://example.com', undefined, ['bad']])('rejects recursive or invalid redirect %s', (value) => {
    expect(practiceRedirect(router, value)).toBe('/practice/home');
  });
  it('preserves a valid destination and its query', () => {
    expect(practiceRedirect(router, '/practice/banks/demo?count=100')).toBe('/practice/banks/demo?count=100');
  });
});
