/**
 * 内容运营（公告 / 轮播图）—— 路由层（v1.9⑥，v2.0③ 增触达）。
 *
 * 前缀：`/api/content`（**考试域**；PRACTICE_ONLY 公网实例不注册本 router）。
 * - 管理端 `/announcements`、`/banners`、`/stats`：需登录 + admin；
 * - 考生端 `GET /feed?scope=exam`、`POST /announcements/:id/read`、`POST /banners/:id/click`：需登录；
 * - 练题端展示与回执接口不经过本 router，挂在 `/api/practice/feed*`
 *   （见 practice.router.ts），与考试端**共用 content.service**。
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
  contentBatchSchema,
  contentFeedQuerySchema,
  contentIdParamsSchema,
  contentListQuerySchema,
} from './content.schema.js';
import * as service from './content.service.js';
import type { AnnouncementBodyInput, BannerBodyInput, ContentBatchInput, ContentListQueryInput } from './content.schema.js';

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

/**
 * POST /api/content/announcements/:id/read —— 考生侧记录公告已读（v2.0③）。
 * 幂等：同一用户同一端同一公告只记一条；公告不存在 → 404。
 */
contentRouter.post(
  '/announcements/:id/read',
  validate(contentIdParamsSchema, 'params'),
  asyncHandler(async (req, res) => {
    await service.markAnnouncementRead('exam', req.params.id, req.user!.id);
    return ok(res, null);
  }),
);

/** POST /api/content/banners/:id/click —— 考生侧记录轮播点击（v2.0③，幂等）。 */
contentRouter.post(
  '/banners/:id/click',
  validate(contentIdParamsSchema, 'params'),
  asyncHandler(async (req, res) => {
    await service.markBannerClick('exam', req.params.id, req.user!.id);
    return ok(res, null);
  }),
);

/* ------------------------------ 触达看板（admin，v2.0③） ------------------------------ */

/** GET /api/content/stats —— 内容触达看板（受众规模 + 阅读数/率、点击数/率）。 */
contentRouter.get(
  '/stats',
  requireRole('admin'),
  asyncHandler(async (_req, res) => ok(res, await service.getTouchStats())),
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

/**
 * POST /api/content/announcements/batch —— 批量上线 / 下线 / 删除（v2.0④）。
 * 必须注册在 `/:id` 之前语义上无冲突，但为可读性置于新增接口首位。
 */
contentRouter.post(
  '/announcements/batch',
  requireRole('admin'),
  validate(contentBatchSchema, 'body'),
  asyncHandler(async (req, res) => {
    return ok(res, await service.batchAnnouncements(req.user!.id, req.body as ContentBatchInput));
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

/** POST /api/content/banners/batch —— 批量上线 / 下线 / 删除（v2.0④）。 */
contentRouter.post(
  '/banners/batch',
  requireRole('admin'),
  validate(contentBatchSchema, 'body'),
  asyncHandler(async (req, res) => {
    return ok(res, await service.batchBanners(req.user!.id, req.body as ContentBatchInput));
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
