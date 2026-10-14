/**
 * 把 kit/ 下的 CSS / JS 内联进每个设计图页面，产出「真正自包含」的单文件 HTML。
 *
 * 为什么需要：页面原本用 <link href="../kit/c.css"> 外链资源，一旦 HTML 被
 * 沙箱 / srcdoc / blob 方式加载（预览面板、单文件分享），相对路径不解析，
 * 页面就退化成裸 HTML —— 表现为「没有样式」。内联后任何环境都能正确渲染。
 *
 * 幂等：首次运行把 <link>/<script src> 标签换成带标记的内联块；
 *       再次运行只替换标记之间的内容，方便改完 kit 后增量刷新。
 *
 * 用法（在 docs/ui-v3b 目录下）：
 *   node tools/inline-kit.mjs            # 内联
 *   node tools/inline-kit.mjs --check    # 只检查是否还有外链残留
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const KIT = path.join(ROOT, 'kit');
const CHECK_ONLY = process.argv.includes('--check');

const read = (p) => fs.readFileSync(p, 'utf8');
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const SOURCES = {
  'c.css': read(path.join(KIT, 'c.css')),
  'm.css': read(path.join(KIT, 'm.css')),
  'shell.js': read(path.join(KIT, 'shell.js')),
  'mshell.js': read(path.join(KIT, 'mshell.js')),
};

/* 每个资源：原来的外链标签 → 内联块 */
function buildRules() {
  const rules = [];
  for (const name of Object.keys(SOURCES)) {
    const isCss = name.endsWith('.css');
    const tag = isCss
      ? new RegExp(`<link[^>]*href="(?:\\.\\./)?kit/${esc(name)}"[^>]*>`, 'g')
      : new RegExp(`<script[^>]*src="(?:\\.\\./)?kit/${esc(name)}"[^>]*>\\s*</script>`, 'g');
    rules.push({ name, isCss, tag });
  }
  return rules;
}

function block(name, isCss) {
  const body = SOURCES[name];
  const note = `/* ${'='.repeat(60)}\n   kit/${name} · 自动内联，请勿直接改这里\n   源文件：docs/ui-v3b/kit/${name}\n   改完源文件后重跑：node tools/inline-kit.mjs\n   ${'='.repeat(60)} */`;
  const open = `<!--@@kit:${name}-->`;
  const close = `<!--/@@kit:${name}-->`;
  if (isCss) return `${open}\n<style>\n${note}\n${body}\n</style>\n${close}`;
  return `${open}\n<script>\n${note}\n${body}\n</script>\n${close}`;
}

function walk(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (['kit', 'tools', '_shot', 'node_modules'].includes(e.name)) continue;
      out.push(...walk(p));
    } else if (e.name.endsWith('.html')) out.push(p);
  }
  return out;
}

const files = walk(ROOT).sort();
const rules = buildRules();
let touched = 0;
const problems = [];

for (const file of files) {
  let src = read(file);
  const before = src;
  const rel = path.relative(ROOT, file).replace(/\\/g, '/');

  for (const { name, isCss, tag } of rules) {
    const marker = new RegExp(
      `<!--@@kit:${esc(name)}-->[\\s\\S]*?<!--/@@kit:${esc(name)}-->`,
      'g'
    );
    const html = block(name, isCss);
    if (marker.test(src)) src = src.replace(marker, () => html);
    else if (tag.test(src)) src = src.replace(tag, () => html);
  }

  if (CHECK_ONLY) {
    const leftover = src.match(/(?:href|src)="(?:\.\.\/)?kit\//g);
    if (leftover) problems.push(`${rel} 仍有 ${leftover.length} 处外链`);
    continue;
  }
  if (src !== before) {
    fs.writeFileSync(file, src, 'utf8');
    touched++;
  }
}

if (CHECK_ONLY) {
  console.log(`扫描 ${files.length} 个 HTML`);
  if (problems.length) {
    console.log('❌ 存在外链残留：');
    problems.forEach((p) => console.log('  - ' + p));
    process.exit(1);
  }
  console.log('✅ 全部页面均为自包含单文件，无外链残留');
} else {
  console.log(`✅ 已内联 ${touched} / ${files.length} 个 HTML`);
}
