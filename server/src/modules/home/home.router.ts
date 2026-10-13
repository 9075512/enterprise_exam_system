/**
 * 考试端首页聚合 —— 路由层（v2.0②，v2.0⑥ 增科室级配置）。
 *
 * 前缀：`/api/home`（**考试域**；PRACTICE_ONLY 公网实例不注册本 router）。
 * - `GET    /summary`           需登录：考生首页所需统计 / 趋势 / 待办 / 个性化入口；
 * - `GET    /configs`           管理员：首页配置总览（快捷入口目录 + 科室列表 + 已配置项）；
 * - `PUT    /configs/:deptId`   管理员：保存某科室（或 `*` 全局默认）配置；
 * - `DELETE /configs/:deptId`   管理员：删除某科室配置（回到全局默认）。
 */
import { Router } from 'express';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { validate } from '../../middleware/validate.js';
import { authRequired } from '../../middleware/auth.js';
import { requireRole } from '../../middleware/role.js';
import { ok } from '../../utils/response.js';
import { homeConfigBodySchema, homeConfigParamsSchema } from './home.schema.js';
import type { HomeConfigBodyInput, HomeConfigParamsInput } from './home.schema.js';
import * as service from './home.service.js';
import * as profileService from './homeProfile.service.js';

export const homeRouter = Router();
homeRouter.use(authRequired);

/** GET /api/home/summary —— 考生首页聚合数据。 */
homeRouter.get(
  '/summary',
  asyncHandler(async (req, res) =>
    ok(res, await service.getSummary({ id: req.user!.id, departmentId: req.user!.departmentId })),
  ),
);

/* ------------------------------ 管理端：首页配置 ------------------------------ */

/** GET /api/home/configs —— 首页配置总览（需 admin）。 */
homeRouter.get(
  '/configs',
  requireRole('admin'),
  asyncHandler(async (_req, res) => ok(res, await profileService.getConfigOverview())),
);

/** PUT /api/home/configs/:departmentId —— 保存某科室配置（需 admin）。 */
homeRouter.put(
  '/configs/:departmentId',
  requireRole('admin'),
  validate(homeConfigParamsSchema, 'params'),
  validate(homeConfigBodySchema),
  asyncHandler(async (req, res) => {
    const { departmentId } = req.params as unknown as HomeConfigParamsInput;
    const body = req.body as HomeConfigBodyInput;
    return ok(res, await profileService.saveConfig(departmentId, body, req.user!.id));
  }),
);

/** DELETE /api/home/configs/:departmentId —— 删除某科室配置（需 admin）。 */
homeRouter.delete(
  '/configs/:departmentId',
  requireRole('admin'),
  validate(homeConfigParamsSchema, 'params'),
  asyncHandler(async (req, res) => {
    const { departmentId } = req.params as unknown as HomeConfigParamsInput;
    await profileService.resetConfig(departmentId);
    return ok(res, null);
  }),
);
