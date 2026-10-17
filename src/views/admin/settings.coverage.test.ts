/**
 * 系统设置页「结构完整性」护栏（v1.9 重排后新增）。
 *
 * 为什么用「读源码文本」而不是挂载组件：本页 50+ 个字段是纯声明式表单，
 * 最容易出的两类事故是——
 *   ① 后端加了设置项，前端页面忘了加控件（静默不可配，如 v1.8③ 的自动归档三项）；
 *   ② 页面加了控件，但忘了登记到 FIELD_TAB，导致保存校验失败时无法自动定位到出错标签页。
 * 这两类都只需要「字段集合 ↔ 页面文本」的一致性断言，读文本比挂载组件更稳、更快。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { SETTINGS_DEFAULTS } from '@/constants/settings';

// vitest 的 jsdom 环境下 import.meta.url 不是 file:// 协议，故按项目根目录解析路径
// （vitest 的 cwd 即项目根目录）。
const page = readFileSync(resolve(process.cwd(), 'src/views/admin/SettingsPage.vue'), 'utf8');

/** 抽出对象字面量的键值对（仅匹配 `  key: 'value',` 形式的顶层条目）。 */
function entriesOf(block: string): Array<[string, string]> {
  return [...block.matchAll(/^\s{2}([A-Za-z][A-Za-z0-9]*):\s*'([^']+)',/gm)].map((m) => [m[1], m[2]]);
}

function blockOf(startMarker: string): string {
  const start = page.indexOf(startMarker);
  expect(start, `未找到 ${startMarker}`).toBeGreaterThan(-1);
  const end = page.indexOf('\n};', start);
  return page.slice(start, end);
}

const settingKeys = Object.keys(SETTINGS_DEFAULTS) as Array<keyof typeof SETTINGS_DEFAULTS>;
const editableSettingKeys = settingKeys;
const fieldTab = Object.fromEntries(entriesOf(blockOf('const FIELD_TAB')) as Array<[string, string]>);
const tabLabel = Object.fromEntries(entriesOf(blockOf('const TAB_LABEL')) as Array<[string, string]>);
const tabDesc = Object.fromEntries(entriesOf(blockOf('const TAB_DESC')) as Array<[string, string]>);
const panes = [...page.matchAll(/<el-tab-pane label="([^"]+)" name="([^"]+)"/g)].map((m) => ({
  label: m[1],
  name: m[2],
}));

describe('系统设置页 · 标签页定义', () => {
  it('标签页数量与 TAB_LABEL / TAB_DESC 完全一致', () => {
    expect(panes.length).toBe(7);
    expect(panes.map((p) => p.name).sort()).toEqual(Object.keys(tabLabel).sort());
    expect(panes.map((p) => p.name).sort()).toEqual(Object.keys(tabDesc).sort());
  });

  it('每个标签页都有非空的一句话说明', () => {
    for (const name of Object.keys(tabDesc)) {
      expect(tabDesc[name].length, name).toBeGreaterThan(10);
    }
  });

  it('每个标签页都用同一个文案渲染说明（模板里引用了 TAB_DESC）', () => {
    expect(page).toContain('TAB_DESC.exam');
    // 每个 pane 各自引用一次说明
    expect([...page.matchAll(/settings-page__desc/g)]).toHaveLength(7);
  });
});

describe('系统设置页 · 字段覆盖', () => {
  it('后端每一个设置项在本页都有对应控件（防止新增设置后静默不可配）', () => {
    const missing = editableSettingKeys.filter((k) => !new RegExp(`form\\.${k}\\b`).test(page));
    expect(missing).toEqual([]);
  });

  it('本页引用的 form 字段都是真实设置项（防止拼错字段名后静默失效）', () => {
    const used = [...new Set([...page.matchAll(/form\.([A-Za-z][A-Za-z0-9]*)/g)].map((m) => m[1]))];
    const unknown = used.filter((u) => !settingKeys.includes(u as keyof typeof SETTINGS_DEFAULTS));
    expect(unknown).toEqual([]);
  });

  it('每一个设置项都登记了所属标签页（保存校验失败时可自动定位）', () => {
    const missing = editableSettingKeys.filter((k) => !(k in fieldTab));
    expect(missing).toEqual([]);
  });

  it('FIELD_TAB 不包含未知设置项，且指向的都是真实标签页', () => {
    const unknownKeys = Object.keys(fieldTab).filter(
      (k) => !settingKeys.includes(k as keyof typeof SETTINGS_DEFAULTS),
    );
    expect(unknownKeys).toEqual([]);
    const unknownTabs = Object.values(fieldTab).filter((t) => !(t in tabLabel));
    expect(unknownTabs).toEqual([]);
  });

  it('每个标签页至少承载一个设置项（避免出现空标签页）', () => {
    for (const name of Object.keys(tabLabel)) {
      const count = Object.values(fieldTab).filter((t) => t === name).length;
      expect(count, `${name} 应有设置项`).toBeGreaterThan(0);
    }
  });
});

describe('系统设置页 · 重排后不再残留旧结构', () => {
  it('已移除旧版 4 个混装标签页名', () => {
    for (const legacy of ['"考试规则"', '"列表与导入"', '"网站信息"', '"消息通知"']) {
      expect(page.includes(`<el-tab-pane label=${legacy}`), legacy).toBe(false);
    }
  });

  it('每个标签页内的分组小标题都带一句话补充说明', () => {
    const titles = [...page.matchAll(/settings-page__section-title">([^<]+)</g)].map((m) => m[1]);
    const notes = [...page.matchAll(/settings-page__section-note/g)];
    expect(titles.length).toBeGreaterThan(0);
    expect(notes.length).toBe(titles.length);
  });
});
