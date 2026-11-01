import { checkCourseSchema } from '../db/courseSchemaCheck.js';
import { closePool } from '../db/pool.js';
import { env } from '../config/env.js';

async function main(): Promise<void> {
  if (env.PRACTICE_ONLY) return;
  await checkCourseSchema();
}
main()
  .then(() => console.log('课程绑定数据库结构检查通过'))
  .catch(error => {
    console.error('课程数据库结构未就绪，停止发布。请先由数据库维护账号执行课程增量迁移（db:migrate:courses），再重新部署。应用账号无需新增 DDL 权限。');
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(closePool);
