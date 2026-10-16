/**
 * 设计 token 护栏测试（沿用 v2.1 语义色与对比度约束；历史规范见 overview.md）
 *
 * 两道护栏：
 * 1) 同源：variables.scss 与 constants/theme.ts 的语义色必须逐值一致
 *    （约定：新增色值必须同改两处，漏改即测试失败）。
 * 2) 可访问性：语义 -Text 档对白底必须 ≥ 4.5:1（WCAG 2.1 AA 正文）；
 *    语义原色不达标者只允许用于图形，一旦有人把它当正文用，这里先拦住。
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { THEME } from './theme';

// ---------- WCAG 2.1 相对亮度 / 对比度 ----------
function channel(v: number): number {
  const s = v / 255;
  return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}
function luminance(hex: string): number {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}
/** 两色对比度（与顺序无关） */
function contrast(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  const hi = Math.max(la, lb);
  const lo = Math.min(la, lb);
  return (hi + 0.05) / (lo + 0.05);
}

// ---------- 从 variables.scss 解析出 $var: #hex; ----------
// 注：jsdom 环境下 import.meta.url 非 file 协议，按项目根（vitest cwd）解析。
const SCSS_PATH = resolve(process.cwd(), 'src/styles/variables.scss');
const scss = readFileSync(SCSS_PATH, 'utf8');
function scssVar(name: string): string {
  const m = scss.match(new RegExp(`\\$${name}\\s*:\\s*(#[0-9a-fA-F]{6})`));
  if (!m) throw new Error(`variables.scss 缺少色值变量 $${name}`);
  return m[1].toUpperCase();
}

describe('设计 token · SCSS ↔ TS 同源', () => {
  // 语义色三件套（SCSS 变量名 → THEME 键）
  const PAIRS: Array<[string, keyof typeof THEME]> = [
    ['category-blue', 'categoryBlue'],
    ['category-blue-soft', 'categoryBlueSoft'],
    ['category-teal', 'categoryTeal'],
    ['category-teal-soft', 'categoryTealSoft'],
    ['category-violet', 'categoryViolet'],
    ['category-violet-soft', 'categoryVioletSoft'],
    ['category-amber', 'categoryAmber'],
    ['category-amber-soft', 'categoryAmberSoft'],
    ['color-success', 'success'],
    ['color-success-bg', 'successBg'],
    ['color-success-border', 'successBorder'],
    ['color-success-text', 'successText'],
    ['color-warning', 'warning'],
    ['color-warning-bg', 'warningBg'],
    ['color-warning-border', 'warningBorder'],
    ['color-warning-text', 'warningText'],
    ['color-error', 'error'],
    ['color-error-bg', 'errorBg'],
    ['color-error-border', 'errorBorder'],
    ['color-error-text', 'errorText'],
    ['color-info', 'info'],
    ['color-info-bg', 'infoBg'],
    ['color-info-border', 'infoBorder'],
    ['color-info-text', 'infoText'],
    ['color-info-50', 'info50'],
    ['color-primary-50', 'primary50'],
    ['color-primary-soft', 'primarySoft'],
    ['color-primary-border', 'primaryBorder'],
    ['color-secondary', 'secondary'],
    ['color-secondary-soft', 'secondarySoft'],
    ['border-color', 'border'],
    ['line-strong', 'lineStrong'],
    ['bg-paper', 'surface'],
    ['color-table-hover', 'tableHover'],
    ['color-neutral-bg', 'neutralBg'],
    ['text-body', 'textBody'],
  ];

  it.each(PAIRS)('$%s 与 THEME.%s 值一致', (scssName, key) => {
    expect(scssVar(scssName)).toBe((THEME[key] as string).toUpperCase());
  });
});

describe('设计 token · 可访问性（对白底 #FFFFFF）', () => {
  const WHITE = '#FFFFFF';
  const TEXT_TOKENS: Array<[string, string]> = [
    ['successText', THEME.successText],
    ['warningText', THEME.warningText],
    ['errorText', THEME.errorText],
    ['infoText', THEME.infoText],
    ['textPrimary', THEME.textPrimary],
    ['textBody', THEME.textBody],
    ['textSecondary', THEME.textSecondary],
  ];

  it.each(TEXT_TOKENS)('%s 作正文达 AA（≥ 4.5:1）', (_name, hex) => {
    expect(contrast(hex, WHITE)).toBeGreaterThanOrEqual(4.5);
  });

  it('语义原色不达正文标准，仅可作图形（记录现状，防止被误用为文字）', () => {
    // 这几条断言是「反向护栏」：如果哪天原色被调亮到能当正文用，
    // 说明有人误改了 token 语义，应当同步更新规范文档而非默默放行。
    expect(contrast(THEME.success, WHITE)).toBeLessThan(4.5);
    expect(contrast(THEME.warning, WHITE)).toBeLessThan(4.5);
    expect(contrast(THEME.info, WHITE)).toBeLessThan(4.5);
  });

  it('禁用文本色 n-400 不达正文标准（只能用于禁用/装饰）', () => {
    expect(contrast(THEME.textDisabled, WHITE)).toBeLessThan(4.5);
  });
});
