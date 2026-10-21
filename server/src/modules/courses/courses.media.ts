import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { mkdir, open, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import multer from 'multer';
import type { Request, Response, NextFunction } from 'express';
import type { RowDataPacket, ResultSetHeader } from 'mysql2/promise';
import { env } from '../../config/env.js';
import { storageRoot } from '../../utils/attachmentStore.js';
import { query } from '../../db/pool.js';
import { badRequest, fileInvalid, forbidden, notFound } from '../../utils/errors.js';
import { ok } from '../../utils/response.js';
import { renderCourseCover } from './courses.cover.js';
import type { CourseCoverInput } from './courses.schema.js';

export const courseMediaRoot = path.resolve(storageRoot, 'course-media');
const formats: Record<string, string> = { 'video/mp4': '.mp4', 'video/webm': '.webm', 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' };
const upload = multer({ storage: multer.diskStorage({
  destination: (_req, _file, done) => { mkdir(courseMediaRoot, { recursive: true }).then(() => done(null, courseMediaRoot), error => done(error, '')); },
  filename: (_req, file, done) => done(null, randomUUID() + formats[file.mimetype]),
}), limits: { fileSize: 200 * 1024 * 1024, files: 1, fields: 0 }, fileFilter: (_req, file, done) => {
  if (!formats[file.mimetype]) { done(fileInvalid('支持 MP4 / WebM 视频和 JPG / PNG / WebP 封面')); return; }
  done(null, true);
} }).single('file');

function signature(id: string): string { return createHmac('sha256', env.JWT_SECRET).update(`course-media:${id}`).digest('hex').slice(0, 32); }
async function registerMedia(id: string, filename: string, mime: string, size: number, actorId: string) {
  await query<ResultSetHeader>('INSERT INTO course_media (id, filename, mime, size, created_by, created_at) VALUES (?, ?, ?, ?, ?, NOW(3))', [id, filename, mime, size, actorId]);
  return { id, url: `/api/courses/media/${id}?t=${signature(id)}`, mime, size };
}
export async function generateCourseCover(input: CourseCoverInput, actorId: string) {
  const content = Buffer.from(renderCourseCover(input), 'utf8');
  const id = randomUUID(); const filename = `${id}.svg`; const file = path.join(courseMediaRoot, filename);
  await mkdir(courseMediaRoot, { recursive: true });
  await writeFile(file, content, { flag: 'wx' });
  try { return await registerMedia(id, filename, 'image/svg+xml', content.length, actorId); }
  catch (error) { await unlink(file).catch(() => {}); throw error; }
}
export async function uploadCourseMedia(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await new Promise<void>((resolve, reject) => upload(req, res, error => error ? reject(error instanceof multer.MulterError ? fileInvalid(error.code === 'LIMIT_FILE_SIZE' ? '视频不能超过200MB' : '每次只能上传一个文件') : error) : resolve()));
    const file = req.file;
    if (!file) throw badRequest('请选择文件');
    try {
      if (file.size === 0 || file.mimetype.startsWith('image/') && file.size > 8 * 1024 * 1024) throw fileInvalid('封面不能超过8MB，文件内容不能为空');
      const handle = await open(file.path, 'r');
      const header = Buffer.alloc(16);
      try { await handle.read(header, 0, 16, 0); } finally { await handle.close(); }
      const valid = file.mimetype === 'video/mp4' ? header.toString('ascii', 4, 8) === 'ftyp'
        : file.mimetype === 'video/webm' ? header.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]))
        : file.mimetype === 'image/jpeg' ? header[0] === 0xff && header[1] === 0xd8 && header[2] === 0xff
        : file.mimetype === 'image/png' ? header.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
        : header.toString('ascii', 0, 4) === 'RIFF' && header.toString('ascii', 8, 12) === 'WEBP';
      if (!valid) throw fileInvalid('文件内容与类型不匹配，请选择有效的图片或视频');
      const id = path.basename(file.filename, path.extname(file.filename));
      ok(res, await registerMedia(id, file.filename, file.mimetype, file.size, req.user!.id));
    } catch (error) { await unlink(file.path).catch(() => {}); throw error; }
  } catch (error) { next(error); }
}
export async function readCourseMedia(req: Request, res: Response): Promise<void> {
  const id = req.params.id;
  const token = req.query.t;
  if (typeof token !== 'string' || !/^[a-f0-9]{32}$/.test(token) || !timingSafeEqual(Buffer.from(token), Buffer.from(signature(id)))) throw forbidden('视频或封面链接无效');
  const rows = await query<RowDataPacket[]>('SELECT filename, mime FROM course_media WHERE id = ?', [id]);
  if (!rows[0] || !/^[a-f0-9-]+\.(mp4|webm|jpg|png|webp|svg)$/.test(rows[0].filename)) throw notFound('资源不存在');
  res.set({ 'Content-Type': rows[0].mime, 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'private, max-age=3600' });
  if (rows[0].mime === 'image/svg+xml') res.set('Content-Security-Policy', "default-src 'none'; sandbox");
  // Express sendFile 原生处理 Range / HEAD / If-Range，视频不进入应用内存。
  await new Promise<void>((resolve, reject) => res.sendFile(path.join(courseMediaRoot, rows[0].filename), error => {
    if (!error) { resolve(); return; }
    if ((error as Error & { status?: number }).status === 416) { res.status(416).end(); resolve(); return; }
    if (res.headersSent || req.aborted) { res.end(); resolve(); return; }
    reject(notFound('资源不存在或已被移除'));
  }));
}
