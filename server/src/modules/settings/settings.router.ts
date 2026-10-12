/**
 * 系统设置模块 —— 路由层。
 *  - GET  /api/settings/public    无需登录（登录页品牌展示用）
 *  - GET  /api/settings           需登录（任意角色）
 *  - PUT  /api/settings           需登录且 admin
 *  - GET  /api/settings/practice  需登录且 admin（公网练题配置，二期）
 *  - PUT  /api/settings/practice  需登录且 admin（公网练题配置，二期）
 *
 * ⚠️ 隔离：本 router 在 PRACTICE_ONLY（公网练题实例）下**整体不注册**（见 app.ts），
 *          故 `/api/settings/practice` 在公网实例中物理不可达。
 */
import { Router } from 'express';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { authRequired } from '../../middleware/auth.js';
import { requireRole } from '../../middleware/role.js';
import { ok } from '../../utils/response.js';
import * as settingsService from './settings.service.js';
import * as practiceSettingsService from '../practice/practiceSettings.service.js';

export const settingsRouter = Router();

/** GET /api/settings/public —— 公开设置（无需登录）。 */
settingsRouter.get(
  '/public',
  asyncHandler(async (_req, res) => {
    return ok(res, await settingsService.getPublicSettings());
  }),
);

/**
 * GET /api/settings/practice —— 公网练题配置（需登录且 admin）。
 * 注意：必须注册在 `GET /` 之外的独立路径，二者不冲突。
 */
settingsRouter.get(
  '/practice',
  authRequired,
  requireRole('admin'),
  asyncHandler(async (_req, res) => {
    return ok(res, await practiceSettingsService.getPracticeSettings());
  }),
);

/** PUT /api/settings/practice —— 更新公网练题配置（需登录且 admin）。 */
settingsRouter.put(
  '/practice',
  authRequired,
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    const saved = await practiceSettingsService.updatePracticeSettings(req.body, req.user!.id);
    return ok(res, saved);
  }),
);

/** GET /api/settings —— 完整设置（需登录，任意角色）。 */
settingsRouter.get(
  '/',
  authRequired,
  asyncHandler(async (_req, res) => {
    return ok(res, await settingsService.getSettings());
  }),
);

/** PUT /api/settings —— 更新设置（需登录且 admin）。 */
settingsRouter.put(
  '/',
  authRequired,
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    const saved = await settingsService.updateSettings(req.body, req.user!.id);
    return ok(res, saved);
  }),
);
