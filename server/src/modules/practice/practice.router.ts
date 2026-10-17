/**
 * 练题模块 —— 路由层（公网前缀 `/api/practice`）。
 *
 * 安全要点（架构 §4.2 / §13）：
 * - 除 `auth/login` 与 `auth/captcha` 外，**所有**接口挂 `practiceAuthRequired`（强制登录）；
 * - 登录接口挂 `practiceLoginGuard`（失败锁定 + 验证码）与 `practiceRateLimit('login')`；
 * - 判分 / 题库列表挂限流；
 * - 全部响应 `Cache-Control: no-store`；
 * - 题库访问始终以 `allow_practice = 1` 为前置条件。
 */
import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { validate } from '../../middleware/validate.js';
import { ok } from '../../utils/response.js';
import { AppError, ERROR_CODES } from '../../utils/errors.js';
import { practiceAuthRequired } from '../../middleware/practiceAuth.js';
import {
  clientIp,
  clearLoginFailures,
  issueCaptcha,
  practiceLoginGuard,
  recordLoginAudit,
  recordLoginFailure,
} from '../../middleware/practiceLoginGuard.js';
import { practiceRateLimit } from '../../middleware/practiceRateLimit.js';
import { record as recordLoginLog } from '../loginLogs/loginLogs.service.js';
import {
  practiceCheckSchema,
  practiceFavoriteBodySchema,
  practiceFavoriteIdsQuerySchema,
  practiceFavoriteListQuerySchema,
  practiceFavoriteParamsSchema,
  practiceFavoriteReansSchema,
  practiceLoginSchema,
  practiceProgressPutSchema,
  practiceProgressQuerySchema,
  practiceQuestionsByIdsQuerySchema,
  practiceQuestionsQuerySchema,
  practiceReportTrendQuerySchema,
  practiceSessionSchema,
  practiceSessionFinishSchema,
  practiceWrongBookQuerySchema,
  practiceWrongReansSchema,
  type PracticeLoginInput,
} from './practice.schema.js';
import * as service from './practice.service.js';
import * as practiceSettingsService from './practiceSettings.service.js';
import * as contentService from '../content/content.service.js';
import type {
  PracticeCheckInput,
  PracticeProgressPutInput,
  PracticeSessionInput,
} from './practice.schema.js';
import type { QuestionType } from '../../types/domain.js';
import * as sessionTracking from './practiceSessionTracking.service.js';
import * as questionFeedbackService from '../questionFeedback/questionFeedback.service.js';

export const practiceRouter = Router();
const feedbackSchema = z.object({ questionId: z.string().min(1).max(64), sessionId: z.string().min(1).max(64), category: z.string().trim().min(1).max(32), content: z.string().trim().min(1).max(1000) });

/** 练题所有响应禁止缓存（架构共享约定 §10-14）。 */
practiceRouter.use((_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  next();
});

/* ------------------------------ 登录（公开） ------------------------------ */

/** GET /api/practice/auth/captcha —— 下发算术验证码（失败达阈值后需要）。 */
practiceRouter.get(
  '/auth/captcha',
  practiceRateLimit('login'),
  asyncHandler(async (_req, res) => ok(res, issueCaptcha())),
);

/** POST /api/practice/auth/login —— 练题登录（复用内网账号 bcrypt 校验，只读 users）。 */
practiceRouter.post(
  '/auth/login',
  practiceRateLimit('login'),
  validate(practiceLoginSchema, 'body'),
  practiceLoginGuard,
  asyncHandler(async (req, res) => {
    const { username, password } = req.body as PracticeLoginInput;
    const ip = clientIp(req);
    const ua = String(req.headers['user-agent'] ?? '');
    try {
      const result = await service.login(username, password);
      clearLoginFailures(username, ip);
      recordLoginAudit({ username, ip, userAgent: ua, success: true });
      void recordLoginLog({
        username,
        userId: result.user.id,
        role: result.user.role,
        ip,
        userAgent: ua,
        success: true,
        source: 'practice',
      });
      return ok(res, result);
    } catch (err) {
      // 仅凭据错误计入失败；其余错误（如限流）不计
      if (err instanceof AppError && err.code === ERROR_CODES.UNAUTHORIZED) {
        recordLoginFailure(username, ip);
        recordLoginAudit({ username, ip, userAgent: ua, success: false, reason: 'credentials' });
        void recordLoginLog({
          username,
          ip,
          userAgent: ua,
          success: false,
          reason: 'credentials',
          source: 'practice',
        });
      }
      throw err;
    }
  }),
);

