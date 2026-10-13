/**
 * 富文本附件 —— 路由层（v1.8④ U4）。
 *
 * - `POST /api/attachments`：登录用户上传图片（multipart，字段 `file`）→ 返回 `{ id, url, ... }`；
 * - `GET  /api/attachments/:id`：读取图片（`<img src>` 场景走签名 URL，见 service 注释）→ 流式返回。
 *
 * 上传上限**每次请求按当前系统设置构造 multer**（`richTextImageMaxMb`），保证改设置即时生效。
 */
import { Router } from 'express';
import multer from 'multer';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { authOptional, authRequired } from '../../middleware/auth.js';
import { ok } from '../../utils/response.js';
import { badRequest, fileInvalid } from '../../utils/errors.js';
import { attachmentStore } from '../../utils/attachmentStore.js';
import { getSettings } from '../settings/settings.service.js';
import * as attachmentsService from './attachments.service.js';
import type { AttachmentDto } from '../../types/domain.js';

export const attachmentsRouter = Router();

/** 内存存储（校验通过后由存储抽象落盘）。 */
const memoryStorage = multer.memoryStorage();

/** 按当前设置的 MB 上限构造 multer，超限转统一 1006 中文错误。 */
function uploadImageFile() {
  return asyncHandler(async (req, res, next) => {
    const { richTextImageMaxMb } = await getSettings();
    const middleware = multer({
      storage: memoryStorage,
      limits: { fileSize: richTextImageMaxMb * 1024 * 1024, files: 1 },
    }).single('file');
    await new Promise<void>((resolve, reject) => {
      middleware(req, res, (err: unknown) => {
        if (err) {
          if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
            reject(fileInvalid(`单张图片不能超过 ${richTextImageMaxMb}MB`));
            return;
          }
          reject(err instanceof Error ? err : new Error('图片上传失败'));
          return;
        }
        resolve();
      });
    });
    next();
  });
}

/** POST /api/attachments —— 上传图片附件（登录用户）。 */
attachmentsRouter.post(
  '/',
  authRequired,
  uploadImageFile(),
  asyncHandler(async (req, res) => {
    const file = req.file;
    if (!file) throw badRequest('请选择要上传的图片');
    const dto = await attachmentsService.uploadImage(
      { buffer: file.buffer, mimetype: file.mimetype, size: file.size },
      req.user!.id,
    );
    return ok<AttachmentDto>(res, dto);
  }),
);

/**
 * GET /api/attachments/:id —— 读取附件（`<img src>` 可用）。
 *
 * **未强制 `authRequired`**：浏览器 `<img>` 无法携带 Authorization 头，
 * 因此这里用 `authOptional` 解析「有就带上」的 Bearer，鉴权由 service 的双通道校验完成
 * （合法 Bearer 且本人/阅卷角色，或合法签名 `?t=`）。
 */
attachmentsRouter.get(
  '/:id',
  authOptional,
  asyncHandler(async (req, res) => {
    const row = await attachmentsService.getForRead(
      req.params.id,
      req.user,
      req.query.t,
    );
    res.status(200).set({
      'Content-Type': row.mime,
      'Content-Length': String(row.size),
      // 附件不可变（id 唯一且内容不修改）→ 允许客户端长期缓存；private 避免共享缓存代理滞留
      'Cache-Control': 'private, max-age=31536000, immutable',
      'Content-Disposition': 'inline',
      'X-Content-Type-Options': 'nosniff',
    });
    const stream = attachmentStore.createStream(row.storage_key);
    stream.on('error', () => {
      if (!res.headersSent) res.status(404).end();
      else res.end();
    });
    stream.pipe(res);
    return undefined;
  }),
);
