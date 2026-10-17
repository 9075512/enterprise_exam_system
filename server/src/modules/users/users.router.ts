/**
 * 用户模块 —— 路由层（全部需 admin 权限）。
 */
import { Router } from 'express';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { validate } from '../../middleware/validate.js';
import { authRequired } from '../../middleware/auth.js';
import { requireRole } from '../../middleware/role.js';
import { ok } from '../../utils/response.js';
import { createUserSchema, updateUserSchema, listQuerySchema } from './users.schema.js';
import * as usersService from './users.service.js';
import type { Role, UserStatus } from '../../types/domain.js';

export const usersRouter = Router();

// 全部用户管理接口要求 admin
usersRouter.use(authRequired, requireRole('admin'));

/** GET /api/users?role=&keyword= —— 用户列表。 */
usersRouter.get(
  '/',
  validate(listQuerySchema, 'query'),
  asyncHandler(async (req, res) => {
    const { role, groupId, keyword } = req.query as unknown as { role?: Role; groupId?: string; keyword: string };
    const list = await usersService.list({ role, groupId, keyword });
    return ok(res, list);
  }),
);

/** POST /api/users —— 新建用户。 */
usersRouter.post(
  '/',
  validate(createUserSchema, 'body'),
  asyncHandler(async (req, res) => {
    const body = req.body as {
      username: string;
      name: string;
      role?: Role;
      positionId?: string;
      groupIds?: string[];
      departmentId: string;
      email?: string;
      status?: UserStatus;
      password?: string;
    };
    const user = await usersService.create(body, req.user!.id);
    return ok(res, user);
  }),
);

/** PUT /api/users/:id —— 编辑用户。 */
usersRouter.put(
  '/:id',
  validate(updateUserSchema, 'body'),
  asyncHandler(async (req, res) => {
    const body = req.body as {
      username: string;
      name: string;
      role?: Role;
      positionId?: string;
      groupIds?: string[];
      departmentId: string;
      email?: string;
      status?: UserStatus;
      password?: string;
    };
    const user = await usersService.update(req.params.id, body, req.user!.id);
    return ok(res, user);
  }),
);

/** DELETE /api/users/:id —— 删除用户。 */
usersRouter.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    await usersService.remove(req.params.id, req.user!.id);
    return ok(res, null);
  }),
);

/** POST /api/users/:id/reset-password —— 重置为默认密码。 */
usersRouter.post(
  '/:id/reset-password',
  asyncHandler(async (req, res) => {
    await usersService.resetPassword(req.params.id, req.user!.id);
    return ok(res, null);
  }),
);

/** POST /api/users/:id/2fa/reset —— 管理员强制重置某账号的两步验证（v1.8② U2）。 */
usersRouter.post(
  '/:id/2fa/reset',
  asyncHandler(async (req, res) => {
    await usersService.resetTwoFactor(req.params.id, req.user!.id);
    return ok(res, null);
  }),
);

/** GET /api/users/:id/sessions —— 查看某用户的登录设备（v1.7③）。 */
usersRouter.get(
  '/:id/sessions',
  asyncHandler(async (req, res) => {
    const list = await usersService.listUserSessions(req.params.id);
    return ok(res, list);
  }),
);

/** DELETE /api/users/:id/sessions —— 强制下线某用户全部设备（v1.7③）。 */
usersRouter.delete(
  '/:id/sessions',
  asyncHandler(async (req, res) => {
    const count = await usersService.revokeUserSessions(req.params.id, req.user!.id);
    return ok(res, { count });
  }),
);
