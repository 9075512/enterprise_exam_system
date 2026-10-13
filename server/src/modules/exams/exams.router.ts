/**
 * 考试模块 —— 路由层。
 * 权限：列表/新建/编辑/删除 = admin；我的考试/开考 = examinee；详情 = 登录。
 */
import { Router } from 'express';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { validate } from '../../middleware/validate.js';
import { authRequired } from '../../middleware/auth.js';
import { requireRole } from '../../middleware/role.js';
import { ok } from '../../utils/response.js';
import { examSchema } from './exams.schema.js';
import type { ExamInput } from './exams.schema.js';
import * as examsService from './exams.service.js';
import * as recordsService from '../records/records.service.js';

export const examsRouter = Router();

examsRouter.use(authRequired);

/** GET /api/exams/my —— 考生可见考试（科室隔离 + recordStatus）。 */
examsRouter.get(
  '/my',
  requireRole('examinee'),
  asyncHandler(async (req, res) => {
    const list = await examsService.listForExaminee(req.user!.id, req.user!.departmentId);
    return ok(res, list);
  }),
);

/** GET /api/exams —— 全部考试（admin）。 */
examsRouter.get(
  '/',
  requireRole('admin'),
  asyncHandler(async (_req, res) => ok(res, await examsService.list())),
);

/** POST /api/exams —— 新建考试（admin）。 */
examsRouter.post(
  '/',
  requireRole('admin'),
  validate(examSchema, 'body'),
  asyncHandler(async (req, res) => {
    const body = req.body as ExamInput;
    return ok(res, await examsService.create(body, req.user!.id));
  }),
);

/** GET /api/exams/:id —— 考试详情（登录）。 */
examsRouter.get(
  '/:id',
  asyncHandler(async (req, res) => ok(res, await examsService.getById(req.params.id))),
);

/** PUT /api/exams/:id —— 编辑考试（admin）。 */
examsRouter.put(
  '/:id',
  requireRole('admin'),
  validate(examSchema, 'body'),
  asyncHandler(async (req, res) => {
    const body = req.body as ExamInput;
    return ok(res, await examsService.update(req.params.id, body, req.user!.id));
  }),
);

/** DELETE /api/exams/:id —— 删除考试（admin，有记录 → 1005）。 */
examsRouter.delete(
  '/:id',
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    await examsService.remove(req.params.id, req.user!.id);
    return ok(res, null);
  }),
);

/** POST /api/exams/:id/start —— 开考（examinee，快照 + 幂等续考）。 */
examsRouter.post(
  '/:id/start',
  requireRole('examinee'),
  asyncHandler(async (req, res) => {
    const record = await recordsService.startExam(req.params.id, {
      id: req.user!.id,
      departmentId: req.user!.departmentId,
    });
    return ok(res, record);
  }),
);
