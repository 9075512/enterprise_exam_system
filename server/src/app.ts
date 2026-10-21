// 第 1 行：先注册全局 zod 中文 errorMap，确保任何 .parse() 之前完成（ESM import 提升，但按源码顺序求值）。
// 详见 src/utils/zodLocale.ts —— 防止类型类校验失败漏出 zod 英文默认文案。
import './utils/zodLocale.js';

/**
 * Express 应用装配。
 * 顺序：cors → json → /api 路由（health + 各模块）→ 404 兜底 → 统一错误处理（必须最后）。
 * 导出工厂函数便于测试复用，同时导出默认单例。
 */
import express, { type Express } from 'express';
import cors from 'cors';
import { ok } from './utils/response.js';
import { env } from './config/env.js';
import { authRouter } from './modules/auth/auth.router.js';
import { rolesRouter } from './modules/roles/roles.router.js';
import { usersRouter } from './modules/users/users.router.js';
import { userImportRouter } from './modules/users/userImport.router.js';
import { departmentsRouter } from './modules/departments/departments.router.js';
import { banksRouter } from './modules/banks/banks.router.js';
import { questionsRouter } from './modules/questions/questions.router.js';
import { importQuestionsRouter, importBatchesRouter } from './modules/import/import.router.js';
import { examsRouter } from './modules/exams/exams.router.js';
import { recordsRouter } from './modules/records/records.router.js';
import { reportsRouter } from './modules/reports/reports.router.js';
import { settingsRouter } from './modules/settings/settings.router.js';
import { permissionsRouter } from './modules/permissions/permissions.router.js';
import { notificationsRouter } from './modules/notifications/notifications.router.js';
import { retakesRouter } from './modules/retakes/retakes.router.js';
import { appealsRouter } from './modules/appeals/appeals.router.js';
import { auditRouter } from './modules/audit/audit.router.js';
import { loginLogsRouter } from './modules/loginLogs/loginLogs.router.js';
import { maintenanceRouter } from './modules/maintenance/maintenance.router.js';
import { attachmentsRouter } from './modules/attachments/attachments.router.js';
import { practiceRouter } from './modules/practice/practice.router.js';
import { contentRouter } from './modules/content/content.router.js';
import { coursesRouter } from './modules/courses/courses.router.js';
import { homeRouter } from './modules/home/home.router.js';
import {
  menuOverridesRouter,
  positionsRouter,
  subjectGrantsRouter,
  subjectsRouter,
} from './modules/coreCatalog/coreCatalog.router.js';
import { questionFeedbackRouter } from './modules/questionFeedback/questionFeedback.router.js';
import { practiceMonitorRouter } from './modules/practiceMonitor/practiceMonitor.router.js';
import { practiceEdgeGuard } from './middleware/practiceEdge.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';

/** 创建并装配 Express 应用。 */
export function createApp(): Express {
  const app = express();

  // 跨域（前端 SPA 调用）
  app.use(cors());
  // JSON 请求体解析
  // 简答题支持内联图片作答（v1.7③ S1），请求体上限放宽至 8mb
  app.use(express.json({ limit: '8mb' }));

  // 公网边界兜底（方案甲）：仅当配置 PRACTICE_EDGE_SECRET 且非 PRACTICE_ONLY 时生效。
  // 必须在路由之前注册，拦截「公网直连 :3001 绕过 Nginx」的非练题请求。
  app.use(practiceEdgeGuard);

  // 业务路由统一挂载在 /api 下
  const api = express.Router();

  // 健康检查
  api.get('/health', (_req, res) => ok(res, { status: 'up' }));

  // 练题模块（公网前缀 /api/practice）：ENABLE_PRACTICE 或 PRACTICE_ONLY 时注册。
  // 登录接口 /auth/login、/auth/captcha 公开；其余接口在 router 内挂 practiceAuthRequired。
  if (env.ENABLE_PRACTICE || env.PRACTICE_ONLY) {
    api.use('/practice', practiceRouter);
  }

  // 考试域（内网）路由：PRACTICE_ONLY=true（公网练题实例）时**不注册**，进程内物理不可达。
  if (!env.PRACTICE_ONLY) {
    api.use('/auth', authRouter);
    api.use('/users/import', userImportRouter);
    api.use('/users', usersRouter);
    api.use('/departments', departmentsRouter);
    // 注意：/questions/import 必须在 /questions 之前挂载，避免被通配路由抢先匹配
    api.use('/questions/import', importQuestionsRouter);
    api.use('/import-batches', importBatchesRouter);
    api.use('/banks', banksRouter);
    api.use('/questions', questionsRouter);
    api.use('/exams', examsRouter);
    api.use('/records', recordsRouter);
    api.use('/reports', reportsRouter);
    api.use('/settings', settingsRouter);
    api.use('/permissions', permissionsRouter);
    api.use('/notifications', notificationsRouter);
    api.use('/retakes', retakesRouter);
    api.use('/appeals', appealsRouter);
    api.use('/audit-logs', auditRouter);
    api.use('/login-logs', loginLogsRouter);
    api.use('/maintenance', maintenanceRouter);
    // 富文本附件对象存储（v1.8④ U4）：上传需登录；读取走签名 URL（见模块注释）
    api.use('/attachments', attachmentsRouter);
    api.use('/content', contentRouter);
    api.use('/courses', coursesRouter);
    api.use('/home', homeRouter);
    api.use('/subjects', subjectsRouter);
    api.use('/positions', positionsRouter);
    api.use('/roles', rolesRouter);
    api.use('/subject-grants', subjectGrantsRouter);
    api.use('/menu-overrides', menuOverridesRouter);
    api.use('/question-feedback', questionFeedbackRouter);
    api.use('/practice-monitor', practiceMonitorRouter);
  }

  app.use('/api', api);

  // 未匹配路由 → 404（统一结构）
  app.use(notFoundHandler);
  // 统一错误处理（必须最后注册）
  app.use(errorHandler);

  return app;
}

/** 默认应用单例。 */
export const app = createApp();
