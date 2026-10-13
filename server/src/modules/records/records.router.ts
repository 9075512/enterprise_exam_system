/**
 * 考试记录模块 —— 路由层。
 * 权限：考生端（my/answers/cheat-events/submit）需 examinee；详情 examinee|admin；考试全量记录需 admin。
 */
import { Router } from 'express';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { validate } from '../../middleware/validate.js';
import { authRequired } from '../../middleware/auth.js';
import { requireRole } from '../../middleware/role.js';
import { ok } from '../../utils/response.js';
import {
  saveAnswersSchema,
  cheatEventSchema,
  submitSchema,
  reviewSchema,
  myRecordsQuerySchema,
  examRecordsQuerySchema,
  cheatQuerySchema,
  pendingQuerySchema,
} from './records.schema.js';
import * as recordsService from './records.service.js';

export const recordsRouter = Router();

recordsRouter.use(authRequired);

/** GET /api/records/my —— 我的成绩（仅已交卷，分页；可选按考试名称关键字筛选）。 */
recordsRouter.get(
  '/my',
  requireRole('examinee'),
  validate(myRecordsQuerySchema, 'query'),
  asyncHandler(async (req, res) => {
    const q = req.query as unknown as { page: number; pageSize: number; keyword?: string };
    return ok(res, await recordsService.listMy(req.user!.id, q.page, q.pageSize, q.keyword));
  }),
);

/** GET /api/records/cheat?examId= —— 某场考试切屏异常记录（admin，切屏审查）。 */
recordsRouter.get(
  '/cheat',
  requireRole('admin'),
  validate(cheatQuerySchema, 'query'),
  asyncHandler(async (req, res) => {
    const q = req.query as unknown as { examId: string };
    return ok(res, await recordsService.listCheatByExam(q.examId));
  }),
);

/** GET /api/records/pending —— 待阅卷列表（admin/author，分页；可选按考试过滤）。 */
recordsRouter.get(
  '/pending',
  requireRole('admin', 'author'),
  validate(pendingQuerySchema, 'query'),
  asyncHandler(async (req, res) => {
    const q = req.query as unknown as { page: number; pageSize: number; examId?: string };
    return ok(res, await recordsService.listPending(q.page, q.pageSize, q.examId));
  }),
);

/** GET /api/records/:id —— 记录详情（考生仅本人，admin 任意）。 */
recordsRouter.get(
  '/:id',
  requireRole('examinee', 'admin'),
  asyncHandler(async (req, res) =>
    ok(res, await recordsService.getById(req.params.id, { id: req.user!.id, role: req.user!.role })),
  ),
);

/** GET /api/records?examId= —— 某场考试全部记录（admin，分页）。 */
recordsRouter.get(
  '/',
  requireRole('admin'),
  validate(examRecordsQuerySchema, 'query'),
  asyncHandler(async (req, res) => {
    const q = req.query as unknown as { examId: string; page: number; pageSize: number };
    return ok(res, await recordsService.listByExam(q.examId, q.page, q.pageSize));
  }),
);

/** PUT /api/records/:id/answers —— 暂存答案。 */
recordsRouter.put(
  '/:id/answers',
  requireRole('examinee'),
  validate(saveAnswersSchema, 'body'),
  asyncHandler(async (req, res) => {
    const { answers } = req.body as { answers: Record<string, number[] | string[]> };
    await recordsService.saveAnswers(req.params.id, req.user!.id, answers);
    return ok(res, null);
  }),
);

/** POST /api/records/:id/cheat-events —— 上报切屏事件。 */
recordsRouter.post(
  '/:id/cheat-events',
  requireRole('examinee'),
  validate(cheatEventSchema, 'body'),
  asyncHandler(async (req, res) => {
    const { awaySeconds } = req.body as { awaySeconds: number };
    await recordsService.addCheatEvent(req.params.id, req.user!.id, awaySeconds);
    return ok(res, null);
  }),
);

/** POST /api/records/:id/submit —— 交卷判分（幂等）。 */
recordsRouter.post(
  '/:id/submit',
  requireRole('examinee'),
  validate(submitSchema, 'body'),
  asyncHandler(async (req, res) => {
    const { auto } = req.body as { auto: boolean };
    return ok(res, await recordsService.submit(req.params.id, req.user!.id, auto));
  }),
);

/** PUT /api/records/:id/review —— 人工阅卷（admin/author）。 */
recordsRouter.put(
  '/:id/review',
  requireRole('admin', 'author'),
  validate(reviewSchema, 'body'),
  asyncHandler(async (req, res) => {
    const { subjectiveScores } = req.body as { subjectiveScores: Record<string, number> };
    return ok(res, await recordsService.review(req.params.id, subjectiveScores));
  }),
);
