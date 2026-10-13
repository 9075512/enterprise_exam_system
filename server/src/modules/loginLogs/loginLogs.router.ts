/**
 * 登录日志 —— 路由层（仅 admin 可查）。
 */
import { Router } from 'express';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { validate } from '../../middleware/validate.js';
import { authRequired } from '../../middleware/auth.js';
import { requireRole } from '../../middleware/role.js';
import { ok } from '../../utils/response.js';
import { normalizePaging } from '../../utils/pagination.js';
import { loginLogQuerySchema } from './loginLogs.schema.js';
import * as loginLogsService from './loginLogs.service.js';

export const loginLogsRouter = Router();

loginLogsRouter.use(authRequired, requireRole('admin'));

/** GET /api/login-logs —— 登录日志列表（成功/失败/来源/时间范围过滤 + 分页）。 */
loginLogsRouter.get(
  '/',
  validate(loginLogQuerySchema, 'query'),
  asyncHandler(async (req, res) => {
    const q = req.query as unknown as {
      username: string;
      success?: '0' | '1';
      source: string;
      from?: string;
      to?: string;
      page: number;
      pageSize: number;
    };
    const paging = normalizePaging(q.page, q.pageSize);
    const result = await loginLogsService.list(
      {
        username: q.username,
        success: q.success === undefined ? undefined : q.success === '1',
        source: q.source,
        from: q.from,
        to: q.to,
      },
      paging.page,
      paging.pageSize,
    );
    return ok(res, result);
  }),
);
