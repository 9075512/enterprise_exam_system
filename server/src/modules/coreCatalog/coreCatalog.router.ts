import { Router } from 'express';
import { z } from 'zod';
import { authRequired } from '../../middleware/auth.js';
import { requireRole } from '../../middleware/role.js';
import { validate } from '../../middleware/validate.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { ok } from '../../utils/response.js';
import * as service from './coreCatalog.service.js';
import * as banksService from '../banks/banks.service.js';
import { conflict } from '../../utils/errors.js';

const namedSchema = z.object({ name: z.string().trim().min(1).max(120), description: z.string().max(255).optional().default('') });
const subjectSchema = z.object({ name: z.string().trim().min(1).max(120), parentId: z.string().max(64).nullable().optional(), sortOrder: z.number().int().min(0).max(9999).optional(), status: z.enum(['active', 'disabled']).optional() });
const groupSchema = namedSchema.extend({
  role: z.enum(['admin', 'author', 'examinee'], { errorMap: () => ({ message: '用户组角色不合法' }) }),
  userIds: z.array(z.string().min(1).max(64)).max(5000).optional().default([]),
});
const grantsSchema = z.object({ grants: z.array(z.object({ principalType: z.enum(['role', 'group', 'position', 'user']), principalId: z.string().min(1).max(64), effect: z.enum(['allow', 'deny']), canView: z.boolean(), canEdit: z.boolean() })).max(1000) });
const overridesSchema = z.object({ overrides: z.array(z.object({ menuKey: z.string().min(1).max(64), effect: z.enum(['allow', 'deny']) })).max(200) });

export const subjectsRouter = Router();
subjectsRouter.use(authRequired);
subjectsRouter.get('/', requireRole('admin', 'author'), asyncHandler(async (req, res) => {
  const roots = await banksService.tree(req.user!);
  const flat: Array<{ id: string; name: string; parentId: string | null; sortOrder: number; status: string; createdAt: string; updatedAt: string }> = [];
  const visit = (nodes: typeof roots) => nodes.forEach((node) => {
    flat.push({ id: node.id, name: node.name, parentId: node.parentId, sortOrder: node.sortOrder, status: node.status, createdAt: node.createdAt, updatedAt: node.createdAt });
    visit(node.children);
  });
  visit(roots);
  return ok(res, flat);
}));
const subjectWriteRetired = () => { throw conflict('独立科目管理已停用，请前往“题库管理”的科目树维护'); };
subjectsRouter.post('/', requireRole('admin'), validate(subjectSchema, 'body'), asyncHandler(async () => subjectWriteRetired()));
subjectsRouter.put('/:id', requireRole('admin'), validate(subjectSchema, 'body'), asyncHandler(async () => subjectWriteRetired()));
subjectsRouter.delete('/:id', requireRole('admin'), asyncHandler(async () => subjectWriteRetired()));

export const positionsRouter = Router();
positionsRouter.use(authRequired, requireRole('admin'));
positionsRouter.get('/', asyncHandler(async (_req, res) => ok(res, await service.listPositions())));
positionsRouter.post('/', validate(namedSchema, 'body'), asyncHandler(async (req, res) => ok(res, await service.savePosition(null, req.body))));
positionsRouter.put('/:id', validate(namedSchema, 'body'), asyncHandler(async (req, res) => ok(res, await service.savePosition(req.params.id, req.body))));
positionsRouter.delete('/:id', asyncHandler(async (req, res) => { await service.removePosition(req.params.id); return ok(res, null); }));

export const userGroupsRouter = Router();
userGroupsRouter.use(authRequired, requireRole('admin'));
userGroupsRouter.get('/', asyncHandler(async (_req, res) => ok(res, await service.listGroups())));
userGroupsRouter.post('/', validate(groupSchema, 'body'), asyncHandler(async (req, res) => ok(res, await service.saveGroup(null, req.body))));
userGroupsRouter.put('/:id', validate(groupSchema, 'body'), asyncHandler(async (req, res) => ok(res, await service.saveGroup(req.params.id, req.body))));
userGroupsRouter.delete('/:id', asyncHandler(async (req, res) => { await service.removeGroup(req.params.id); return ok(res, null); }));

export const subjectGrantsRouter = Router();
subjectGrantsRouter.use(authRequired, requireRole('admin'));
subjectGrantsRouter.get('/', asyncHandler(async (_req, res) => ok(res, await service.listSubjectGrants())));
subjectGrantsRouter.put('/:subjectId', validate(grantsSchema, 'body'), asyncHandler(async () => subjectWriteRetired()));

export const menuOverridesRouter = Router();
menuOverridesRouter.use(authRequired, requireRole('admin'));
menuOverridesRouter.get('/', asyncHandler(async (req, res) => ok(res, await service.listMenuOverrides(typeof req.query.userId === 'string' ? req.query.userId : undefined))));
menuOverridesRouter.put('/:userId', validate(overridesSchema, 'body'), asyncHandler(async (req, res) => ok(res, await service.replaceMenuOverrides(req.params.userId, req.body.overrides))));
