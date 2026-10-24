import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Request, Response } from 'express';
import { env } from '../config/env.js';
import { practiceEdgeGuard } from './practiceEdge.js';
const before = { secret: env.PRACTICE_EDGE_SECRET, only: env.PRACTICE_ONLY };
beforeEach(() => { env.PRACTICE_EDGE_SECRET = 'test-internal-key'; env.PRACTICE_ONLY = false; });
afterEach(() => { env.PRACTICE_EDGE_SECRET = before.secret; env.PRACTICE_ONLY = before.only; });
function check(path: string, method = 'GET', headers = {}) {
  const next = vi.fn(); practiceEdgeGuard({ path, method, headers } as Request, {} as Response, next); return next;
}
describe('public App distribution boundary', () => {
  it('allows version discovery and download reads in edge-protected deployments', () => {
    expect(check('/api/apps/latest')).toHaveBeenCalledWith();
    expect(check('/api/apps/releases/00000000-0000-0000-0000-000000000000/download', 'HEAD')).toHaveBeenCalledWith();
  });
  it('does not expose management, write methods or download-like route prefixes', () => {
    for (const [path, method] of [['/api/apps/manage', 'GET'], ['/api/apps/latest', 'POST'], ['/api/apps/releases/../../manage/download', 'GET'], ['/api/apps/latest/anything', 'GET']]) {
      expect(check(path!, method)).toHaveBeenCalledWith(expect.objectContaining({ httpStatus: 403 }));
    }
  });
  it('keeps internal-key access intact', () => {
    expect(check('/api/apps/manage', 'GET', { 'x-internal-key': 'test-internal-key' })).toHaveBeenCalledWith();
  });
});
