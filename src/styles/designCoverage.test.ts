import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve, relative, sep } from 'node:path';
import { parse as parseSfc } from '@vue/compiler-sfc';
import { parse } from '@vue/compiler-dom';
const root = process.cwd();
const spec = JSON.parse(readFileSync(resolve(root, 'docs/ui-workbuddy/specification.json'), 'utf8'));
const catalog = JSON.parse(readFileSync(resolve(root, 'docs/ui-workbuddy/coverage/catalog.json'), 'utf8')).pages as Array<{ file: string; route: string | null; layout: string; states: string[]; desktop: string; mobile: string; overlays: unknown[] }>;
function files(dir: string): string[] { return readdirSync(dir, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? files(resolve(dir, entry.name)) : entry.name.endsWith('.vue') ? [relative(root, resolve(dir, entry.name)).split(sep).join('/')] : []); }
describe('全页面设计覆盖', () => {
  it('每个实际页面都有设计记录，并在实际模板中采用登记的布局', () => {
    for (const file of files(resolve(root, 'src/views')).filter(file => file.endsWith('Page.vue'))) {
      const entry = catalog.find(item => item.file === file && item.route);
      expect(entry, `${file} 缺少设计`).toBeDefined();
      const template = parseSfc(readFileSync(resolve(root, file), 'utf8')).descriptor.template!.content;
      expect(template, `${file} 未实施对应模板`).toContain(`data-ui-layout="${entry!.layout}"`);
    }
  });
  it('视图、共享组件和全局框架中的弹窗均有设计记录', () => {
    for (const file of [...files(resolve(root, 'src/views')), ...files(resolve(root, 'src/components')), ...files(resolve(root, 'src/layouts'))]) {
      const template = parseSfc(readFileSync(resolve(root, file), 'utf8')).descriptor.template?.content ?? '';
      if (!/<el-(dialog|drawer)\b/.test(template)) continue;
      expect(catalog.some(item => item.file === file && item.overlays.length > 0), `${file} 的弹窗缺少设计`).toBe(true);
      expect(() => parse(template)).not.toThrow();
    }
  });
  it('每个页面和组件设计同时包含桌面、移动与五种状态规范', () => {
    for (const entry of catalog) {
      expect(entry.desktop, entry.file).toBeTruthy(); expect(entry.mobile, entry.file).toBeTruthy();
      expect(entry.states, entry.file).toEqual(['ready', 'loading', 'empty', 'error', 'forbidden']);
    }
  });
  it('生效基础尺寸与确认的设计规范一致', () => {
    const variables = readFileSync(resolve(root, 'src/styles/variables.scss'), 'utf8');
    for (const [name, value] of [['radius-lg', spec.tokens.cardRadius], ['radius-base', spec.tokens.controlRadius], ['sidebar-width', spec.tokens.sidebar], ['header-height', spec.tokens.header], ['mobile-header-height', spec.tokens.mobileHeader], ['page-padding', spec.tokens.pagePadding]]) {
      expect(variables).toMatch(new RegExp(`\\$${name}\\s*:\\s*${value}px`));
    }
  });
});
