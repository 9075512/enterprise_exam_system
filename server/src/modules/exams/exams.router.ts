/**
 * 考试模块 —— 路由层。
 * 管理员维护考试；指定出题人按题库权限维护题目；考生仅能读取本人可参加的考试。
 */
import { Router } from 'express';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { validate } from '../../middleware/validate.js';
import { authRequired } from '../../middleware/auth.js';
import { requireRole } from '../../middleware/role.js';
import { ok } from '../../utils/response.js';
import { monitorPushDisabled } from '../../utils/errors.js';
import { drawSchema } from '../papers/papers.schema.js';
import * as papersService from '../papers/papers.service.js';
import { examQuestionsSchema, examSchema, examExceptionSchema, examExtendSchema } from './exams.schema.js';
import type { ExamInput, ExamExceptionInput, ExamExtendInput } from './exams.schema.js';
import * as examsService from './exams.service.js';
import * as recordsService from '../records/records.service.js';
import * as settingsService from '../settings/settings.service.js';
import * as monitorStream from './examMonitor.stream.js';
import type { MonitorStreamInfoDto } from '../../types/domain.js';
import * as participantsService from './examParticipants.service.js';

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

/** 考试管理：管理员全部、出题人仅被分配的考试。 */
examsRouter.get(
  '/',
  requireRole('admin', 'author'),
  asyncHandler(async (req, res) => ok(res, await examsService.list(req.user!))),
);

examsRouter.post('/draw-questions', requireRole('admin', 'author'), validate(drawSchema, 'body'), asyncHandler(async (req, res) => ok(res, await papersService.drawQuestions(req.body, req.user!))));
examsRouter.get('/:id/questions', requireRole('admin', 'author'), asyncHandler(async (req, res) => ok(res, await examsService.getQuestions(req.params.id, req.user!))));
examsRouter.put('/:id/questions', requireRole('admin', 'author'), validate(examQuestionsSchema, 'body'), asyncHandler(async (req, res) => ok(res, await examsService.saveQuestions(req.params.id, req.body, req.user!))));
examsRouter.get('/:id/export-pdf', requireRole('admin', 'author'), asyncHandler(async (req, res) => {
  const result = await examsService.exportQuestions(req.params.id, req.query.withAnswer === '1', req.user!);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(result.filename)}`);
  res.send(result.buffer);
}));

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

/** GET /api/exams/:id/participants —— 生效名单（旧考试仅在 freeze=1 时物化）。 */
examsRouter.get(
  '/:id/participants',
  requireRole('admin'),
  asyncHandler(async (req, res) => ok(res, await participantsService.listParticipants(req.params.id, req.query.freeze === '1'))),
);

/** POST /api/exams/:id/participants/regenerate —— 开考前按已保存规则重新生成。 */
examsRouter.post(
  '/:id/participants/regenerate',
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    const exam = await examsService.getById(req.params.id);
    await participantsService.freezeParticipants(exam.id, {
      departmentIds: exam.departmentIds,
      includeUserIds: exam.includeUserIds,
      excludeUserIds: exam.excludeUserIds,
    });
    return ok(res, await participantsService.listParticipants(exam.id));
  }),
);

/** GET /api/exams/:id/admission-tickets —— 管理员取全量；考生只能取本人。format=pdf 批量导出。 */
examsRouter.get(
  '/:id/admission-tickets',
  requireRole('admin', 'examinee'),
  asyncHandler(async (req, res) => {
    if (req.query.format === 'pdf') {
      const { buffer, filename } = await participantsService.admissionTicketsPdf(req.params.id, req.user!);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`);
      res.setHeader('Content-Length', String(buffer.length));
      res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition');
      return res.send(buffer);
    }
    return ok(res, await participantsService.admissionTickets(req.params.id, req.user!));
  }),
);

/** GET /api/exams/:id —— 考试详情（登录）。 */
examsRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    if (req.user!.role === 'examinee') {
      await participantsService.assertParticipant(req.params.id, req.user!.id);
      return ok(res, await examsService.getById(req.params.id));
    }
    return ok(res, await examsService.getManagement(req.params.id, req.user!));
  }),
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
