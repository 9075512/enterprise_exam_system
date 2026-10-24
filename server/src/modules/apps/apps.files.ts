import { createReadStream } from 'node:fs';
import { mkdir, open, stat } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { env, serverRoot } from '../../config/env.js';
import { badRequest } from '../../utils/errors.js';

export const appStorage = path.resolve(serverRoot, env.APP_RELEASES_DIR);
export const MAX_APK_SIZE = 200 * 1024 * 1024;
export async function prepareAppStorage() { await mkdir(appStorage, { recursive: true }); }
export function apkPath(key: string): string {
  if (!/^[a-f0-9-]{36}\.apk$/.test(key)) throw badRequest('安装包标识不合法');
  return path.join(appStorage, key);
}

/** Read the ZIP central directory without extracting or executing uploaded content. */
export async function inspectApk(filePath: string): Promise<{ size: number; sha256: string }> {
  const file = await open(filePath, 'r');
  try {
    const size = (await file.stat()).size;
    if (size < 22 || size > MAX_APK_SIZE) throw badRequest('安装包大小须在 1 字节至 200 MB 之间');
    const tail = Buffer.alloc(Math.min(size, 65557));
    await file.read(tail, 0, tail.length, size - tail.length);
    let end = -1;
    for (let i = tail.length - 22; i >= 0; i--) {
      if (tail.readUInt32LE(i) === 0x06054b50 && i + 22 + tail.readUInt16LE(i + 20) === tail.length) { end = i; break; }
    }
    if (end < 0) throw badRequest('文件不是有效的 APK 安装包');
    const length = tail.readUInt32LE(end + 12), offset = tail.readUInt32LE(end + 16);
    const count = tail.readUInt16LE(end + 10);
    if (tail.readUInt16LE(end + 4) !== 0 || length > 8 * 1024 * 1024 || offset + length > size - tail.length + end) throw badRequest('不支持此安装包 ZIP 格式');
    const directory = Buffer.alloc(length);
    await file.read(directory, 0, length, offset);
    let cursor = 0, hasManifest = false;
    for (let i = 0; i < count; i++) {
      if (cursor + 46 > length || directory.readUInt32LE(cursor) !== 0x02014b50) throw badRequest('APK 目录已损坏');
      const nameLength = directory.readUInt16LE(cursor + 28);
      const next = cursor + 46 + nameLength + directory.readUInt16LE(cursor + 30) + directory.readUInt16LE(cursor + 32);
      if (next > length) throw badRequest('APK 目录已损坏');
      if (directory.toString('utf8', cursor + 46, cursor + 46 + nameLength) === 'AndroidManifest.xml') hasManifest = true;
      cursor = next;
    }
    if (!hasManifest) throw badRequest('安装包缺少 AndroidManifest.xml，请选择 APK 文件');
    const digest = createHash('sha256');
    for await (const chunk of createReadStream(filePath)) digest.update(chunk);
    return { size, sha256: digest.digest('hex') };
  } finally { await file.close(); }
}

export async function assertApkExists(key: string) {
  try { if (!(await stat(apkPath(key))).isFile()) throw new Error(); }
  catch { throw badRequest('安装包文件不可用，请重新上传'); }
}
