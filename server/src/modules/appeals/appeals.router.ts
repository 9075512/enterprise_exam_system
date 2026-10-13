/**
 * 成绩复核 —— 路由层（v1.7①）。
 *  - POST /api/appeals/apply        考生发起复核申请
 *  - GET  /api/appeals/my           考生查看本人复核申请
 *  - GET  /api/appeals              管理员复核列表（可按状态过滤）
 *  - POST /api/appeals/:id/approve  管理员复核通过（改分）
 *  - POST /api/appeals/:id/reject   管理员复核驳回
 */
import { Router } from 'express';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { validate } from '../../middleware/validate.js';
import { authRequired } from '../../middleware/auth.js';
import { requireRole } from '../../middleware/role.js';
import { ok } from '../../utils/response.js';
import { applyAppealSchema, approveAppealSchema, rejectAppealSchema } from './appeals.schema.js';
import * as appealsService from './appeals.service.js';
import type { AppealStatus } from '../../types/domain.js';

export const appealsRouter = Router();
appealsRouter.use(authRequired);

/** 考生发起成绩复核申请。 */
appealsRouter.post(
  '/apply',
  requireRole('examinee'),
  validate(applyAppealSchema, 'body'),
  asyncHandler(async (req, res) => {
    const body = req.body as { recordId: string; reason: string };
    return ok(res, await appealsService.apply(req.user!.id, body));
  }),
);

/** 考生查看本人复核申请。 */
appealsRouter.get(
  '/my',
  requireRole('examinee'),
  asyncHandler(async (req, res) => {
    const { page, pageSize } = req.query as unknown as { page?: number; pageSize?: number };
    return ok(res, await appealsService.listMine(req.user!.id, page, pageSize));
  }),
);

/** 管理员复核列表。 */
appealsRouter.get(
  '/',
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    const { status, page, pageSize } = req.query as unknown as {
      status?: AppealStatus;
      page?: number;
      pageSize?: number;
    };
    return ok(res, await appealsService.list({ status }, page, pageSize));
  }),
);

/** 管理员复核通过（改分）。 */
appealsRouter.post(
  '/:id/approve',
  requireRole('admin'),
  validate(approveAppealSchema, 'body'),
  asyncHandler(async (req, res) => {
    const body = req.body as { newScore: number; comment?: string };
    return ok(res, await appealsService.approve(req.params.id, req.user!.id, body));
  }),
);

/** 管理员复核驳回。 */
appealsRouter.post(
  '/:id/reject',
  requireRole('admin'),
  validate(rejectAppealSchema, 'body'),
  asyncHandler(async (req, res) => {
    const body = req.body as { comment: string };
    return ok(res, await appealsService.reject(req.params.id, req.user!.id, body.comment));
  }),
);
