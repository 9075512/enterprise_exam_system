/**
 * 练题端设置页 · 结构护栏（v1.9⑤）。
 *
 * 目的：`PracticeSettings` 每新增一个字段，**必须**在 `PracticeSettingsPage.vue` 有对应控件，
 * 否则配置对管理员不可见（会在后台「悄悄存在但无法修改」）。
 *
 * 读取 SFC 源码文本做静态断言（不挂载组件），成本低、跨文件改动即时报错。
 * 注意：vitest 的 jsdom 环境 `import.meta.url` 非 file:// 协议 → 用 `resolve(process.cwd(), …)` 定位。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PRACTICE_SETTINGS_DEFAULTS } from '@/constants/practiceSettings';

const page = readFileSync(resolve(process.cwd(), 'src/views/admin/PracticeSettingsPage.vue'), 'utf8');

/** 所有设置字段名（来自前端默认值，与后端 `PracticeSettings` 一一对应）。 */
const FIELDS = Object.keys(PRACTICE_SETTINGS_DEFAULTS);

describe('练题端设置页 · 字段覆盖', () => {
  it('每个 PracticeSettings 字段都有表单控件', () => {
    const missing = FIELDS.filter((f) => !new RegExp(`practiceForm\\.${f}\\b`).test(page));
    expect(missing, `以下字段在页面上没有控件：${missing.join(', ')}`).toEqual([]);
  });

  it('页面引用但非设置字段的 practiceForm.xxx 应为空（防拼写错误）', () => {
    const used = [...new Set([...page.matchAll(/practiceForm\.([A-Za-z][A-Za-z0-9]*)/g)].map((m) => m[1]))];
    const unknown = used.filter((u) => !FIELDS.includes(u));
    expect(unknown, `以下字段不在设置类型中（疑似拼写错误）：${unknown.join(', ')}`).toEqual([]);
  });

  it('三个页面入口开关都渲染为开关控件', () => {
    for (const key of ['reportEnabled', 'wrongBookEnabled', 'favoriteEnabled']) {
      expect(page).toContain(`practiceForm.${key}`);
    }
  });

  it('题量上下限同时渲染（收敛区间）', () => {
    expect(page).toContain('practiceForm.sessionMinCount');
    expect(page).toContain('practiceForm.sessionMaxCount');
  });
});
