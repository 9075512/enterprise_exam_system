/**
 * 题库模块 —— 路由层（需 admin/author 权限）。
 */
import { Router } from 'express';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { validate } from '../../middleware/validate.js';
import { authRequired } from '../../middleware/auth.js';
import { requireRole } from '../../middleware/role.js';
import { ok } from '../../utils/response.js';
import { bankSchema, bankListQuerySchema, bankQuestionsQuerySchema, migrateQuestionsSchema } from './banks.schema.js';
import * as banksService from './banks.service.js';
import * as questionsService from '../questions/questions.service.js';
import { normalizePaging } from '../../utils/pagination.js';

export const banksRouter = Router();

banksRouter.use(authRequired, requireRole('admin', 'author'));

/** GET /api/banks —— 题库列表（含 questionCount）。 */
banksRouter.get(
  '/',
  validate(bankListQuerySchema, 'query'),
  asyncHandler(async (req, res) => {
    const { category, keyword } = req.query as unknown as { category: string; keyword: string };
    return ok(res, await banksService.list({ category, keyword }));
  }),
);

/** POST /api/banks —— 新建题库。 */
banksRouter.post(
  '/',
  validate(bankSchema, 'body'),
  asyncHandler(async (req, res) => {
    const body = req.body as { name: string; description: string; category: string; allowPractice: boolean };
    return ok(res, await banksService.create(body, req.user!.id));
  }),
);

/** GET /api/banks/:id —— 题库详情（含被引用试卷数）。 */
banksRouter.get(
  '/:id',
  asyncHandler(async (req, res) => ok(res, await banksService.getById(req.params.id))),
);

/** PUT /api/banks/:id —— 编辑题库。 */
banksRouter.put(
  '/:id',
  validate(bankSchema, 'body'),
  asyncHandler(async (req, res) => {
    const body = req.body as { name: string; description: string; category: string; allowPractice: boolean };
    return ok(res, await banksService.update(req.params.id, body));
  }),
);

/** DELETE /api/banks/:id?cascade=true —— 删除题库（有题须 cascade）。 */
banksRouter.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const cascade = String(req.query.cascade ?? '') === 'true';
    await banksService.remove(req.params.id, cascade);
    return ok(res, null);
  }),
);

/** GET /api/banks/:id/questions —— 题库内试题（筛选 + 分页）。 */
banksRouter.get(
  '/:id/questions',
  validate(bankQuestionsQuerySchema, 'query'),
  asyncHandler(async (req, res) => {
    const q = req.query as unknown as {
      type?: 'single' | 'multiple' | 'judge';
      subject: string;
      keyword: string;
      page: number;
      pageSize: number;
    };
    const paging = normalizePaging(q.page, q.pageSize);
    const result = await questionsService.listByBank(req.params.id, {
      type: q.type,
      subject: q.subject,
      keyword: q.keyword,
      page: paging.page,
      pageSize: paging.pageSize,
    });
    return ok(res, result);
  }),
);

/** POST /api/banks/:id/questions/migrate —— 迁移试题到其他题库。 */
banksRouter.post(
  '/:id/questions/migrate',
  validate(migrateQuestionsSchema, 'body'),
  asyncHandler(async (req, res) => {
    const body = req.body as { targetBankId: string; questionIds: string[] };
    return ok(res, await banksService.migrateQuestions(req.params.id, body));
  }),
);
