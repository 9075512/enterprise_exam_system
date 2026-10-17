import { Router } from 'express';
import { authRequired } from '../../middleware/auth.js';
import { requireRole } from '../../middleware/role.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { ok } from '../../utils/response.js';
import * as service from './practiceMonitor.service.js';

export const practiceMonitorRouter = Router();
practiceMonitorRouter.use(authRequired, requireRole('admin'));
practiceMonitorRouter.get('/overview', asyncHandler(async (_req, res) => ok(res, await service.overview())));
practiceMonitorRouter.get('/sessions', asyncHandler(async (req, res) => ok(res, await service.sessions({
  userId: typeof req.query.userId === 'string' ? req.query.userId : undefined,
  departmentId: typeof req.query.departmentId === 'string' ? req.query.departmentId : undefined,
  bankId: typeof req.query.bankId === 'string' ? req.query.bankId : undefined,
  status: typeof req.query.status === 'string' ? req.query.status as never : undefined,
  startAt: typeof req.query.startAt === 'string' ? req.query.startAt : undefined,
  endAt: typeof req.query.endAt === 'string' ? req.query.endAt : undefined,
}))));
practiceMonitorRouter.get('/logs', asyncHandler(async (req, res) => ok(res, await service.logs({
  sessionId: typeof req.query.sessionId === 'string' ? req.query.sessionId : undefined,
  userId: typeof req.query.userId === 'string' ? req.query.userId : undefined,
  departmentId: typeof req.query.departmentId === 'string' ? req.query.departmentId : undefined,
  bankId: typeof req.query.bankId === 'string' ? req.query.bankId : undefined,
  startAt: typeof req.query.startAt === 'string' ? req.query.startAt : undefined,
  endAt: typeof req.query.endAt === 'string' ? req.query.endAt : undefined,
}))));
practiceMonitorRouter.get('/stream', asyncHandler(async (_req, res) => {
  res.status(200).set({ 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
  res.flushHeaders();
  const send = async (): Promise<void> => { res.write(`event: overview\ndata: ${JSON.stringify(await service.overview())}\n\n`); };
  await send();
  const timer = setInterval(() => { void send().catch(() => res.write(`event: error\ndata: {"message":"监控刷新失败"}\n\n`)); }, 15_000);
  const cleanup = (): void => clearInterval(timer);
  res.on('close', cleanup); res.on('error', cleanup);
  return undefined;
}));
