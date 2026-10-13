/**
 * 试卷模块 —— 路由层（需 admin/author 权限）。
 */
import { Router } from 'express';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { validate } from '../../middleware/validate.js';
import { authRequired } from '../../middleware/auth.js';
import { requireRole } from '../../middleware/role.js';
import { ok } from '../../utils/response.js';
import { paperSchema, drawSchema } from './papers.schema.js';
import * as papersService from './papers.service.js';
import type { DrawInput, PaperInput } from './papers.schema.js';

export const papersRouter = Router();

papersRouter.use(authRequired, requireRole('admin', 'author'));

/** GET /api/papers —— 试卷列表（含来源题库；author 仅返回与授权题库有交集的试卷）。 */
papersRouter.get(
  '/',
  asyncHandler(async (req, res) => ok(res, await papersService.list(req.user!))),
);

/** POST /api/papers/draw-questions —— 按题型随机抽题（须在 /:id 之前注册）。 */
papersRouter.post(
  '/draw-questions',
  validate(drawSchema, 'body'),
  asyncHandler(async (req, res) => {
    const body = req.body as DrawInput;
    return ok(res, await papersService.drawQuestions(body, req.user!));
  }),
);

/** POST /api/papers —— 新建试卷。 */
papersRouter.post(
  '/',
  validate(paperSchema, 'body'),
  asyncHandler(async (req, res) => {
    const body = req.body as PaperInput;
    return ok(res, await papersService.create(body, req.user!));
  }),
);

/** GET /api/papers/:id/export-pdf?withAnswer=1 —— 导出试卷 PDF（考生版/答案版）。 */
papersRouter.get(
  '/:id/export-pdf',
  asyncHandler(async (req, res) => {
    const withAnswer = req.query.withAnswer === '1' || req.query.withAnswer === 'true';
    const { buffer, filename } = await papersService.exportPaperPdf(req.params.id, withAnswer, req.user!);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="paper-${Date.now()}.pdf"; filename*=UTF-8''${encodeURIComponent(filename)}`,
    );
    res.setHeader('Content-Length', String(buffer.length));
    res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition');
    res.send(buffer);
  }),
);

/** GET /api/papers/:id —— 试卷详情（题目 + 来源题库 + 逐题来源）。 */
papersRouter.get(
  '/:id',
  asyncHandler(async (req, res) => ok(res, await papersService.getById(req.params.id, req.user!))),
);

/** PUT /api/papers/:id —— 编辑试卷。 */
papersRouter.put(
  '/:id',
  validate(paperSchema, 'body'),
  asyncHandler(async (req, res) => {
    const body = req.body as PaperInput;
    return ok(res, await papersService.update(req.params.id, body, req.user!));
  }),
);

/** DELETE /api/papers/:id —— 删除试卷（被考试引用 → 1005）。 */
papersRouter.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    await papersService.remove(req.params.id);
    return ok(res, null);
  }),
);
