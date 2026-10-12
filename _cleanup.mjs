// 临时清理脚本：删除旧 React 前端的 node_modules 与 package-lock.json。
// 运行后立即删除本脚本。
import { rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = dirname(fileURLToPath(import.meta.url));
for (const target of ['node_modules', 'package-lock.json']) {
  const p = join(root, target);
  rmSync(p, { recursive: true, force: true });
  console.log('removed:', target);
}
