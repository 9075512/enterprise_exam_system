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
import { monitorPushDisabled } from '../../utils/errors.js';
import { examSchema, examExceptionSchema, examExtendSchema } from './exams.schema.js';
import type { ExamInput, ExamExceptionInput, ExamExtendInput } from './exams.schema.js';
import * as examsService from './exams.service.js';
import * as recordsService from '../records/records.service.js';
import * as settingsService from '../settings/settings.service.js';
import * as monitorStream from './examMonitor.stream.js';
import type { MonitorStreamInfoDto } from '../../types/domain.js';

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

/* ============================ 特殊考试安排（v1.7①，admin） ============================ */

/** GET /api/exams/:id/exceptions —— 某场考试的全部特殊安排。 */
examsRouter.get(
  '/:id/exceptions',
  requireRole('admin'),
  asyncHandler(async (req, res) => ok(res, await examsService.listExceptions(req.params.id))),
);

/** PUT /api/exams/:id/exceptions/:userId —— 新增/更新某考生的特殊安排。 */
examsRouter.put(
  '/:id/exceptions/:userId',
  requireRole('admin'),
  validate(examExceptionSchema, 'body'),
  asyncHandler(async (req, res) => {
    const body = req.body as ExamExceptionInput;
    return ok(res, await examsService.upsertException(req.params.id, req.params.userId, body, req.user!.id));
  }),
);

/** DELETE /api/exams/:id/exceptions/:userId —— 删除某考生的特殊安排。 */
examsRouter.delete(
  '/:id/exceptions/:userId',
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    await examsService.removeException(req.params.id, req.params.userId, req.user!.id);
    return ok(res, null);
  }),
);

/* ============================ 实时考试监控（v1.7④ T3，admin） ============================ */

/** GET /api/exams/:id/monitor —— 监考大屏数据（花名册 + 进度 + 汇总）。 */
examsRouter.get(
  '/:id/monitor',
  requireRole('admin'),
  asyncHandler(async (req, res) => ok(res, await examsService.getMonitor(req.params.id))),
);

/**
 * GET /api/exams/:id/monitor/stream —— 监考大屏实时推送（SSE，v1.8① U1，admin）。
 *
 * 说明：
 * - 鉴权仍为 `Authorization: Bearer`（header）→ 前端须用 fetch + ReadableStream 解析
 *   （原生 `EventSource` 无法携带 header）。**服务端不提供 `?token=` 兜底**（避免令牌进日志）。
 * - 同一场考试的全部订阅者**共享一个推送循环**（每轮只查库一次再广播）。
 * - 事件：`ready`（连接建立）/ `monitor`（数据快照）/ `error`（本轮查询失败）。
 * - 心跳：每 15s 一行注释帧，维持长连接。
 */
examsRouter.get(
  '/:id/monitor/stream',
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    const examId = req.params.id;
    const settings = await settingsService.getSettings();
    if (!settings.monitorPushEnabled) throw monitorPushDisabled();

    const intervalSeconds = settings.monitorPushIntervalSeconds;
    const intervalMs = intervalSeconds * 1000;

    // 先取一次数据：考试不存在等错误可直接以 JSON 形式返回（此时尚未写 SSE 头）
    const snapshot = await examsService.getMonitor(examId);

    const added = monitorStream.addClient(examId, res);
    if (!added.ok) throw monitorPushDisabled('实时推送连接数已达上限，请稍后重试或使用轮询模式');

    res.status(200).set({
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      // 关闭 nginx 等反向代理的响应缓冲，否则事件会被攒着不发
      'X-Accel-Buffering': 'no',
    });
    res.flushHeaders();
    // 长连接：禁用 socket 空闲超时与 Nagle 算法（保证小帧立即发出）
    res.setTimeout(0);
    req.socket.setTimeout(0);
    req.socket.setNoDelay(true);

    const info: MonitorStreamInfoDto = {
      examId,
      intervalSeconds,
      examClients: added.examClients,
      totalClients: added.totalClients,
      at: new Date().toISOString(),
    };
    res.write(monitorStream.sseFrame('ready', info));
    res.write(monitorStream.sseFrame('monitor', snapshot));

    // 该考试暂无推送循环时启动（多订阅者共享）
    monitorStream.startExamTicker(examId, intervalMs, () => examsService.getMonitor(examId));

    const cleanup = (): void => {
      monitorStream.removeClient(examId, res);
    };
    res.on('close', cleanup);
    res.on('error', cleanup);
    // 连接建立后不再进入正常响应流程（避免 asyncHandler 的 finally 误触发）
    return undefined;
  }),
);

/** POST /api/exams/:id/monitor/:userId/force-submit —— 强制某考生交卷。 */
examsRouter.post(
  '/:id/monitor/:userId/force-submit',
  requireRole('admin'),
  asyncHandler(async (req, res) =>
    ok(res, await recordsService.forceSubmit(req.params.id, req.params.userId, req.user!.id)),
  ),
);

/** POST /api/exams/:id/monitor/:userId/extend —— 为某考生加时（累加）。 */
examsRouter.post(
  '/:id/monitor/:userId/extend',
  requireRole('admin'),
  validate(examExtendSchema, 'body'),
  asyncHandler(async (req, res) => {
    const body = req.body as ExamExtendInput;
    return ok(res, await examsService.extendTime(req.params.id, req.params.userId, body.minutes, req.user!.id));
  }),
);
