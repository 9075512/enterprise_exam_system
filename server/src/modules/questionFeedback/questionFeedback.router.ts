import { Router } from 'express';
import { z } from 'zod';
import { authRequired } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { ok } from '../../utils/response.js';
import * as service from './questionFeedback.service.js';

const createSchema = z.object({
  questionId: z.string().min(1).max(64), source: z.enum(['exam', 'practice']), sourceRefId: z.string().max(64).nullable().optional(),
  category: z.string().trim().min(1).max(32), content: z.string().trim().min(1).max(1000),
});
const updateSchema = z.object({ status: z.enum(['pending', 'processing', 'resolved', 'closed']), reply: z.string().max(1000).optional() });

export const questionFeedbackRouter = Router();
questionFeedbackRouter.use(authRequired);
questionFeedbackRouter.get('/', asyncHandler(async (req, res) => ok(res, await service.list({
  status: typeof req.query.status === 'string' ? req.query.status as never : undefined,
  mine: req.query.mine === '1',
}, req.user!))));
questionFeedbackRouter.post('/', validate(createSchema, 'body'), asyncHandler(async (req, res) => ok(res, await service.create(req.body, req.user!.id))));
questionFeedbackRouter.put('/:id', validate(updateSchema, 'body'), asyncHandler(async (req, res) => ok(res, await service.update(req.params.id, req.body, req.user!))));
