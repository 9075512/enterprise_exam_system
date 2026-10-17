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
  bankAccessSchema,
} from './banks.schema.js';
import type { BankAuthorBatchInput, BankCloneInput, BankPracticeBatchInput } from './banks.schema.js';
import * as banksService from './banks.service.js';
import * as questionsService from '../questions/questions.service.js';
import { normalizePaging } from '../../utils/pagination.js';
import * as bankAccessService from './bankAccess.service.js';

export const banksRouter = Router();

banksRouter.use(authRequired, requireRole('admin', 'author'));

/** GET /api/banks —— 题库列表（含 questionCount；author 仅返回被授权题库）。 */
banksRouter.get(
  '/',
  validate(bankListQuerySchema, 'query'),
  asyncHandler(async (req, res) => {
    const { keyword } = req.query as unknown as { keyword: string };
    return ok(res, await banksService.list({ keyword }, req.user!));
  }),
);

/** GET /api/banks/tree —— 当前用户可见的科目题库树。 */
banksRouter.get('/tree', asyncHandler(async (req, res) => ok(res, await banksService.tree(req.user!))));
banksRouter.get('/migration-report', requireRole('admin'), asyncHandler(async (_req, res) => ok(res, await banksService.migrationReport())));

/** POST /api/banks —— 新建题库。 */
banksRouter.post(
  '/',
  requireRole('admin'),
  validate(bankSchema, 'body'),
  asyncHandler(async (req, res) => {
    const body = req.body as {
      name: string;
      description: string;
      parentId?: string | null;
      sortOrder: number;
      status: 'active' | 'disabled';
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
  requireRole('admin'),
  validate(bankSchema, 'body'),
  asyncHandler(async (req, res) => {
    const body = req.body as {
      name: string;
      description: string;
      parentId?: string | null;
      sortOrder: number;
      status: 'active' | 'disabled';
      allowPractice: boolean;
      authorIds?: string[];
    };
    return ok(res, await banksService.update(req.params.id, body, req.user!));
  }),
);

/** GET/PUT /api/banks/:id/access —— 科目权限配置（仅管理员维护）。 */
banksRouter.get(
  '/:id/access',
  requireRole('admin'),
  asyncHandler(async (req, res) => ok(res, await bankAccessService.getAccessConfig(req.params.id))),
);
banksRouter.put(
  '/:id/access',
  requireRole('admin'),
  validate(bankAccessSchema, 'body'),
  asyncHandler(async (req, res) => ok(res, await bankAccessService.setAccessConfig(req.params.id, req.body))),
);

/** DELETE /api/banks/:id?cascade=true —— 删除题库（有题须 cascade）。 */
banksRouter.delete(
  '/:id',
  requireRole('admin'),
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
      subjectId?: string;
      status?: 'active' | 'disabled';
      difficulty?: 'low' | 'medium' | 'high';
      tag: string;
      keyword: string;
      page: number;
      pageSize: number;
    };
    const paging = normalizePaging(q.page, q.pageSize);
    const result = await questionsService.listByBank(req.params.id, {
      type: q.type,
      subject: q.subject,
      subjectId: q.subjectId,
      status: q.status,
      difficulty: q.difficulty,
      tag: q.tag,
      keyword: q.keyword,
      page: paging.page,
      pageSize: paging.pageSize,
    }, req.user!);
    return ok(res, result);
  }),
);

/** GET /api/banks/:id/question-stats —— 题库题目健康度统计（v3.3，题型分布 / 平均正确率 / 待完善）。 */
banksRouter.get(
  '/:id/question-stats',
  asyncHandler(async (req, res) =>
    ok(res, await questionsService.bankQuestionStats(req.params.id, req.user!)),
  ),
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
