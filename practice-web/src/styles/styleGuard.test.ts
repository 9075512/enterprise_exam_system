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
 * 5) v3.1 方向 C 换肤：去 3px 左缘强调条（改图标块 + 发丝线卡片）、
 *    圆角不越 10px（胶囊 99px 与显式 radius-exception 除外）、
 *    顶栏为白底承载面、卡片零投影。
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

describe('练题端 · v3.1 方向 C 换肤护栏', () => {
  it('不再出现 3px 左缘强调条（改为图标块 + 发丝线卡片）', () => {
    const offenders = businessFiles.filter((file) =>
      /border-left:\s*3px\b/i.test(stripComments(readFileSync(file, 'utf8'))),
    );
    expect(offenders).toEqual([]);
  });

  it('圆角不越 10px（胶囊 99px 与显式 radius-exception 除外）', () => {
    const offenders: string[] = [];
    for (const file of businessFiles) {
      // 注：此处不剥离注释——`radius-exception` 标记本身就是注释，需保留原文判断
      for (const line of readFileSync(file, 'utf8').split('\n')) {
        const m = line.match(/border-radius:\s*(\d{2,})px/);
        if (!m) continue;
        const value = Number(m[1]);
        if (value <= 10 || value === 99) continue;
        if (/radius-exception/.test(line)) continue;
        offenders.push(`${file} → ${line.trim()}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('顶栏为白底承载面（去 v1.7 深蓝实色块）', () => {
    const vars = readFileSync(resolve(ROOT, 'styles/variables.scss'), 'utf8');
    const layout = readFileSync(resolve(ROOT, 'layouts/PracticeLayout.vue'), 'utf8');
    expect(vars).toMatch(/\$practice-header:\s*#[fF]{6}\b/);
    expect(layout).toMatch(/background:\s*\$practice-header/);
  });

  it('卡片零投影（层次交给发丝线；$shadow-sm = none）', () => {
    const vars = readFileSync(resolve(ROOT, 'styles/variables.scss'), 'utf8');
    const runtime = readFileSync(resolve(ROOT, 'styles/index.scss'), 'utf8');
    expect(vars).toMatch(/\$shadow-sm:\s*none/);
    // Element Plus 卡片：双写类名抬优先级后须显式去投影
    expect(runtime).toMatch(/\.el-card\.el-card[\s\S]{0,400}box-shadow:\s*none/);
  });
});

describe('练题端 · 主色唯一性护栏', () => {
  it('业务层不硬编码主色（旧 #1d4ed8 / #2563eb，新 #1268ff）', () => {
    const offenders = businessFiles.filter((file) =>
      /#1d4ed8|#2563eb|#1268ff|(29\s*,\s*78\s*,\s*216)|(11\s*,\s*91\s*,\s*255)/i.test(
        stripComments(readFileSync(file, 'utf8')),
      ),
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

  it('Element Plus 主色与 $practice-primary 同源（v3.1 收敛到 C 方向 #1268ff）', () => {
    const vars = readFileSync(resolve(ROOT, 'styles/variables.scss'), 'utf8');
    const el = readFileSync(resolve(ROOT, 'styles/element/index.scss'), 'utf8');
    const runtime = readFileSync(resolve(ROOT, 'styles/index.scss'), 'utf8');
    expect(vars).toMatch(/\$practice-primary:\s*#1268ff/i);
    expect(el).toMatch(/'base':\s*#1268ff/i);
    expect(runtime).toMatch(/--el-color-primary:\s*#1268ff/i);
  });
});

// ---------------------------------------------------------------
// 保真度审计修复（2026-10-14）—— 练题端此前只做视觉回写，未过 computed-style 审计。
// 复核（`tools/audit-practice.mjs`，CDP 实测）发现与根应用同源的 B / A9 类缺陷：
//   B1 同类：body 无基准字号 → EP 浮层继承浏览器默认 16px（设计 14px）；
//   B2 同类：--el-input-border-color 写 :root，被 EP 在 .el-input 元素作用域重定义吃掉；
//   A9 同类：token 只有三档文字，--el-text-color-regular 落 text-3（#5a6474），偏灰一档。
// vitest 读不到 computed style —— 这里钉住「声明的作用域与值」，计算值以审计报告实测为准。
// ---------------------------------------------------------------
describe('练题端 · 保真度审计修复（B/A9 类）', () => {
  const runtime = () => readFileSync(resolve(ROOT, 'styles/index.scss'), 'utf8');
  const vars = () => readFileSync(resolve(ROOT, 'styles/variables.scss'), 'utf8');

  it('B1 同类：body 基准字号 14px（= kit/m.css body），浮层不再取浏览器默认 16px', () => {
    const src = stripComments(runtime());
    const m = src.match(/\nbody\s*\{([^}]*)\}/);
    expect(m, '未找到 body 规则').toBeTruthy();
    expect(m?.[1]).toMatch(/font-size:\s*14px/);
  });

  it('B1 补遗：body 正文行距 1.55（= kit/m.css body 的 line-height）', () => {
    const src = stripComments(runtime());
    const m = src.match(/\nbody\s*\{([^}]*)\}/);
    expect(m, '未找到 body 规则').toBeTruthy();
    expect(m?.[1]).toMatch(/line-height:\s*1\.55/);
  });

  it('A9 同类：token 层补第 4 档文字色 $text-body = #354D76（= DESIGN-C text-2）', () => {
    expect(vars()).toMatch(/\$text-body:\s*#354D76/i);
  });

  it('A9 同类：--el-text-color-regular 指向 $text-body，且不再写 #5a6474', () => {
    const src = stripComments(runtime());
    expect(src).toMatch(/--el-text-color-regular:\s*#\{\$text-body\}/);
    expect(src).not.toMatch(/--el-text-color-regular:\s*#5a6474/i);
  });

  it('B2 同类：--el-input-border-color 落到 EP 同作用域（双写 .el-input.el-input）', () => {
    const src = stripComments(runtime());
    expect(src).toMatch(/\.el-input\.el-input[\s\S]{0,200}--el-input-border-color:\s*#\{\$line-strong\}/);
  });
});
