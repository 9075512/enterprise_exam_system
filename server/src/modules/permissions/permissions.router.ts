/**
 * 菜单权限 —— 路由层。
 *  - GET /api/permissions/menus  需登录且 admin（完整目录 + 授权）
 *  - PUT /api/permissions/menus  需登录且 admin（整体替换授权）
 *  - GET /api/permissions/my     需登录（当前角色可见菜单 key）
 */
import { Router } from 'express';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { authRequired } from '../../middleware/auth.js';
import { requireRole } from '../../middleware/role.js';
import { ok } from '../../utils/response.js';
import * as permissionsService from './permissions.service.js';

export const permissionsRouter = Router();

permissionsRouter.get(
  '/menus',
  authRequired,
  requireRole('admin'),
  asyncHandler(async (_req, res) => {
    return ok(res, await permissionsService.getMenuPermissions());
  }),
);

permissionsRouter.put(
  '/menus',
  authRequired,
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    const result = await permissionsService.updateMenuPermissions(req.body, req.user!.id);
    return ok(res, result);
  }),
);

permissionsRouter.get(
  '/my',
  authRequired,
  asyncHandler(async (req, res) => {
    return ok(res, await permissionsService.getMyMenus(req.user!.role, req.user!.id));
  }),
);
