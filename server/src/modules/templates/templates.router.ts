import { Router } from 'express';
import { z } from 'zod';
import { authRequired } from '../../middleware/auth.js';
import { requireRole } from '../../middleware/role.js';
import { validate } from '../../middleware/validate.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { ok } from '../../utils/response.js';
import * as service from './templates.service.js';

const paperTemplateSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().max(255).optional().default(''),
  config: z.record(z.unknown()),
});
const audienceRulesSchema = z.object({
  departmentIds: z.array(z.string().min(1).max(64)).max(1000).default([]),
  roleIds: z.array(z.string().min(1).max(64)).max(1000).default([]),
  positionIds: z.array(z.string().min(1).max(64)).max(1000).default([]),
  includeUserIds: z.array(z.string().min(1).max(64)).max(5000).default([]),
  excludeUserIds: z.array(z.string().min(1).max(64)).max(5000).default([]),
  includeSubDepartments: z.boolean().default(false),
  randomCount: z.number().int().positive().max(100000).nullable().default(null),
});
const audienceTemplateSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().max(255).optional().default(''),
  rules: audienceRulesSchema.strict(),
});

export const paperTemplatesRouter = Router();
paperTemplatesRouter.use(authRequired, requireRole('admin', 'author'));
paperTemplatesRouter.get('/', asyncHandler(async (req, res) => ok(res, await service.listPaperTemplates(req.user!))));
paperTemplatesRouter.post('/', validate(paperTemplateSchema, 'body'), asyncHandler(async (req, res) => ok(res, await service.savePaperTemplate(null, req.body, req.user!))));
paperTemplatesRouter.put('/:id', validate(paperTemplateSchema, 'body'), asyncHandler(async (req, res) => ok(res, await service.savePaperTemplate(req.params.id, req.body, req.user!))));
paperTemplatesRouter.delete('/:id', asyncHandler(async (req, res) => { await service.removePaperTemplate(req.params.id, req.user!); return ok(res, null); }));

export const audienceTemplatesRouter = Router();
audienceTemplatesRouter.use(authRequired, requireRole('admin', 'author'));
audienceTemplatesRouter.get('/', asyncHandler(async (req, res) => ok(res, await service.listAudienceTemplates(req.user!))));
audienceTemplatesRouter.post('/', validate(audienceTemplateSchema, 'body'), asyncHandler(async (req, res) => ok(res, await service.saveAudienceTemplate(null, req.body, req.user!))));
audienceTemplatesRouter.put('/:id', validate(audienceTemplateSchema, 'body'), asyncHandler(async (req, res) => ok(res, await service.saveAudienceTemplate(req.params.id, req.body, req.user!))));
audienceTemplatesRouter.delete('/:id', asyncHandler(async (req, res) => { await service.removeAudienceTemplate(req.params.id, req.user!); return ok(res, null); }));
