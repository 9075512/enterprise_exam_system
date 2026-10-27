import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { authRequired } from '../../middleware/auth.js';
import { requireRole } from '../../middleware/role.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { fileInvalid } from '../../utils/errors.js';
import { ok } from '../../utils/response.js';
import * as service from './captures.service.js';
import { captureIdSchema, deleteCapturesSchema } from './captures.schema.js';

export const captureUpload = asyncHandler(async (req, res, next) => {
  if (!req.is('multipart/form-data')) return next();
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: service.MAX_CAPTURE_BYTES, files: 1, fields: 4, fieldSize: 1024 } }).single('file');
  await new Promise<void>((resolve, reject) => upload(req, res, error => error ? reject(fileInvalid('抓拍仅支持单张不超过 2MB 的 JPEG 图片')) : resolve()));
  next();
});
const pagingSchema = z.object({ page: z.coerce.number().int().min(1).default(1), pageSize: z.coerce.number().int().min(1).max(50).default(20) });
export const capturesRouter = Router({ mergeParams: true });
capturesRouter.use(authRequired);
capturesRouter.post('/', requireRole('examinee'), captureUpload, asyncHandler(async (req, res) => ok(res, await service.upload(req.params.recordId, req.user!.id, req.body, req.file))));
capturesRouter.post('/events', requireRole('examinee'), asyncHandler(async (req, res) => {
  await service.addEvent(req.params.recordId, req.user!.id, req.body);
  return ok(res, null);
}));
capturesRouter.get('/', requireRole('admin'), asyncHandler(async (req, res) => {
  const paging = pagingSchema.parse(req.query);
  return ok(res, await service.list(req.params.recordId, paging.page, paging.pageSize));
}));
capturesRouter.delete('/:captureId', requireRole('admin'), asyncHandler(async (req, res) => {
  return ok(res, await service.remove(req.params.recordId, [captureIdSchema.parse(req.params.captureId)], req.user!.id));
}));
capturesRouter.post('/batch-delete', requireRole('admin'), asyncHandler(async (req, res) => {
  const { captureIds } = deleteCapturesSchema.parse(req.body);
  return ok(res, await service.remove(req.params.recordId, captureIds, req.user!.id));
}));
capturesRouter.get('/:captureId/image', requireRole('admin'), asyncHandler(async (req, res) => {
  const buffer = await service.readImage(req.params.recordId, req.params.captureId);
  res.set({ 'Content-Type': 'image/jpeg', 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' });
  return res.send(buffer);
}));