/** GET /api/practice/auth/me —— 当前练题登录用户。 */
practiceRouter.get(
  '/auth/me',
  practiceAuthRequired,
  asyncHandler(async (req, res) => ok(res, await service.me(req.practiceUser!.id))),
);

/** POST /api/practice/auth/logout —— 登出（无状态，仅返回 ok）。 */
practiceRouter.post(
  '/auth/logout',
  practiceAuthRequired,
  asyncHandler(async (_req, res) => ok(res, null)),
);

/* ------------------------------ 题库 / 题目（需登录） ------------------------------ */

/**
 * GET /api/practice/config —— 练题端公开配置（v1.9⑤）。
 * 返回默认练题方式 / 单次题量范围 / 答案与解析可见性 / 页面入口开关；
 * 练题端据此渲染步进器范围与 Tab 入口，无需再各自硬编码默认值。
 */
practiceRouter.get(
  '/config',
  practiceAuthRequired,
  asyncHandler(async (_req, res) => ok(res, await practiceSettingsService.getPracticeConfig())),
);

/** GET /api/practice/banks —— 对外开放练题的题库列表。 */
practiceRouter.get(
  '/banks',
  practiceAuthRequired,
  practiceRateLimit('banks'),
  asyncHandler(async (req, res) => ok(res, await service.listBanks(req.practiceUser!.id))),
);

/** GET /api/practice/banks/tree —— 当前用户可见的练题科目树。 */
practiceRouter.get(
  '/banks/tree',
  practiceAuthRequired,
  practiceRateLimit('banks'),
  asyncHandler(async (req, res) => ok(res, await service.practiceTree(req.practiceUser!.id))),
);

/**
 * GET /api/practice/feed —— 练题端当前生效的公告 + 轮播图（v1.9⑥）。
 *
 * 与考试端 `GET /api/content/feed?scope=exam` 共用 content 模块的同一实现，
 * 仅按 `target ∈ {practice, both}` + 启停 + 生效时间窗过滤；
 * 练题实例（PRACTICE_ONLY）对 announcements / banners 两表仅授 SELECT（只读展示）。
 */
practiceRouter.get(
  '/feed',
  practiceAuthRequired,
  asyncHandler(async (_req, res) => ok(res, await contentService.getFeed('practice'))),
);

/**
 * POST /api/practice/feed/announcements/:id/read —— 练题端记录公告已读（v2.0③）。
 * 与考试端共用 content.service，仅 scope = 'practice'；幂等。
 */
practiceRouter.post(
  '/feed/announcements/:id/read',
  practiceAuthRequired,
  asyncHandler(async (req, res) => {
    await contentService.markAnnouncementRead('practice', req.params.id, req.practiceUser!.id);
    return ok(res, null);
  }),
);

/** POST /api/practice/feed/banners/:id/click —— 练题端记录轮播点击（v2.0③，幂等）。 */
practiceRouter.post(
  '/feed/banners/:id/click',
  practiceAuthRequired,
  asyncHandler(async (req, res) => {
    await contentService.markBannerClick('practice', req.params.id, req.practiceUser!.id);
    return ok(res, null);
  }),
);

/** GET /api/practice/banks/:id/questions —— 题库题目（**不含**答案/解析）。 */
practiceRouter.get(
  '/banks/:id/questions',
  practiceAuthRequired,
  practiceRateLimit('banks'),
  validate(practiceQuestionsQuerySchema, 'query'),
  asyncHandler(async (req, res) => {
    const q = req.query as unknown as {
      type?: QuestionType;
      subject: string;
      page: number;
      pageSize: number;
    };
    return ok(
      res,
      await service.listQuestions(req.practiceUser!.id, req.params.id, {
        type: q.type,
        subject: q.subject,
        page: q.page,
        pageSize: q.pageSize,
      }),
    );
  }),
);

/** GET /api/practice/questions?ids=a,b,c —— 按 id 批量取题（仅开放题库，**不含**答案/解析）。 */
practiceRouter.get(
  '/questions',
  practiceAuthRequired,
  practiceRateLimit('banks'),
  validate(practiceQuestionsByIdsQuerySchema, 'query'),
  asyncHandler(async (req, res) => {
    const { ids } = req.query as unknown as { ids: string[] };
    return ok(res, await service.getQuestionsByIds(req.practiceUser!.id, ids));
  }),
);

/* ------------------------------ 练习会话（需登录） ------------------------------ */

