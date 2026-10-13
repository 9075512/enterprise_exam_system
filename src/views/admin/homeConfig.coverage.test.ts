/**
 * 首页配置页 · 结构护栏（v2.0⑥）。
 *
 * 目的：快捷入口是**固定目录**（服务端 `homeProfile.service.HOME_SHORTCUT_CATALOG`），
 * 页面必须**按目录渲染**而不是硬编码每个入口，否则后续目录扩容时新入口会在管理端漏出。
 *
 * 另有两条前后端口径硬约定（页面上以字面量体现，改动需同步服务端）：
 *   - 文案覆盖上限 12 字（服务端 zod `.max(12)`）；
 *   - 推荐题库最多 6 个（服务端 `MAX_RECOMMENDED_BANKS = 6`）。
 *
 * 读取 SFC 源码文本做静态断言（不挂载组件），成本低、跨文件改动即时报错。
 * 注意：vitest 的 jsdom 环境 `import.meta.url` 非 file:// 协议 → 用 `resolve(process.cwd(), …)` 定位。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const page = readFileSync(resolve(process.cwd(), 'src/views/admin/HomeConfigPage.vue'), 'utf8');

describe('首页配置页 · 结构护栏', () => {
  it('快捷入口按服务端目录渲染（不硬编码入口 key）', () => {
    expect(page).toContain('v-for="c in catalog"');
    // 目录 key 不应作为字面量出现在模板中（否则新增目录项会漏渲染）
    for (const key of ['my-exams', 'my-scores', 'my-retakes', 'notifications']) {
      expect(page.includes(`'${key}'`), `入口 ${key} 被硬编码，应改为目录驱动`).toBe(false);
    }
  });

  it('全局默认哨兵 id 与后端一致（*）', () => {
    expect(page).toContain("const GLOBAL_ID = '*'");
  });

  it('文案覆盖上限 12 字（与后端 zod 校验一致）', () => {
    expect(page).toContain('maxlength="12"');
  });

  it('推荐题库数量上限 6（与后端 MAX_RECOMMENDED_BANKS 一致）', () => {
    expect(page).toContain(':multiple-limit="6"');
  });

  it('只列「已开放对外练题」的题库（与后端保存校验口径一致）', () => {
    expect(page).toContain('b.allowPractice');
  });

  it('保存 / 重置均走专用接口，且保存前校验「至少一个入口」', () => {
    expect(page).toContain('saveConfig(');
    expect(page).toContain('resetConfig(');
    expect(page).toContain('至少保留一个快捷入口');
  });
});
