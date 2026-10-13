/**
 * 试题模块 —— 路由层（需 admin/author 权限）。
 * 注意：Excel 导入相关路由挂载在 `/api/questions/import`（见 import 模块），本文件不含。
 */
import { Router } from 'express';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { validate } from '../../middleware/validate.js';
import { authRequired } from '../../middleware/auth.js';
import { requireRole } from '../../middleware/role.js';
import { ok } from '../../utils/response.js';
import { questionSchema, questionListQuerySchema, subjectsQuerySchema } from './questions.schema.js';
import * as questionsService from './questions.service.js';
import type { QuestionType } from '../../types/domain.js';

export const questionsRouter = Router();

questionsRouter.use(authRequired, requireRole('admin', 'author'));

/** GET /api/questions —— 全局试题池（组卷用，筛选 + 分页）。 */
questionsRouter.get(
  '/',
  validate(questionListQuerySchema, 'query'),
  asyncHandler(async (req, res) => {
    const q = req.query as unknown as {
      bankIds?: string[];
      type?: QuestionType;
      subject: string;
      keyword: string;
      page: number;
      pageSize: number;
    };
    return ok(res, await questionsService.listGlobal(q, req.user!));
  }),
);

/** GET /api/questions/subjects —— 全部科目（去重排序）。 */
questionsRouter.get(
  '/subjects',
  validate(subjectsQuerySchema, 'query'),
  asyncHandler(async (req, res) => {
    const { bankIds } = req.query as unknown as { bankIds?: string[] };
    return ok(res, await questionsService.listSubjects(bankIds, req.user!));
  }),
);

/** POST /api/questions —— 新增试题。 */
questionsRouter.post(
  '/',
  validate(questionSchema, 'body'),
  asyncHandler(async (req, res) => {
    const body = req.body as {
      bankId?: string;
      type: QuestionType;
      stem: string;
      options: string[];
      answer: number[];
      defaultScore: number;
      analysis: string;
      subject: string;
    };
    return ok(res, await questionsService.create(body, req.user!));
  }),
);

/** PUT /api/questions/:id —— 编辑试题。 */
questionsRouter.put(
  '/:id',
  validate(questionSchema, 'body'),
  asyncHandler(async (req, res) => {
    const body = req.body as {
      bankId?: string;
      type: QuestionType;
      stem: string;
      options: string[];
      answer: number[];
      defaultScore: number;
      analysis: string;
      subject: string;
    };
    return ok(res, await questionsService.update(req.params.id, body, req.user!));
  }),
);

/** DELETE /api/questions/:id —— 删除试题。 */
questionsRouter.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    await questionsService.remove(req.params.id, req.user!);
    return ok(res, null);
  }),
);
