/**
 * 附件对象存储（v1.8④ U4）—— **存储抽象 + 本地磁盘实现**（零依赖）。
 *
 * 背景：v1.7③ 的简答富文本作答把图片以 `data:image/...;base64` **内联**在 HTML 里，
 * 请求体可达数 MB。v1.8④ 改为「粘贴/选图 → 上传 → 回填站内 URL」，请求体回落至纯文本量级。
 *
 * 设计：
 * - `AttachmentStore` 为存储抽象（`save` / `read` / `remove` / `stat`），本期实现为**本地磁盘**；
 *   后续接云对象存储（OBS/COS/S3）只需新增一个实现并替换 `attachmentStore`。
 * - 目录结构：`<STORAGE_DIR>/yyyy/MM/<id><ext>`，按年月分目录避免单目录文件过多。
 * - **文件名完全由服务端生成**（随机 id + 白名单扩展名），绝不接受客户端路径 → 天然杜绝路径穿越。
 */
import { createReadStream } from 'node:fs';
import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { env, serverRoot } from '../config/env.js';

/** 存储抽象（便于替换为云对象存储）。 */
export interface AttachmentStore {
  /** 写入对象，返回存储键（相对路径，形如 `2026/10/<id>.png`）。 */
  save(buffer: Buffer, ext: string): Promise<string>;
  /** 读取对象全部字节。 */
  read(key: string): Promise<Buffer>;
  /** 创建读取流（用于大文件流式响应）。 */
  createStream(key: string): NodeJS.ReadableStream;
  /** 对象是否存在。 */
  exists(key: string): Promise<boolean>;
  /** 删除对象（不存在时不报错）。 */
  remove(key: string): Promise<void>;
}

/** 存储根目录（绝对路径；相对配置以 server 根目录为锚点）。 */
export const storageRoot = path.isAbsolute(env.STORAGE_DIR)
  ? env.STORAGE_DIR
  : path.resolve(serverRoot, env.STORAGE_DIR);

/** 校验存储键：仅允许 `数字/数字/文件名` 形态（拒绝 `..`、反斜杠、绝对路径）。 */
export function isSafeStorageKey(key: string): boolean {
  return /^\d{4}\/\d{2}\/[A-Za-z0-9_-]+\.[a-z0-9]{2,5}$/.test(key);
}

/** 按 `yyyy/MM/` 拼出相对目录（本地时间）。 */
function monthDir(now = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  return `${y}/${m}`;
}

/** 本地磁盘实现。 */
const localStore: AttachmentStore = {
  async save(buffer: Buffer, ext: string): Promise<string> {
    const id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
    const key = `${monthDir()}/${id}.${ext}`;
    const abs = path.join(storageRoot, key);
    await mkdir(path.dirname(abs), { recursive: true });
    await writeFile(abs, buffer);
    return key;
  },

  async read(key: string): Promise<Buffer> {
    return readFile(resolveKey(key));
  },

  createStream(key: string): NodeJS.ReadableStream {
    return createReadStream(resolveKey(key));
  },

  async exists(key: string): Promise<boolean> {
    try {
      const info = await stat(resolveKey(key));
      return info.isFile();
    } catch {
      return false;
    }
  },

  async remove(key: string): Promise<void> {
    await rm(resolveKey(key), { force: true });
  },
};

/** 把存储键安全解析为绝对路径（非法键直接抛错，绝不拼接）。 */
function resolveKey(key: string): string {
  if (!isSafeStorageKey(key)) throw new Error(`非法的存储键：${key}`);
  return path.join(storageRoot, key);
}

/** 当前生效的附件存储实现（替换点：未来接云对象存储在此切换）。 */
export const attachmentStore: AttachmentStore = localStore;

/** 允许的图片类型 → 扩展名（白名单）。 */
export const ALLOWED_IMAGE_TYPES: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/bmp': 'bmp',
};
