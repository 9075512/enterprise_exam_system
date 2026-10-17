import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import AutoImport from 'unplugin-auto-import/vite';
import Components from 'unplugin-vue-components/vite';
import { ElementPlusResolver } from 'unplugin-vue-components/resolvers';
import { fileURLToPath, URL } from 'node:url';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    vue(),
    // Element Plus 按需自动引入：模板中的 <el-xxx> 与命令式 API（ElMessage 等）无需手写 import
    AutoImport({
      dts: 'src/auto-imports.d.ts',
      resolvers: [ElementPlusResolver({ importStyle: 'sass' })],
    }),
    Components({
      dts: 'src/components.d.ts',
      resolvers: [ElementPlusResolver({ importStyle: 'sass' })],
    }),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  css: {
    preprocessorOptions: {
      scss: {
        // 使用现代 Sass API，避免 legacy JS API 弃用告警
        api: 'modern',
        // 每个 SFC <style lang="scss"> 先加载被覆盖后的 EP 变量配置（保证 EP 组件样式生效）。
        // 注意：这里用「默认命名空间」而非 `as *`——避免 EP var.scss 的全局变量
        // （如 $border-color）与业务 token（$border-color 等）在同一文件中重名冲突。
        additionalData: `@use "@/styles/element/index.scss";`,
      },
    },
  },
  server: {
    port: 5173,
    open: false,
    proxy: {
      '/api': { target: 'http://localhost:3001', changeOrigin: true },
    },
  },
  // 生产预览（vite preview）：与 dev server 保持相同的 API 代理，
  // 便于在没有 dev 依赖优化开销的环境下验收构建产物。
  preview: {
    port: 4173,
    open: false,
    proxy: {
      '/api': { target: 'http://localhost:3001', changeOrigin: true },
    },
  },
});
