/**
 * 补考 —— 路由层。
 *  - POST /api/retakes/apply          考生发起申请
 *  - GET  /api/retakes/my             考生查看本人申请
 *  - GET  /api/retakes                管理员审批列表（可按状态过滤）
 *  - POST /api/retakes/:id/approve    管理员通过
 *  - POST /api/retakes/:id/reject     管理员驳回
 */
import { Router } from 'express';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { validate } from '../../middleware/validate.js';
import { authRequired } from '../../middleware/auth.js';
import { requireRole } from '../../middleware/role.js';
import { ok } from '../../utils/response.js';
import { applyRetakeSchema, rejectRetakeSchema } from './retakes.schema.js';
import * as retakesService from './retakes.service.js';
import type { RetakeStatus } from '../../types/domain.js';

export const retakesRouter = Router();
retakesRouter.use(authRequired);

/** 考生发起补考申请。 */
retakesRouter.post(
  '/apply',
  requireRole('examinee'),
  validate(applyRetakeSchema, 'body'),
  asyncHandler(async (req, res) => {
    const body = req.body as { examId: string; reason: string };
    return ok(res, await retakesService.apply(req.user!.id, body));
  }),
);

/** 考生查看本人补考申请。 */
retakesRouter.get(
  '/my',
  requireRole('examinee'),
  asyncHandler(async (req, res) => {
    const { page, pageSize } = req.query as unknown as { page?: number; pageSize?: number };
    return ok(res, await retakesService.listMy(req.user!.id, page, pageSize));
  }),
);

/** 管理员审批列表。 */
retakesRouter.get(
  '/',
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    const { status, page, pageSize } = req.query as unknown as {
      status?: RetakeStatus;
      page?: number;
      pageSize?: number;
    };
    return ok(res, await retakesService.list({ status }, page, pageSize));
  }),
);

/** 管理员通过。 */
retakesRouter.post(
  '/:id/approve',
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    return ok(res, await retakesService.approve(req.params.id, req.user!.id));
  }),
);

/** 管理员驳回。 */
retakesRouter.post(
  '/:id/reject',
  requireRole('admin'),
  validate(rejectRetakeSchema, 'body'),
  asyncHandler(async (req, res) => {
    const body = req.body as { reason: string };
    return ok(res, await retakesService.reject(req.params.id, req.user!.id, body.reason));
  }),
);
