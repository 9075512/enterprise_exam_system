/**
 * 鉴权模块 —— 路由层（仅编排：校验 → service → 统一响应/错误）。
 */
import { Router } from 'express';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { validate } from '../../middleware/validate.js';
import { authRequired } from '../../middleware/auth.js';
import { ok } from '../../utils/response.js';
import { clientIp } from '../../middleware/practiceLoginGuard.js';
import { issueCaptcha } from '../../utils/captcha.js';
import {
  loginSchema,
  changePasswordSchema,
  twoFactorVerifySchema,
  twoFactorEnableSchema,
  twoFactorDisableSchema,
} from './auth.schema.js';
import * as authService from './auth.service.js';

export const authRouter = Router();

/** GET /api/auth/captcha —— 下发图形验证码（登录失败达阈值后需要，v1.7③ T1）。 */
authRouter.get(
  '/captcha',
  asyncHandler(async (_req, res) => ok(res, issueCaptcha())),
);

/** POST /api/auth/login —— 登录签发 JWT（公开）。 */
authRouter.post(
  '/login',
  validate(loginSchema, 'body'),
  asyncHandler(async (req, res) => {
    const { username, password, captchaId, captcha } = req.body as {
      username: string;
      password: string;
      captchaId?: string;
      captcha?: string;
    };
    const result = await authService.login(username, password, {
      ip: clientIp(req),
      userAgent: String(req.headers['user-agent'] ?? ''),
      captchaId,
      captcha,
    });
    return ok(res, result);
  }),
);

/** POST /api/auth/2fa/verify —— 两步验证第二步（凭挑战令牌换取正式 Token）。 */
authRouter.post(
  '/2fa/verify',
  validate(twoFactorVerifySchema, 'body'),
  asyncHandler(async (req, res) => {
    const { challengeToken, code } = req.body as { challengeToken: string; code: string };
    const result = await authService.verifyTwoFactor(challengeToken, code, {
      ip: clientIp(req),
      userAgent: String(req.headers['user-agent'] ?? ''),
    });
    return ok(res, result);
  }),
);

/** POST /api/auth/logout —— 登出（撤销当前会话）。 */
authRouter.post(
  '/logout',
  authRequired,
  asyncHandler(async (req, res) => {
    await authService.logout(req.user!.id, req.user!.sessionId ?? '');
    return ok(res, null);
  }),
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

/* ============================== 两步验证（TOTP，v1.7③） ============================== */

/** GET /api/auth/2fa/policy —— 密码策略与两步验证可用性（个人安全页展示）。 */
authRouter.get(
  '/2fa/policy',
  authRequired,
  asyncHandler(async (_req, res) => ok(res, await authService.passwordPolicyText())),
);

/** POST /api/auth/2fa/setup —— 生成 2FA 密钥（未启用）。 */
authRouter.post(
  '/2fa/setup',
  authRequired,
  asyncHandler(async (req, res) => ok(res, await authService.setupTwoFactor(req.user!.id))),
);

/** POST /api/auth/2fa/enable —— 验证验证码后启用 2FA。 */
authRouter.post(
  '/2fa/enable',
  authRequired,
  validate(twoFactorEnableSchema, 'body'),
  asyncHandler(async (req, res) => {
    const { code } = req.body as { code: string };
    await authService.enableTwoFactor(req.user!.id, code);
    return ok(res, null);
  }),
);

/** POST /api/auth/2fa/disable —— 校验密码 + 验证码后关闭 2FA。 */
authRouter.post(
  '/2fa/disable',
  authRequired,
  validate(twoFactorDisableSchema, 'body'),
  asyncHandler(async (req, res) => {
    const { password, code } = req.body as { password: string; code: string };
    await authService.disableTwoFactor(req.user!.id, password, code);
    return ok(res, null);
  }),
);

/* ============================== 登录设备管理（v1.7③） ============================== */

/** GET /api/auth/sessions —— 我的登录设备列表。 */
authRouter.get(
  '/sessions',
  authRequired,
  asyncHandler(async (req, res) => {
    const list = await authService.listSessions(req.user!.id, req.user!.sessionId ?? '');
    return ok(res, list);
  }),
);

/** DELETE /api/auth/sessions —— 下线除当前设备外的全部设备。 */
authRouter.delete(
  '/sessions',
  authRequired,
  asyncHandler(async (req, res) => {
    const count = await authService.revokeOtherSessions(req.user!.id, req.user!.sessionId ?? '');
    return ok(res, { count });
  }),
);

/** DELETE /api/auth/sessions/:id —— 下线指定设备。 */
authRouter.delete(
  '/sessions/:id',
  authRequired,
  asyncHandler(async (req, res) => {
    await authService.revokeSession(req.user!.id, req.params.id);
    return ok(res, null);
  }),
);
