/**
 * 考试端首页聚合 —— 路由层。
 *
 * 前缀：`/api/home`（**考试域**；PRACTICE_ONLY 公网实例不注册本 router）。
 * - `GET    /summary`           需登录：考生首页所需统计 / 趋势 / 待办 / 快捷入口；
 */
import { Router } from 'express';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { authRequired } from '../../middleware/auth.js';
import { ok } from '../../utils/response.js';
import * as service from './home.service.js';

export const homeRouter = Router();
homeRouter.use(authRequired);

/** GET /api/home/summary —— 考生首页聚合数据。 */
homeRouter.get(
  '/summary',
  asyncHandler(async (req, res) =>
    ok(res, await service.getSummary({ id: req.user!.id, departmentId: req.user!.departmentId })),
  ),
);