/** POST /api/practice/sessions —— 生成一次练习序列（顺序/随机、题量、题型）。 */
practiceRouter.post(
  '/sessions',
  practiceAuthRequired,
  practiceRateLimit('session'),
  validate(practiceSessionSchema, 'body'),
  asyncHandler(async (req, res) => {
    const body = req.body as PracticeSessionInput;
    return ok(res, await service.createSession(req.practiceUser!.id, body));
  }),
);

/** POST /api/practice/sessions/:id/heartbeat —— 30 秒心跳。 */
practiceRouter.post(
  '/sessions/:id/heartbeat',
  practiceAuthRequired,
  asyncHandler(async (req, res) => { await sessionTracking.touch(req.params.id, req.practiceUser!.id); return ok(res, null); }),
);

/** POST /api/practice/sessions/:id/finish —— 正常完成或主动退出。 */
practiceRouter.post(
  '/sessions/:id/finish',
  practiceAuthRequired,
  validate(practiceSessionFinishSchema, 'body'),
  asyncHandler(async (req, res) => { await sessionTracking.finish(req.params.id, req.practiceUser!.id, req.body.status); return ok(res, null); }),
);

/** 从练题结果提交纠错反馈；来源会话和题目归属由服务端核验。 */
practiceRouter.post(
  '/feedback',
  practiceAuthRequired,
  validate(feedbackSchema, 'body'),
  asyncHandler(async (req, res) => ok(res, await questionFeedbackService.create({
    questionId: req.body.questionId,
    source: 'practice',
    sourceRefId: req.body.sessionId,
    category: req.body.category,
    content: req.body.content,
  }, req.practiceUser!.id))),
);

/** POST /api/practice/check —— 提交单题作答 → 即时判分（正误 + 正确答案 + 解析）。 */
practiceRouter.post(
  '/check',
  practiceAuthRequired,
  practiceRateLimit('check'),
  validate(practiceCheckSchema, 'body'),
  asyncHandler(async (req, res) => {
    const body = req.body as PracticeCheckInput;
    return ok(res, await service.check(req.practiceUser!.id, body));
  }),
);

/* ------------------------------ 进度 / 错题本（需登录） ------------------------------ */

/** GET /api/practice/progress?bankId= —— 查询我的练题进度与统计。 */
practiceRouter.get(
  '/progress',
  practiceAuthRequired,
  practiceRateLimit('progress'),
  validate(practiceProgressQuerySchema, 'query'),
  asyncHandler(async (req, res) => {
    const { bankId } = req.query as unknown as { bankId: string };
    return ok(res, await service.getProgress(req.practiceUser!.id, bankId));
  }),
);

/** PUT /api/practice/progress —— 保存练题进度（计数由服务端重算）。 */
practiceRouter.put(
  '/progress',
  practiceAuthRequired,
  practiceRateLimit('progress'),
  validate(practiceProgressPutSchema, 'body'),
  asyncHandler(async (req, res) => {
    const body = req.body as PracticeProgressPutInput;
    return ok(res, await service.saveProgress(req.practiceUser!.id, body));
  }),
);

/** GET /api/practice/wrong-book —— 错题本列表（分页）。 */
practiceRouter.get(
  '/wrong-book',
  practiceAuthRequired,
  practiceRateLimit('wrongbook'),
  validate(practiceWrongBookQuerySchema, 'query'),
  asyncHandler(async (req, res) => {
    const q = req.query as unknown as { page: number; pageSize: number };
    return ok(res, await service.listWrongBook(req.practiceUser!.id, q.page, q.pageSize));
  }),
);

/** POST /api/practice/wrong-book/reans —— 从错题本生成练习序列。 */
practiceRouter.post(
  '/wrong-book/reans',
  practiceAuthRequired,
  practiceRateLimit('wrongbook'),
  validate(practiceWrongReansSchema, 'body'),
  asyncHandler(async (req, res) => {
    const { bankId } = req.body as { bankId?: string };
    return ok(res, await service.createWrongReansSession(req.practiceUser!.id, bankId));
  }),
);

/* ------------------------------ 收藏夹（需登录，二期） ------------------------------ */

/** GET /api/practice/favorites —— 我的收藏（分页，可按题库筛选）。 */
practiceRouter.get(
  '/favorites',
  practiceAuthRequired,
  practiceRateLimit('favorites'),
  validate(practiceFavoriteListQuerySchema, 'query'),
  asyncHandler(async (req, res) => {
    const q = req.query as unknown as { bankId: string; page: number; pageSize: number };
    return ok(res, await service.listFavorites(req.practiceUser!.id, q));
  }),
);

