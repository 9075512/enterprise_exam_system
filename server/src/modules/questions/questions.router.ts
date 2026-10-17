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
import {
  questionSchema,
  questionListQuerySchema,
  subjectsQuerySchema,
  batchEditSchema,
  questionBatchSchema,
} from './questions.schema.js';
import * as questionsService from './questions.service.js';
import type { BatchEditInput } from './questions.service.js';
import type { QuestionType, QuestionDifficulty } from '../../types/domain.js';
import * as qualityService from './questionQuality.service.js';

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
      difficulty?: QuestionDifficulty;
      subject: string;
      subjectId?: string;
      status?: 'active' | 'disabled';
      tag: string;
      keyword: string;
      page: number;
      pageSize: number;
    };
    return ok(res, await questionsService.listGlobal(q, req.user!));
  }),
);

/** GET /api/questions/duplicates —— 重复题审计，不修改数据。 */
questionsRouter.get(
  '/duplicates',
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    const bankIds = typeof req.query.bankIds === 'string' ? req.query.bankIds.split(',').filter(Boolean) : undefined;
    return ok(res, await qualityService.duplicates({ bankIds, includeDisabled: req.query.includeDisabled === '1' }));
  }),
);

/** GET /api/questions/subjects —— 科目即题库名称（去重排序）。 */
questionsRouter.get(
  '/subjects',
  validate(subjectsQuerySchema, 'query'),
  asyncHandler(async (req, res) => {
    const { bankIds } = req.query as unknown as { bankIds?: string[] };
    return ok(res, await questionsService.listSubjects(bankIds, req.user!));
  }),
);

/** GET /api/questions/tags —— 全部知识点标签（去重排序，v1.7②）。 */
questionsRouter.get(
  '/tags',
  validate(subjectsQuerySchema, 'query'),
  asyncHandler(async (req, res) => {
    const { bankIds } = req.query as unknown as { bankIds?: string[] };
    return ok(res, await questionsService.listTags(bankIds, req.user!));
  }),
);

/** POST /api/questions/batch-edit —— 批量编辑（知识点标签 / 默认分值 / 难度）。 */
questionsRouter.post(
  '/batch-edit',
  validate(batchEditSchema, 'body'),
  asyncHandler(async (req, res) => {
    const body = req.body as BatchEditInput;
    return ok(res, await questionsService.batchEdit(body, req.user!));
  }),
);

/** POST /api/questions/batch —— 批量启停、迁移、删除和完整性校验（事务）。 */
questionsRouter.post(
  '/batch',
  validate(questionBatchSchema, 'body'),
  asyncHandler(async (req, res) => ok(res, await qualityService.batch(req.body, req.user!))),
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
      subjectId?: string | null;
      status?: 'active' | 'disabled';
      tags: string[];
      rubric?: unknown;
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
      subjectId?: string | null;
      status?: 'active' | 'disabled';
      tags: string[];
      rubric?: unknown;
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
