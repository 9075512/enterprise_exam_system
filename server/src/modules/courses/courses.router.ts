import { Router } from 'express';
import { authRequired } from '../../middleware/auth.js';
import { requireRole } from '../../middleware/role.js';
import { validate } from '../../middleware/validate.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { forbidden } from '../../utils/errors.js';
import { ok } from '../../utils/response.js';
import { getMyMenus } from '../permissions/permissions.service.js';
import { courseBodySchema, courseCoverSchema, courseIdSchema, courseListSchema, courseRevisionSchema, courseStatusSchema, courseUpdateSchema, type CourseListQuery } from './courses.schema.js';
import { generateCourseCover, readCourseMedia, uploadCourseMedia } from './courses.media.js';
import * as service from './courses.service.js';

export const coursesRouter = Router();
// <video>/<img> 读取使用不可伪造的资源签名，不依赖不能附带 Bearer 的标签请求。
coursesRouter.get('/media/:id', validate(courseIdSchema, 'params'), asyncHandler(readCourseMedia));
coursesRouter.use(authRequired);
function menu(key: string) { return asyncHandler(async (req, _res, next) => {
  if (!(await getMyMenus(req.user!.role, req.user!.id)).menus.includes(key)) throw forbidden('当前账号没有课程功能权限');
  next();
}); }
const manage = Router();
manage.use(requireRole('admin'), menu('course-manage'));
manage.get('/', validate(courseListSchema, 'query'), asyncHandler(async (req, res) => ok(res, await service.list(req.query as unknown as CourseListQuery))));
manage.post('/media', uploadCourseMedia);
manage.post('/cover', validate(courseCoverSchema), asyncHandler(async (req, res) => ok(res, await generateCourseCover(req.body, req.user!.id))));
manage.post('/', validate(courseBodySchema), asyncHandler(async (req, res) => ok(res, await service.create(req.body, req.user!.id))));
manage.get('/:id', validate(courseIdSchema, 'params'), asyncHandler(async (req, res) => ok(res, await service.find(req.params.id, true))));
manage.put('/:id', validate(courseIdSchema, 'params'), validate(courseUpdateSchema), asyncHandler(async (req, res) => ok(res, await service.update(req.params.id, req.body.revision, req.body.course, req.user!.id))));
manage.put('/:id/status', validate(courseIdSchema, 'params'), validate(courseStatusSchema), asyncHandler(async (req, res) => ok(res, await service.setStatus(req.params.id, req.body.revision, req.body.status, req.user!.id))));
manage.delete('/:id', validate(courseIdSchema, 'params'), validate(courseRevisionSchema, 'query'), asyncHandler(async (req, res) => { await service.remove(req.params.id, Number(req.query.revision), req.user!.id); return ok(res, null); }));
coursesRouter.use('/manage', manage);
coursesRouter.get('/', menu('courses'), asyncHandler(async (_req, res) => ok(res, await service.learnerList())));
coursesRouter.get('/:id', menu('courses'), validate(courseIdSchema, 'params'), asyncHandler(async (req, res) => ok(res, await service.find(req.params.id))));
