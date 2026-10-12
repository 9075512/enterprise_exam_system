import { defineConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue';
import { fileURLToPath, URL } from 'node:url';

// 独立 Vitest 配置：环境为 jsdom；纯函数单测与（后续）组件测试共用。
export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.ts'],
    globals: false,
    // 串行执行测试文件：规避 Windows 沙箱环境下并行 worker 写临时文件触发的 EPERM。
    fileParallelism: false,
  },
});
