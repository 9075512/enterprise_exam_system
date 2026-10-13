/**
 * 操作审计日志 —— 路由层（仅 admin 可查）。
 */
import { Router } from 'express';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { validate } from '../../middleware/validate.js';
import { authRequired } from '../../middleware/auth.js';
import { requireRole } from '../../middleware/role.js';
import { ok } from '../../utils/response.js';
import { normalizePaging } from '../../utils/pagination.js';
import { auditListQuerySchema } from './audit.schema.js';
import * as auditService from './audit.service.js';

export const auditRouter = Router();

auditRouter.use(authRequired, requireRole('admin'));

/** GET /api/audit-logs —— 审计日志列表（过滤 + 分页）。 */
auditRouter.get(
  '/',
  validate(auditListQuerySchema, 'query'),
  asyncHandler(async (req, res) => {
    const q = req.query as unknown as {
      action?: string;
      targetType?: string;
      keyword?: string;
      from?: string;
      to?: string;
      page: number;
      pageSize: number;
    };
    const paging = normalizePaging(q.page, q.pageSize);
    const result = await auditService.list(
      { action: q.action, targetType: q.targetType, keyword: q.keyword, from: q.from, to: q.to },
      paging.page,
      paging.pageSize,
    );
    return ok(res, result);
  }),
);
