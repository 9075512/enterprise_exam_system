/**
 * 系统维护 —— 路由层（v1.7④ T5，仅 admin）。
 */
import { Router } from 'express';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { validate } from '../../middleware/validate.js';
import { authRequired } from '../../middleware/auth.js';
import { requireRole } from '../../middleware/role.js';
import { ok } from '../../utils/response.js';
import { archiveSchema } from './maintenance.schema.js';
import type { ArchiveInput } from './maintenance.schema.js';
import * as maintenanceService from './maintenance.service.js';

export const maintenanceRouter = Router();

maintenanceRouter.use(authRequired, requireRole('admin'));

/** GET /api/maintenance/stats —— 核心表行数与归档量统计。 */
maintenanceRouter.get(
  '/stats',
  asyncHandler(async (_req, res) => ok(res, await maintenanceService.getStats())),
);

/** POST /api/maintenance/archive —— 执行历史成绩归档。 */
maintenanceRouter.post(
  '/archive',
  validate(archiveSchema, 'body'),
  asyncHandler(async (req, res) => {
    const body = req.body as ArchiveInput;
    return ok(res, await maintenanceService.archive(body, req.user!.id));
  }),
);
