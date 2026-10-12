/**
 * 公网边界兜底中间件（方案甲，§4.9）。
 *
 * 当配置 `PRACTICE_EDGE_SECRET` 且**非** `PRACTICE_ONLY` 时启用：
 * - `/api/practice*` 与 `/api/health` → 放行（公网可见）；
 * - 其余 `/api/*` → 要求请求头 `X-Internal-Key === PRACTICE_EDGE_SECRET`（由内网 Nginx 注入），
 *   命中放行，未命中 403（防公网直连 :3001 绕过 Nginx）。
 *
 * 方案乙（`PRACTICE_ONLY=true`）下练题进程**根本不注册**考试域路由，本中间件自动不启用，
 * 仅作纵深防御保留。
 */
import type { NextFunction, Request, Response } from 'express';
import { env } from '../config/env.js';
import { forbidden } from '../utils/errors.js';

/** 应用级边界守卫（须在 `/api` 路由之前注册）。 */
export function practiceEdgeGuard(req: Request, _res: Response, next: NextFunction): void {
  const secret = env.PRACTICE_EDGE_SECRET;
  if (!secret || env.PRACTICE_ONLY) {
    next();
    return;
  }

  const path = req.path;
  const isPublic = path === '/api/health' || path.startsWith('/api/practice');
  if (isPublic) {
    next();
    return;
  }

  const provided = String(req.headers['x-internal-key'] ?? '');
  if (provided && provided === secret) {
    next();
    return;
  }
  next(forbidden('请求被拒绝'));
}
