import { env } from '../config/env.js';
import { closePool } from '../db/pool.js';
import { checkAppReleaseSchema } from '../modules/apps/apps.schema.js';

async function main() {
  if (env.PRACTICE_ONLY) return;
  await checkAppReleaseSchema();
  console.log('App 版本表与接口所需字段检查通过（只读）');
}
main().catch(error => {
  console.error('App 数据结构检查失败，拒绝激活新版本。请先由数据库维护账号执行 App 表初始化；不要为应用账号增加建表权限。');
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}).finally(closePool);
