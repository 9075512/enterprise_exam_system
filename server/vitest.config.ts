import { defineConfig } from 'vitest/config';

/**
 * 后端测试配置。
 * - 运行环境为 Node；
 * - 测试文件位于 src 下 `*.test.ts`；
 * - setupFiles 先注入测试库环境变量（DB_NAME → *_test），再加载业务模块；
 * - 串行执行（单库集成测试避免并发写冲突）。
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    setupFiles: ['./src/test/setup-env.ts'],
    globals: true,
    fileParallelism: false,
    testTimeout: 30000,
    hookTimeout: 30000,
  },
});
