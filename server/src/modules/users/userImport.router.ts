/**
 * 用户批量导入 —— 路由层（仅 admin）。
 * 挂载于 `/api/users/import`（在 `/api/users` 之前，避免被 `/:id` 抢先匹配）。
 */
import { Router } from 'express';
import multer from 'multer';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { validate } from '../../middleware/validate.js';
import { authRequired } from '../../middleware/auth.js';
import { requireRole } from '../../middleware/role.js';
import { ok } from '../../utils/response.js';
import { fileInvalid } from '../../utils/errors.js';
import { ALLOWED_EXTENSION } from '../../utils/excel.js';
import { buildUserTemplateBuffer } from '../../utils/userExcel.js';
import { userCommitSchema } from './userImport.schema.js';
import type { UserCommitInput } from './userImport.schema.js';
import * as userImportService from './userImport.service.js';
import { getSettings } from '../settings/settings.service.js';

const storage = multer.memoryStorage();

function uploadSingle(field: string) {
  return asyncHandler(async (req, res, next) => {
    const { importMaxFileMb } = await getSettings();
    const middleware = multer({ storage, limits: { fileSize: importMaxFileMb * 1024 * 1024 } }).single(field);
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

export const userImportRouter = Router();
userImportRouter.use(authRequired, requireRole('admin'));

/** GET /api/users/import/template —— 下载用户导入模板。 */
userImportRouter.get(
  '/template',
  asyncHandler(async (_req, res) => {
    const { importMaxRows, importMaxFileMb } = await getSettings();
    const buffer = await buildUserTemplateBuffer({ maxRows: importMaxRows, maxFileMb: importMaxFileMb });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="user-import-template.xlsx"');
    res.setHeader('Content-Length', String(buffer.length));
    res.send(buffer);
  }),
);

/** POST /api/users/import/preview —— 上传解析预览。 */
userImportRouter.post(
  '/preview',
  uploadSingle('file'),
  asyncHandler(async (req, res) => {
    const file = req.file;
    if (!file) throw fileInvalid('请选择要导入的文件');
    if (!file.originalname.toLowerCase().endsWith(ALLOWED_EXTENSION)) {
      throw fileInvalid('仅支持 .xlsx 格式文件');
    }
    const result = await userImportService.preview(file.buffer);
    return ok(res, result);
  }),
);

/** POST /api/users/import/commit —— 确认导入。 */
userImportRouter.post(
  '/commit',
  validate(userCommitSchema, 'body'),
  asyncHandler(async (req, res) => {
    const body = req.body as UserCommitInput;
    const result = await userImportService.commit(body, req.user!.id);
    return ok(res, result);
  }),
);

/** GET /api/users/import/batches —— 导入历史（分页）。 */
userImportRouter.get(
  '/batches',
  asyncHandler(async (req, res) => {
    const { page, pageSize } = req.query as unknown as { page?: number; pageSize?: number };
    return ok(res, await userImportService.listBatches(page, pageSize));
  }),
);
