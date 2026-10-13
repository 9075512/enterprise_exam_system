/**
 * 站内信 —— 路由层（均需登录，操作仅限本人数据）。
 */
import { Router } from 'express';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { authRequired } from '../../middleware/auth.js';
import { ok } from '../../utils/response.js';
import * as notificationsService from './notifications.service.js';

export const notificationsRouter = Router();
notificationsRouter.use(authRequired);

/** GET /api/notifications?page=&pageSize= —— 站内信列表。 */
notificationsRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const { page, pageSize } = req.query as unknown as { page?: number; pageSize?: number };
    return ok(res, await notificationsService.list(req.user!.id, page, pageSize));
  }),
);

/** GET /api/notifications/unread-count —— 未读数。 */
notificationsRouter.get(
  '/unread-count',
  asyncHandler(async (req, res) => {
    return ok(res, await notificationsService.unreadCount(req.user!.id));
  }),
);

/** PUT /api/notifications/read-all —— 全部标记已读。 */
notificationsRouter.put(
  '/read-all',
  asyncHandler(async (req, res) => {
    await notificationsService.markAllRead(req.user!.id);
    return ok(res, null);
  }),
);

/** PUT /api/notifications/:id/read —— 标记单条已读。 */
notificationsRouter.put(
  '/:id/read',
  asyncHandler(async (req, res) => {
    await notificationsService.markRead(req.params.id, req.user!.id);
    return ok(res, null);
  }),
);
