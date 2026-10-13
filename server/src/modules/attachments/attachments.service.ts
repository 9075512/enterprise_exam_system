/**
 * 富文本附件 —— 业务逻辑层（v1.8④ U4）。
 *
 * 职责：上传校验（类型 / 体积）→ 落盘（存储抽象）→ 落库元数据 → 回传站内 URL；
 * 以及按 id 读取（**双通道鉴权**，见 `verifyAccess`）。
 *
 * ### 为什么需要「签名 URL」
 * 富文本作答以 `v-html` 渲染，浏览器对 `<img src="...">` **无法携带 `Authorization` 头**，
 * 仅靠 Bearer 鉴权会导致作答图片全部裂图。因此上传后返回的 URL 形如
 * `/api/attachments/<id>?t=<hmac>`：`t` = `HMAC-SHA256(JWT_SECRET, 'attachment:' + id)` 的定长摘要，
 * 只有服务端能生成，且**不含任何用户信息**、可长期保存（附件不可变，无需轮换）。
 * 读取时二者满足其一即可：合法 Bearer（且本人或 admin/author）或合法签名。
 */
import { createHmac, timingSafeEqual } from 'node:crypto';
import { env } from '../../config/env.js';
import { badRequest, fileInvalid, forbidden, notFound } from '../../utils/errors.js';
import { genId } from '../../utils/id.js';
import { ALLOWED_IMAGE_TYPES, attachmentStore } from '../../utils/attachmentStore.js';
import { getSettings } from '../settings/settings.service.js';
import * as repo from './attachments.repo.js';
import type { AttachmentDto, Role } from '../../types/domain.js';

/** 附件操作者（`req.user` 的可赋值子集，避免与 Express 类型声明耦合）。 */
export interface AttachmentActor {
  id: string;
  role: Role;
}

/** 附件类型（本期仅图片作答）。 */
export const ATTACHMENT_KIND_IMAGE = 'image';

/** 存储层硬上限（先于业务上限生效，避免超大体进入内存后才发现）。 */
export const HARD_MAX_BYTES = 16 * 1024 * 1024;

/** 允许读取他人附件的角色（阅卷需要）。 */
const READ_ANY_ROLES = new Set(['admin', 'author']);

/** 计算附件签名。 */
export function signAttachment(id: string): string {
  return createHmac('sha256', env.JWT_SECRET).update(`attachment:${id}`).digest('hex').slice(0, 32);
}

/** 校验附件签名（定长比较，防时序侧信道）。 */
export function verifyAttachmentSignature(id: string, signature: string): boolean {
  if (typeof signature !== 'string' || signature.length !== 32) return false;
  const expected = signAttachment(id);
  return timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
}

/** 附件访问 URL（含签名，可直接用于 `<img src>`）。 */
export function attachmentUrl(id: string): string {
  return `/api/attachments/${id}?t=${signAttachment(id)}`;
}

function toDto(row: repo.AttachmentRow): AttachmentDto {
  return {
    id: row.id,
    url: attachmentUrl(row.id),
    kind: row.kind,
    mime: row.mime,
    size: Number(row.size),
    createdAt: new Date(row.created_at).toISOString(),
  };
}

/**
 * 上传图片附件。
 *
 * @param input multer 内存文件（`buffer` / `mimetype` / `size`）
 * @param ownerId 上传者（当前登录用户）
 */
export async function uploadImage(
  input: { buffer: Buffer; mimetype: string; size: number },
  ownerId: string,
): Promise<AttachmentDto> {
  const settings = await getSettings();
  const maxBytes = settings.richTextImageMaxMb * 1024 * 1024;

  const ext = ALLOWED_IMAGE_TYPES[input.mimetype.toLowerCase()];
  if (!ext) throw fileInvalid('仅支持 PNG / JPG / GIF / WebP / BMP 图片');
  if (input.size <= 0 || input.buffer.length === 0) throw fileInvalid('图片内容为空');
  if (input.size > maxBytes) throw fileInvalid(`单张图片不能超过 ${settings.richTextImageMaxMb}MB`);

  const key = await attachmentStore.save(input.buffer, ext);
  const id = genId('att-');
  await repo.insert({
    id,
    ownerId,
    kind: ATTACHMENT_KIND_IMAGE,
    mime: input.mimetype.toLowerCase(),
    size: input.size,
    storageKey: key,
  });

  const row = await repo.findById(id);
  if (!row) throw badRequest('附件保存失败，请重试');
  return toDto(row);
}

/** 读取校验结果（含元数据）。 */
export interface AttachmentAccessResult {
  row: repo.AttachmentRow;
}

/**
 * 校验读取权限（双通道）：
 *  1. 带合法签名 `?t=`（`<img>` 场景）；
 *  2. 带 Bearer 且为本人或 admin/author（接口/调试场景）。
 */
export function verifyAccess(
  row: repo.AttachmentRow,
  actor: AttachmentActor | undefined,
  signature: unknown,
): void {
  if (typeof signature === 'string' && signature !== '' && verifyAttachmentSignature(row.id, signature)) {
    return;
  }
  if (!actor) throw forbidden('无权访问该附件');
  if (actor.id === row.owner_id) return;
  if (READ_ANY_ROLES.has(actor.role)) return;
  throw forbidden('无权访问该附件');
}

/** 按 id 取附件（含权限校验），返回元数据供路由流式响应。 */
export async function getForRead(
  id: string,
  actor: AttachmentActor | undefined,
  signature: unknown,
): Promise<repo.AttachmentRow> {
  const row = await repo.findById(id);
  if (!row) throw notFound('附件不存在或已被删除');
  verifyAccess(row, actor, signature);
  // 文件可能被人工清理：显式给出 1004，避免流式响应中途报错
  if (!(await attachmentStore.exists(row.storage_key))) throw notFound('附件文件已丢失');
  return row;
}
