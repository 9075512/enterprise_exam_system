import { Router } from 'express';
import multer from 'multer';
import { randomUUID } from 'node:crypto';
import { rm } from 'node:fs/promises';
import type { RowDataPacket } from 'mysql2/promise';
import { authRequired } from '../../middleware/auth.js';
import { requireRole } from '../../middleware/role.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { badRequest, forbidden, notFound } from '../../utils/errors.js';
import { ok } from '../../utils/response.js';
import { query } from '../../db/pool.js';
import { getMyMenus } from '../permissions/permissions.service.js';
import { appStorage, apkPath, inspectApk, MAX_APK_SIZE, prepareAppStorage } from './apps.files.js';
import * as service from './apps.service.js';

export const appsRouter = Router();
appsRouter.get('/latest', asyncHandler(async (_req, res) => { res.set('Cache-Control', 'no-store'); ok(res, await service.latest()); }));
appsRouter.get('/releases/:id/download', asyncHandler(async (req, res, next) => {
  if (!/^[a-f0-9-]{36}$/.test(req.params.id)) throw notFound('安装包不存在');
  const rows = await query<RowDataPacket[]>("SELECT * FROM app_releases WHERE id = ? AND status = 'published'", [req.params.id]);
  const row = rows[0];
  if (!row) throw notFound('此安装包未发布或已下架');
  res.set({ 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Content-Type': 'application/vnd.android.package-archive' });
  res.download(apkPath(row.file_key), `zhuoda-learner-${row.version_name}.apk`, error => {
    if (error) { if (!res.headersSent) next(notFound('安装包文件暂不可用')); return; }
    // Count completed full transfers, not page visits, HEAD requests or range retries.
    if (req.method === 'GET' && res.statusCode === 200) void query('UPDATE app_releases SET download_count = download_count + 1 WHERE id = ?', [row.id]).catch(() => {});
  });
}));
const manage = Router();
manage.use(authRequired, requireRole('admin'), asyncHandler(async (req, _res, next) => {
  if (!(await getMyMenus(req.user!.role, req.user!.id)).menus.includes('app-management')) throw forbidden('没有 App 管理权限');
  next();
}));
manage.get('/', asyncHandler(async (_req, res) => ok(res, await service.list())));
const upload = multer({
  storage: multer.diskStorage({ destination: (_req, _file, cb) => cb(null, appStorage), filename: (_req, _file, cb) => cb(null, `${randomUUID()}.apk`) }),
  limits: { fileSize: MAX_APK_SIZE, files: 1, fields: 8, fieldSize: 20000 },
  fileFilter: (_req, file, cb) => { if (!/\.apk$/i.test(file.originalname)) cb(badRequest('请选择 .apk 安装包')); else cb(null, true); },
}).single('file');
manage.post('/', asyncHandler(async (req, res, next) => {
  await prepareAppStorage();
  upload(req, res, error => {
    let committed = false;
    void (async () => {
      if (error) throw badRequest(error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE' ? '安装包不能超过 200 MB' : '安装包上传失败，请检查文件后重试');
      if (!req.file) throw badRequest('请上传 APK 安装包');
      const input = service.releaseSchema.parse(req.body);
      const info = await inspectApk(req.file.path);
      const key = req.file.filename;
      const release = await service.create(input, { id: key.slice(0, -4), key, ...info }, req.user!.id);
      committed = true;
      ok(res, release);
    })().catch(async error => { if (req.file && !committed) await rm(req.file.path, { force: true }).catch(() => {}); next(error); });
  });
}));
manage.put('/:id', asyncHandler(async (req, res) => {
  const { revision } = service.revisionSchema.parse(req.body);
  const { revision: _revision, ...body } = req.body;
  await service.update(req.params.id, revision, service.releaseSchema.parse(body), req.user!.id); ok(res, null);
}));
manage.put('/:id/status', asyncHandler(async (req, res) => {
  const { revision } = service.revisionSchema.parse(req.body);
  if (!['published', 'withdrawn'].includes(req.body.status)) throw badRequest('发布状态不合法');
  await service.setStatus(req.params.id, revision, req.body.status, req.user!.id); ok(res, null);
}));
appsRouter.use('/manage', manage);
