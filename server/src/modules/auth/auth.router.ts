/**
 * 鉴权模块 —— 路由层（仅编排：校验 → service → 统一响应/错误）。
 */
import { Router } from 'express';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { validate } from '../../middleware/validate.js';
import { authRequired } from '../../middleware/auth.js';
import { ok } from '../../utils/response.js';
import { loginSchema, changePasswordSchema } from './auth.schema.js';
import * as authService from './auth.service.js';

export const authRouter = Router();

/** POST /api/auth/login —— 登录签发 JWT（公开）。 */
authRouter.post(
  '/login',
  validate(loginSchema, 'body'),
  asyncHandler(async (req, res) => {
    const { username, password } = req.body as { username: string; password: string };
    const result = await authService.login(username, password);
    return ok(res, result);
  }),
);

/** POST /api/auth/logout —— 无状态登出（前端清 Token）。 */
authRouter.post(
  '/logout',
  authRequired,
  asyncHandler(async (_req, res) => ok(res, null)),
);

/** GET /api/auth/me —— 获取当前用户。 */
authRouter.get(
  '/me',
  authRequired,
  asyncHandler(async (req, res) => {
    const user = await authService.me(req.user!.id);
    return ok(res, user);
  }),
);

/** PUT /api/auth/password —— 修改本人密码。 */
authRouter.put(
  '/password',
  authRequired,
  validate(changePasswordSchema, 'body'),
  asyncHandler(async (req, res) => {
    const { oldPassword, newPassword } = req.body as { oldPassword: string; newPassword: string };
    await authService.changePassword(req.user!.id, oldPassword, newPassword);
    return ok(res, null);
  }),
);
