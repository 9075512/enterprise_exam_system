import { Router } from 'express';
import { z } from 'zod';
import { authRequired } from '../../middleware/auth.js';
import { requireRole } from '../../middleware/role.js';
import { validate } from '../../middleware/validate.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { ok } from '../../utils/response.js';
import * as service from './roles.service.js';

const roleSchema = z.object({
  name: z.string().trim().min(1, '请输入角色名称').max(120),
  baseRole: z.enum(['admin', 'author', 'examinee']),
  description: z.string().trim().max(255).default(''),
  menuKeys: z.array(z.string()).optional(),
});
export const rolesRouter = Router();
rolesRouter.use(authRequired);
rolesRouter.get('/', asyncHandler(async (_req, res) => ok(res, await service.list())));
rolesRouter.use(requireRole('admin'));
rolesRouter.post('/', validate(roleSchema, 'body'), asyncHandler(async (req, res) => ok(res, await service.save(null, req.body, req.user!.id))));
rolesRouter.put('/:id', validate(roleSchema, 'body'), asyncHandler(async (req, res) => ok(res, await service.save(req.params.id, req.body, req.user!.id))));
rolesRouter.delete('/:id', asyncHandler(async (req, res) => { await service.remove(req.params.id, req.user!.id); return ok(res, null); }));
rolesRouter.get('/:id/members', asyncHandler(async (req, res) => ok(res, await service.members(req.params.id))));
rolesRouter.put('/:id/members', validate(z.object({ userIds: z.array(z.string().min(1).max(64)).max(100000) }), 'body'),
  asyncHandler(async (req, res) => ok(res, await service.replaceMembers(req.params.id, req.body.userIds, req.user!.id))));
