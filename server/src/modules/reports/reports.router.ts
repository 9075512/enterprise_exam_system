/**
 * 报表模块 —— 路由层（需 admin 权限）。
 */
import { Router } from 'express';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { validate } from '../../middleware/validate.js';
import { authRequired } from '../../middleware/auth.js';
import { requireRole } from '../../middleware/role.js';
import { ok } from '../../utils/response.js';
import { reportExportQuerySchema } from './reports.schema.js';
import * as reportsService from './reports.service.js';

export const reportsRouter = Router();

reportsRouter.use(authRequired, requireRole('admin'));

/** GET /api/reports/dashboard —— 数据看板（及格率趋势 + 科目错题归因）。 */
reportsRouter.get(
  '/dashboard',
  asyncHandler(async (_req, res) => ok(res, await reportsService.getDashboard())),
);

/** GET /api/reports/exams/:id —— 报表聚合（summary + bands + departments + wrongRate）。 */
reportsRouter.get(
  '/exams/:id',
  asyncHandler(async (req, res) => ok(res, await reportsService.getReport(req.params.id))),
);

/** GET /api/reports/exams/:id/export —— 导出成绩明细 .xlsx（可勾选列）。 */
reportsRouter.get(
  '/exams/:id/export',
  validate(reportExportQuerySchema, 'query'),
  asyncHandler(async (req, res) => {
    const q = req.query as unknown as { columns?: string; tzOffset?: number };
    const { buffer, filename } = await reportsService.exportScores(req.params.id, q.columns, q.tzOffset);
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    // ASCII 兜底文件名 + RFC 5987 中文名（filename*），兼容各浏览器正确显示中文
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="scores-${Date.now()}.xlsx"; filename*=UTF-8''${encodeURIComponent(filename)}`,
    );
    res.setHeader('Content-Length', String(buffer.length));
    res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition');
    res.send(buffer);
  }),
);

/** GET /api/reports/exams/:id/export-pdf —— 导出成绩明细 .pdf（可勾选列，同一套白名单）。 */
reportsRouter.get(
  '/exams/:id/export-pdf',
  validate(reportExportQuerySchema, 'query'),
  asyncHandler(async (req, res) => {
    const q = req.query as unknown as { columns?: string; tzOffset?: number };
    const { buffer, filename } = await reportsService.exportScoresPdf(req.params.id, q.columns, q.tzOffset);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="scores-${Date.now()}.pdf"; filename*=UTF-8''${encodeURIComponent(filename)}`,
    );
    res.setHeader('Content-Length', String(buffer.length));
    res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition');
    res.send(buffer);
  }),
);
