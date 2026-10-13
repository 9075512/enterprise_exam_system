/**
 * 内容运营（公告 / 轮播图）—— 路由层（v1.9⑥）。
 *
 * 前缀：`/api/content`（**考试域**；PRACTICE_ONLY 公网实例不注册本 router）。
 * - 管理端 `/announcements`、`/banners`：需登录 + admin；
 * - 考生端 `GET /feed?scope=exam`：需登录（考生在「我的考试」等页面读取）；
 * - 练题端不经过本 router，展示接口挂在 `/api/practice/announcements`、`/api/practice/banners`
 *   （见 practice.router.ts），二者共用 content.service 的 `getFeed('practice')`。
 */
import { Router } from 'express';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { validate } from '../../middleware/validate.js';
import { authRequired } from '../../middleware/auth.js';
import { requireRole } from '../../middleware/role.js';
import { ok } from '../../utils/response.js';
import {
  announcementBodySchema,
  bannerBodySchema,
  contentFeedQuerySchema,
  contentIdParamsSchema,
  contentListQuerySchema,
} from './content.schema.js';
import * as service from './content.service.js';
import type { AnnouncementBodyInput, BannerBodyInput, ContentListQueryInput } from './content.schema.js';

export const contentRouter = Router();
contentRouter.use(authRequired);

/* ------------------------------ 考生端聚合 ------------------------------ */

/** GET /api/content/feed —— 考试端当前生效的公告 + 轮播图。 */
contentRouter.get(
  '/feed',
  validate(contentFeedQuerySchema, 'query'),
  asyncHandler(async (req, res) => {
    const { scope } = req.query as unknown as { scope: 'exam' | 'practice' };
    return ok(res, await service.getFeed(scope));
  }),
);

/* ------------------------------ 公告管理（admin） ------------------------------ */

/** GET /api/content/announcements —— 公告分页列表。 */
contentRouter.get(
  '/announcements',
  requireRole('admin'),
  validate(contentListQuerySchema, 'query'),
  asyncHandler(async (req, res) => {
    return ok(res, await service.listAnnouncements(req.query as unknown as ContentListQueryInput));
  }),
);

/** POST /api/content/announcements —— 新建公告。 */
contentRouter.post(
  '/announcements',
  requireRole('admin'),
  validate(announcementBodySchema, 'body'),
  asyncHandler(async (req, res) => {
    return ok(res, await service.createAnnouncement(req.user!.id, req.body as AnnouncementBodyInput));
  }),
);

/** PUT /api/content/announcements/:id —— 编辑公告。 */
contentRouter.put(
  '/announcements/:id',
  requireRole('admin'),
  validate(contentIdParamsSchema, 'params'),
  validate(announcementBodySchema, 'body'),
  asyncHandler(async (req, res) => {
    return ok(res, await service.updateAnnouncement(req.user!.id, req.params.id, req.body as AnnouncementBodyInput));
  }),
);

/** DELETE /api/content/announcements/:id —— 删除公告。 */
contentRouter.delete(
  '/announcements/:id',
  requireRole('admin'),
  validate(contentIdParamsSchema, 'params'),
  asyncHandler(async (req, res) => {
    await service.deleteAnnouncement(req.user!.id, req.params.id);
    return ok(res, null);
  }),
);

/* ------------------------------ 轮播图管理（admin） ------------------------------ */

/** GET /api/content/banners —— 轮播图分页列表。 */
contentRouter.get(
  '/banners',
  requireRole('admin'),
  validate(contentListQuerySchema, 'query'),
  asyncHandler(async (req, res) => {
    return ok(res, await service.listBanners(req.query as unknown as ContentListQueryInput));
  }),
);

/** POST /api/content/banners —— 新建轮播图。 */
contentRouter.post(
  '/banners',
  requireRole('admin'),
  validate(bannerBodySchema, 'body'),
  asyncHandler(async (req, res) => {
    return ok(res, await service.createBanner(req.user!.id, req.body as BannerBodyInput));
  }),
);

/** PUT /api/content/banners/:id —— 编辑轮播图。 */
contentRouter.put(
  '/banners/:id',
  requireRole('admin'),
  validate(contentIdParamsSchema, 'params'),
  validate(bannerBodySchema, 'body'),
  asyncHandler(async (req, res) => {
    return ok(res, await service.updateBanner(req.user!.id, req.params.id, req.body as BannerBodyInput));
  }),
);

/** DELETE /api/content/banners/:id —— 删除轮播图。 */
contentRouter.delete(
  '/banners/:id',
  requireRole('admin'),
  validate(contentIdParamsSchema, 'params'),
  asyncHandler(async (req, res) => {
    await service.deleteBanner(req.user!.id, req.params.id);
    return ok(res, null);
  }),
);
