/**
 * 科室模块 —— 路由层（全部需 admin 权限）。
 */
import { Router } from 'express';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { validate } from '../../middleware/validate.js';
import { authRequired } from '../../middleware/auth.js';
import { requireRole } from '../../middleware/role.js';
import { ok } from '../../utils/response.js';
import { departmentSchema } from './departments.schema.js';
import * as departmentsService from './departments.service.js';

export const departmentsRouter = Router();

// 全部科室管理接口要求 admin
departmentsRouter.use(authRequired, requireRole('admin'));

/** GET /api/departments —— 科室列表。 */
departmentsRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    const list = await departmentsService.list();
    return ok(res, list);
  }),
);

/** POST /api/departments —— 新建科室。 */
departmentsRouter.post(
  '/',
  validate(departmentSchema, 'body'),
  asyncHandler(async (req, res) => {
    const { name, description } = req.body as { name: string; description: string };
    const dept = await departmentsService.create({ name, description });
    return ok(res, dept);
  }),
);

/** PUT /api/departments/:id —— 编辑科室。 */
departmentsRouter.put(
  '/:id',
  validate(departmentSchema, 'body'),
  asyncHandler(async (req, res) => {
    const { name, description } = req.body as { name: string; description: string };
    const dept = await departmentsService.update(req.params.id, { name, description });
    return ok(res, dept);
  }),
);

/** DELETE /api/departments/:id —— 删除科室（有归属用户 → 1005）。 */
departmentsRouter.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    await departmentsService.remove(req.params.id);
    return ok(res, null);
  }),
);
