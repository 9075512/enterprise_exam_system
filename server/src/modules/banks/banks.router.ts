/**
 * 题库模块 —— 路由层（需 admin/author 权限）。
 */
import { Router } from 'express';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { validate } from '../../middleware/validate.js';
import { authRequired } from '../../middleware/auth.js';
import { requireRole } from '../../middleware/role.js';
import { ok } from '../../utils/response.js';
import {
  bankSchema,
  bankListQuerySchema,
  bankQuestionsQuerySchema,
  migrateQuestionsSchema,
  bankAuthorsBatchSchema,
  bankCloneSchema,
  bankPracticeBatchSchema,
} from './banks.schema.js';
import type { BankAuthorBatchInput, BankCloneInput, BankPracticeBatchInput } from './banks.schema.js';
import * as banksService from './banks.service.js';
import * as questionsService from '../questions/questions.service.js';
import { normalizePaging } from '../../utils/pagination.js';

export const banksRouter = Router();

banksRouter.use(authRequired, requireRole('admin', 'author'));

/** GET /api/banks —— 题库列表（含 questionCount；author 仅返回被授权题库）。 */
banksRouter.get(
  '/',
  validate(bankListQuerySchema, 'query'),
  asyncHandler(async (req, res) => {
    const { category, keyword } = req.query as unknown as { category: string; keyword: string };
    return ok(res, await banksService.list({ category, keyword }, req.user!));
  }),
);

/** POST /api/banks —— 新建题库。 */
banksRouter.post(
  '/',
  validate(bankSchema, 'body'),
  asyncHandler(async (req, res) => {
    const body = req.body as {
      name: string;
      description: string;
      category: string;
      allowPractice: boolean;
      authorIds?: string[];
    };
    return ok(res, await banksService.create(body, req.user!));
  }),
);

/** GET /api/banks/:id —— 题库详情（含被引用试卷数；author 需授权）。 */
banksRouter.get(
  '/:id',
  asyncHandler(async (req, res) => ok(res, await banksService.getById(req.params.id, req.user!))),
);

/** PUT /api/banks/:id —— 编辑题库。 */
banksRouter.put(
  '/:id',
  validate(bankSchema, 'body'),
  asyncHandler(async (req, res) => {
    const body = req.body as {
      name: string;
      description: string;
      category: string;
      allowPractice: boolean;
      authorIds?: string[];
    };
    return ok(res, await banksService.update(req.params.id, body, req.user!));
  }),
);

/** DELETE /api/banks/:id?cascade=true —— 删除题库（有题须 cascade）。 */
banksRouter.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const cascade = String(req.query.cascade ?? '') === 'true';
    await banksService.remove(req.params.id, cascade, req.user!);
    return ok(res, null);
  }),
);

/** GET /api/banks/:id/questions —— 题库内试题（筛选 + 分页）。 */
banksRouter.get(
  '/:id/questions',
  validate(bankQuestionsQuerySchema, 'query'),
  asyncHandler(async (req, res) => {
    const q = req.query as unknown as {
      type?: 'single' | 'multiple' | 'judge' | 'fill' | 'short';
      subject: string;
      tag: string;
      keyword: string;
      page: number;
      pageSize: number;
    };
    const paging = normalizePaging(q.page, q.pageSize);
    const result = await questionsService.listByBank(req.params.id, {
      type: q.type,
      subject: q.subject,
      tag: q.tag,
      keyword: q.keyword,
      page: paging.page,
      pageSize: paging.pageSize,
    }, req.user!);
    return ok(res, result);
  }),
);

/** POST /api/banks/practice/batch —— 批量设置「对外开放练题」开关（v1.8+，仅 admin）。 */
banksRouter.post(
  '/practice/batch',
  requireRole('admin'),
  validate(bankPracticeBatchSchema, 'body'),
  asyncHandler(async (req, res) => {
    const body = req.body as BankPracticeBatchInput;
    return ok(res, await banksService.setPracticeFlagBatch(body, req.user!));
  }),
);

/** POST /api/banks/:id/questions/migrate —— 迁移试题到其他题库。 */
banksRouter.post(
  '/:id/questions/migrate',
  validate(migrateQuestionsSchema, 'body'),
  asyncHandler(async (req, res) => {
    const body = req.body as { targetBankId: string; questionIds: string[] };
    return ok(res, await banksService.migrateQuestions(req.params.id, body, req.user!));
  }),
);

/** POST /api/banks/:id/clone —— 复制题库（v1.7④ S4；admin/author 均可）。 */
banksRouter.post(
  '/:id/clone',
  validate(bankCloneSchema, 'body'),
  asyncHandler(async (req, res) => {
    const body = req.body as BankCloneInput;
    return ok(res, await banksService.cloneBank(req.params.id, body, req.user!));
  }),
);

/** POST /api/banks/:id/authors/grant —— 批量授权出题人（v1.7③ S2，仅 admin）。 */
banksRouter.post(
  '/:id/authors/grant',
  requireRole('admin'),
  validate(bankAuthorsBatchSchema, 'body'),
  asyncHandler(async (req, res) => {
    const body = req.body as BankAuthorBatchInput;
    return ok(res, await banksService.batchGrantAuthors(req.params.id, body, req.user!));
  }),
);

/** POST /api/banks/:id/authors/revoke —— 批量取消出题人授权（v1.7③ S2，仅 admin）。 */
banksRouter.post(
  '/:id/authors/revoke',
  requireRole('admin'),
  validate(bankAuthorsBatchSchema, 'body'),
  asyncHandler(async (req, res) => {
    const body = req.body as BankAuthorBatchInput;
    return ok(res, await banksService.batchRevokeAuthors(req.params.id, body, req.user!));
  }),
);