/** GET /api/practice/favorites/ids —— 我收藏的题目 id 列表（作答页批量回显收藏态）。 */
practiceRouter.get(
  '/favorites/ids',
  practiceAuthRequired,
  practiceRateLimit('favorites'),
  validate(practiceFavoriteIdsQuerySchema, 'query'),
  asyncHandler(async (req, res) => {
    const { bankId } = req.query as unknown as { bankId: string };
    return ok(res, await service.listFavoriteIds(req.practiceUser!.id, bankId));
  }),
);

/** POST /api/practice/favorites —— 收藏一题（幂等；超上限 → 1013）。 */
practiceRouter.post(
  '/favorites',
  practiceAuthRequired,
  practiceRateLimit('favorites'),
  validate(practiceFavoriteBodySchema, 'body'),
  asyncHandler(async (req, res) => {
    const { questionId } = req.body as { questionId: string };
    return ok(res, await service.addFavorite(req.practiceUser!.id, questionId));
  }),
);

/** POST /api/practice/favorites/reans —— 从收藏夹生成练习序列（可选按题库过滤）。 */
practiceRouter.post(
  '/favorites/reans',
  practiceAuthRequired,
  practiceRateLimit('favorites'),
  validate(practiceFavoriteReansSchema, 'body'),
  asyncHandler(async (req, res) => {
    const { bankId } = req.body as { bankId?: string };
    return ok(res, await service.createFavoriteReansSession(req.practiceUser!.id, bankId));
  }),
);

/** DELETE /api/practice/favorites/:questionId —— 取消收藏（幂等）。 */
practiceRouter.delete(
  '/favorites/:questionId',
  practiceAuthRequired,
  practiceRateLimit('favorites'),
  validate(practiceFavoriteParamsSchema, 'params'),
  asyncHandler(async (req, res) => {
    const { questionId } = req.params as unknown as { questionId: string };
    return ok(res, await service.removeFavorite(req.practiceUser!.id, questionId));
  }),
);

/* ------------------------------ 每日一练（需登录，二期） ------------------------------ */

/** GET /api/practice/daily —— 今日任务（关闭时返回 enabled=false 降级结构）。 */
practiceRouter.get(
  '/daily',
  practiceAuthRequired,
  practiceRateLimit('daily'),
  asyncHandler(async (req, res) => ok(res, await service.getDaily(req.practiceUser!.id))),
);

/** POST /api/practice/daily/session —— 生成今日任务练习会话（关闭时 1014）。 */
practiceRouter.post(
  '/daily/session',
  practiceAuthRequired,
  practiceRateLimit('daily'),
  asyncHandler(async (req, res) => ok(res, await service.createDailySession(req.practiceUser!.id))),
);

/* ------------------------------ 学习报告（需登录，二期） ------------------------------ */

/** GET /api/practice/report/summary —— 报告总览。 */
practiceRouter.get(
  '/report/summary',
  practiceAuthRequired,
  practiceRateLimit('report'),
  asyncHandler(async (req, res) => ok(res, await service.getReportSummary(req.practiceUser!.id))),
);

/** GET /api/practice/report/trend?days=7|30 —— 逐日趋势（无记录日补 0）。 */
practiceRouter.get(
  '/report/trend',
  practiceAuthRequired,
  practiceRateLimit('report'),
  validate(practiceReportTrendQuerySchema, 'query'),
  asyncHandler(async (req, res) => {
    const { days } = req.query as unknown as { days: 7 | 30 };
    return ok(res, await service.getReportTrend(req.practiceUser!.id, days));
  }),
);

/** GET /api/practice/report/subjects —— 科目掌握度（正确率升序，weak 标记）。 */
practiceRouter.get(
  '/report/subjects',
  practiceAuthRequired,
  practiceRateLimit('report'),
  asyncHandler(async (req, res) => ok(res, await service.getReportSubjects(req.practiceUser!.id))),
);

/** GET /api/practice/report/banks —— 开放题库概览。 */
practiceRouter.get(
  '/report/banks',
  practiceAuthRequired,
  practiceRateLimit('report'),
  asyncHandler(async (req, res) => ok(res, await service.getReportBanks(req.practiceUser!.id))),
);

/* ------------------------------ 打卡与激励（需登录，v2.0⑤） ------------------------------ */

/** GET /api/practice/achievements —— 连续打卡 + 成就徽章 + 累计数据（模块关闭时 1017）。 */
practiceRouter.get(
  '/achievements',
  practiceAuthRequired,
  practiceRateLimit('report'),
  asyncHandler(async (req, res) => ok(res, await service.getAchievements(req.practiceUser!.id))),
);
