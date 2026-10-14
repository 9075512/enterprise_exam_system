/**
 * 练题端样式护栏（与管理端规范 §2.3 / §2.4 同源）。
 *
 * 背景：练题端 v2.2 合规审计发现——语义原色（success / warning / error / info）
 * 对白底不达 WCAG AA 正文标准 4.5:1（如 warning #F59E0B 仅 2.15:1），
 * 但被若干处直接当作文字色使用。本护栏把结论落成断言，防止回归。
 *
 * 规则：
 * 1) `color: $color-<semantic>` 一律改用 `-text` 档（700 档，≥ 4.5:1）；
 *    原色只可用于图形/描边（border-*-color / background / 圆点）。
 * 2) 语义三件套（-bg / -border / -text）必须在 variables.scss 里定义齐全。
 * 3) 删除/错误类浅底走 token，不得硬编码 #fef2f2 / #fecaca。
 * 4) v2.2 主色唯一性：练题端只有 $practice-primary 一套主色，
 *    不得再出现 $color-primary / $color-secondary 系列、不得硬编码主色、
 *    分类色不得回退到 violet；Element Plus 主色须与 $practice-primary 同源。
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(process.cwd(), 'src');
const stripComments = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

function collect(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      collect(full, out);
    } else if (
      /\.(vue|scss)$/.test(entry.name) ||
      (entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts'))
    ) {
      out.push(full);
    }
  }
  return out;
}

const files = collect(ROOT);
/** 业务层文件（不含 styles/ —— 那里是 token 源与 Element Plus 覆盖层，写 hex 属正常） */
const businessFiles = files.filter((f) => /[\\/](views|components|layouts)[\\/]/.test(f));
const SEMANTICS = ['success', 'warning', 'error', 'info'] as const;

describe('练题端 · 语义色作文字护栏', () => {
  it('不出现 color: $color-<语义原色>（一律用 -text 档）', () => {
    const offenders: string[] = [];
    for (const file of files) {
      const body = stripComments(readFileSync(file, 'utf8'));
      // 负向后顾排除 border-color / background-color 等复合属性
      const hits = body.match(new RegExp(`(?<![-\\w])color:\\s*\\$color-(?:${SEMANTICS.join('|')})\\s*;`, 'g'));
      if (hits) offenders.push(`${file} → ${hits.join(' | ')}`);
    }
    expect(offenders).toEqual([]);
  });

  it('语义三件套（-bg / -border / -text）定义齐全', () => {
    const vars = readFileSync(resolve(ROOT, 'styles/variables.scss'), 'utf8');
    for (const key of SEMANTICS) {
      for (const suffix of ['bg', 'border', 'text']) {
        expect(vars).toMatch(new RegExp(`\\$color-${key}-${suffix}:\\s*#[0-9a-fA-F]{6}`));
      }
    }
  });

  it('错误类浅底走 token，不硬编码 #fef2f2 / #fecaca', () => {
    const offenders = businessFiles.filter((file) =>
      /#fef2f2|#fecaca/i.test(stripComments(readFileSync(file, 'utf8'))),
    );
    expect(offenders).toEqual([]);
  });

  it('规范外色值 #EEF2FF（indigo-50）不出现', () => {
    const offenders = files.filter((file) =>
      /#EEF2FF/i.test(stripComments(readFileSync(file, 'utf8'))),
    );
    expect(offenders).toEqual([]);
  });
});

describe('练题端 · 主色唯一性护栏', () => {
  it('业务层不硬编码主色（#1d4ed8 / #2563eb / rgb(29,78,216)）', () => {
    const offenders = businessFiles.filter((file) =>
      /#1d4ed8|#2563eb|29\s*,\s*78\s*,\s*216/i.test(stripComments(readFileSync(file, 'utf8'))),
    );
    expect(offenders).toEqual([]);
  });

  it('不再引用已删除的 $color-primary / $color-secondary 系列', () => {
    const offenders = files.filter((file) =>
      /\$color-(primary|secondary)/.test(stripComments(readFileSync(file, 'utf8'))),
    );
    expect(offenders).toEqual([]);
  });

  it('分类色不使用 violet（#7c3aed / #4f46e5）', () => {
    const offenders = files.filter((file) =>
      /#7c3aed|#4f46e5/i.test(stripComments(readFileSync(file, 'utf8'))),
    );
    expect(offenders).toEqual([]);
  });

  it('Element Plus 主色与 $practice-primary 同源', () => {
    const vars = readFileSync(resolve(ROOT, 'styles/variables.scss'), 'utf8');
    const el = readFileSync(resolve(ROOT, 'styles/element/index.scss'), 'utf8');
    expect(vars).toMatch(/\$practice-primary:\s*#1d4ed8/i);
    expect(el).toMatch(/'base':\s*#1d4ed8/i);
  });
});
