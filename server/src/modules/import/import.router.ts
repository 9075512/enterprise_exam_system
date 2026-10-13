/**
 * 导入模块 —— 路由层（需 admin/author 权限）。
 * 导出两个路由：
 *  - `importQuestionsRouter` 挂载于 `/api/questions/import`（template / preview / commit）
 *  - `importBatchesRouter`   挂载于 `/api/import-batches`（历史列表）
 */
import { Router } from 'express';
import multer from 'multer';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { validate } from '../../middleware/validate.js';
import { authRequired } from '../../middleware/auth.js';
import { requireRole } from '../../middleware/role.js';
import { ok } from '../../utils/response.js';
import { badRequest, fileInvalid } from '../../utils/errors.js';
import { ALLOWED_EXTENSION, buildTemplateBuffer } from '../../utils/excel.js';
import { previewBodySchema, createCommitSchema, batchListQuerySchema } from './import.schema.js';
import type { CommitInput } from './import.schema.js';
import * as importService from './import.service.js';
import { getSettings } from '../settings/settings.service.js';

/** 内存存储（每次请求按当前设置的 MB 上限构造 multer，确保上限实时生效）。 */
const storage = multer.memoryStorage();

/**
 * 包裹 multer.single：上传前读取系统设置，按 settings.importMaxFileMb 动态设置单文件上限；
 * 超限（LIMIT_FILE_SIZE）转为统一 1006 中文错误。
 */
function uploadSingle(field: string) {
  return asyncHandler(async (req, res, next) => {
    const { importMaxFileMb } = await getSettings();
    const middleware = multer({
      storage,
      limits: { fileSize: importMaxFileMb * 1024 * 1024 },
    }).single(field);
    await new Promise<void>((resolve, reject) => {
      middleware(req, res, (err: unknown) => {
        if (err) {
          if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
            reject(fileInvalid(`文件超过 ${importMaxFileMb}MB 限制`));
            return;
          }
          reject(err instanceof Error ? err : new Error('文件上传失败'));
          return;
        }
        resolve();
      });
    });
    next();
  });
}

/**
 * 依据当前系统设置的 importMaxRows 校验 commit 入参（行数上限实时生效）。
 * 校验通过后把解析结果（含默认值）写回 req.body，与 validate 中间件行为一致。
 */
function validateCommitBody() {
  return asyncHandler(async (req, _res, next) => {
    const { importMaxRows } = await getSettings();
    const result = createCommitSchema(importMaxRows).safeParse(req.body);
    if (!result.success) {
      throw badRequest(result.error.issues[0]?.message ?? '请求参数不合法');
    }
    Object.defineProperty(req, 'body', {
      value: result.data,
      writable: true,
      enumerable: true,
      configurable: true,
    });
    next();
  });
}

export const importQuestionsRouter = Router();
importQuestionsRouter.use(authRequired, requireRole('admin', 'author'));

/** GET /api/questions/import/template —— 下载 .xlsx 模板。 */
importQuestionsRouter.get(
  '/template',
  asyncHandler(async (_req, res) => {
    const { importMaxRows, importMaxFileMb } = await getSettings();
    const buffer = await buildTemplateBuffer({ maxRows: importMaxRows, maxFileMb: importMaxFileMb });
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader('Content-Disposition', 'attachment; filename="question-import-template.xlsx"');
    res.setHeader('Content-Length', String(buffer.length));
    res.send(buffer);
  }),
);

/** POST /api/questions/import/preview —— 上传解析预览。 */
importQuestionsRouter.post(
  '/preview',
  uploadSingle('file'),
  validate(previewBodySchema, 'body'),
  asyncHandler(async (req, res) => {
    const file = req.file;
    if (!file) throw fileInvalid('请选择要导入的文件');
    if (!file.originalname.toLowerCase().endsWith(ALLOWED_EXTENSION)) {
      throw fileInvalid('仅支持 .xlsx 格式文件');
    }
    const { bankId } = req.body as { bankId: string };
    const result = await importService.preview(file.buffer, bankId, req.user!);
    return ok(res, result);
  }),
);

/** POST /api/questions/import/commit —— 确认导入（单事务）。 */
importQuestionsRouter.post(
  '/commit',
  validateCommitBody(),
  asyncHandler(async (req, res) => {
    const body = req.body as CommitInput;
    const result = await importService.commit(body, req.user!);
    return ok(res, result);
  }),
);

export const importBatchesRouter = Router();
importBatchesRouter.use(authRequired, requireRole('admin', 'author'));

/** GET /api/import-batches —— 导入历史（分页）。 */
importBatchesRouter.get(
  '/',
  validate(batchListQuerySchema, 'query'),
  asyncHandler(async (req, res) => {
    const q = req.query as unknown as { bankId: string; page: number; pageSize: number };
    return ok(res, await importService.listBatches({ bankId: q.bankId }, q.page, q.pageSize));
  }),
);
