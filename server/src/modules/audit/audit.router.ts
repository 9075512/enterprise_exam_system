/**
 * 操作审计日志 —— 路由层（仅 admin 可查 / 导出 / 清理）。
 */
import { Router } from 'express';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { validate } from '../../middleware/validate.js';
import { authRequired } from '../../middleware/auth.js';
import { requireRole } from '../../middleware/role.js';
import { ok } from '../../utils/response.js';
import { normalizePaging } from '../../utils/pagination.js';
import {
  auditListQuerySchema,
  auditExportQuerySchema,
  auditCleanupSchema,
} from './audit.schema.js';
import * as auditService from './audit.service.js';

export const auditRouter = Router();

auditRouter.use(authRequired, requireRole('admin'));

/** GET /api/audit-logs —— 审计日志列表（过滤 + 分页）。 */
auditRouter.get(
  '/',
  validate(auditListQuerySchema, 'query'),
  asyncHandler(async (req, res) => {
    const q = req.query as unknown as {
      action?: string;
      targetType?: string;
      keyword?: string;
      from?: string;
      to?: string;
      page: number;
      pageSize: number;
    };
    const paging = normalizePaging(q.page, q.pageSize);
    const result = await auditService.list(
      { action: q.action, targetType: q.targetType, keyword: q.keyword, from: q.from, to: q.to },
      paging.page,
      paging.pageSize,
    );
    return ok(res, result);
  }),
);

/** GET /api/audit-logs/export —— 导出审计日志（.xlsx / .csv，过滤条件与列表一致，v1.7②）。 */
auditRouter.get(
  '/export',
  validate(auditExportQuerySchema, 'query'),
  asyncHandler(async (req, res) => {
    const q = req.query as unknown as {
      format: 'xlsx' | 'csv';
      columns?: string;
      tzOffset?: number;
      action?: string;
      targetType?: string;
      keyword?: string;
      from?: string;
      to?: string;
    };
    const filter = {
      action: q.action,
      targetType: q.targetType,
      keyword: q.keyword,
      from: q.from,
      to: q.to,
    };
    const { buffer, filename, rowCount } = await auditService.exportLogs(
      filter,
      q.format,
      q.columns,
      q.tzOffset,
    );

    // 导出行为留痕（含条数与过滤条件摘要）
    await auditService.record({
      actorId: req.user!.id,
      action: 'audit.export',
      targetType: 'audit',
      targetId: 'audit_logs',
      targetName: '审计日志',
      detail: { format: q.format, rowCount, ...filter },
    });

    if (q.format === 'csv') {
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="audit-${Date.now()}.csv"; filename*=UTF-8''${encodeURIComponent(filename)}`,
      );
    } else {
      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      );
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="audit-${Date.now()}.xlsx"; filename*=UTF-8''${encodeURIComponent(filename)}`,
      );
    }
    res.setHeader('Content-Length', String(buffer.length));
    res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition');
    res.send(buffer);
  }),
);

/** GET /api/audit-logs/retention —— 当前生效的审计日志保留天数（0 = 永久保留）。 */
auditRouter.get(
  '/retention',
  asyncHandler(async (_req, res) => ok(res, { retentionDays: await auditService.getRetentionDays() })),
);

/** POST /api/audit-logs/cleanup —— 按保留策略清理过期审计日志（清理动作自身留痕）。 */
auditRouter.post(
  '/cleanup',
  validate(auditCleanupSchema, 'body'),
  asyncHandler(async (req, res) => {
    const body = req.body as { retentionDays?: number };
    return ok(res, await auditService.cleanup(req.user!.id, body.retentionDays));
  }),
);
