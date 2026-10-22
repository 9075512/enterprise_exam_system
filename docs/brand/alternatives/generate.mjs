import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

// Render with the bundled dependency, without adding project dependencies.
const bundle = process.env.CODEX_NODE_MODULES || 'C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules';
const require = createRequire(path.join(bundle, 'package.json'));
const sharp = require('sharp');
const output = path.dirname(fileURLToPath(import.meta.url));
const blue = '#2563EB';
const ink = '#172338';
const muted = '#66758A';
const systemName = '卓达煤矿考试学习系统';
const font = 'Microsoft YaHei, Noto Sans SC, sans-serif';

const designs = [
  {
    id: 'A', folder: 'a-zd', name: '卓达字母', en: 'ZD MONOGRAM',
    description: '以 Z 的折线连接 D 的弧面，形成专属字母标。',
    keywords: '字母融合 / 几何构成 / 简约现代',
    geometry: '<path d="M5 13h28v8L16 43h17v8H5v-8l17-22H5V13Z"/><path fill-rule="evenodd" d="M29 13h11c13 0 20 7 20 19s-7 19-20 19H29V13Zm8 8v22h3c8 0 12-4 12-11s-4-11-12-11h-3Z"/>',
  },
  {
    id: 'B', folder: 'b-mine-shield', name: '矿山守护', en: 'MOUNTAIN GUARD',
    description: '山峰嵌入盾牌，以稳固轮廓表达安全与守护。',
    keywords: '煤矿行业 / 安全培训 / 稳重可靠',
    geometry: '<path fill-rule="evenodd" d="m32 4 24 9v17c0 14-10 24-24 30C18 54 8 44 8 30V13L32 4Zm0 8-16 6v12c0 10 7 17 16 21 9-4 16-11 16-21V18l-16-6Z"/><path d="m17 38 11-16 9 13 5-7 7 10H17Z"/>',
  },
  {
    id: 'C', folder: 'c-learning-steps', name: '学有所进', en: 'LEARNING ASCENT',
    description: '展开的书页化为上升阶梯，寓意学有所获。',
    keywords: '学习成长 / 阶梯书页 / 清晰轻盈',
    geometry: '<path d="m6 20 23 9v26L6 47V20Z"/><path d="M34 29h8v-9h8v-9h8v36l-24 8V29Z"/>',
  },
  {
    id: 'D', folder: 'd-knowledge-hub', name: '知识汇聚', en: 'KNOWLEDGE NEXUS',
    description: '四块几何模块围合中心，表达知识连接与协同。',
    keywords: '模块连接 / 知识网络 / 精练科技',
    geometry: '<path d="m32 5 12 12-9 9h-6l-9-9L32 5Z"/><path d="m32 5 12 12-9 9h-6l-9-9L32 5Z" transform="rotate(90 32 32)"/><path d="m32 5 12 12-9 9h-6l-9-9L32 5Z" transform="rotate(180 32 32)"/><path d="m32 5 12 12-9 9h-6l-9-9L32 5Z" transform="rotate(270 32 32)"/>',
  },
];

function svg(body, width = 64, height = 64, label = systemName) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" fill="none" role="img" aria-label="${label}">${body}</svg>\n`;
}

function mark(d, x = 0, y = 0, size = 64, fill = blue) {
  return `<g transform="translate(${x} ${y}) scale(${size / 64})" fill="${fill}">${d.geometry}</g>`;
}

function icon(d, x = 0, y = 0, size = 64) {
  return `<g transform="translate(${x} ${y}) scale(${size / 64})"><rect width="64" height="64" rx="16" fill="${blue}"/>${mark(d, 8, 8, 48, '#FFFFFF')}</g>`;
}

function text(value, x, y, size = 14, fill = ink, extra = '') {
  return `<text x="${x}" y="${y}" font-family="${font}" font-size="${size}" fill="${fill}" ${extra}>${value}</text>`;
}

function rect(x, y, w, h, fill, r = 0, stroke = 'none') {
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="${fill}" stroke="${stroke}"/>`;
}

function card(d, x, y) {
  const content = [
    rect(0, 0, 724, 570, '#FFFFFF', 20, '#E1E7F0'),
    rect(28, 26, 34, 34, '#EFF5FF', 9),
    text(d.id, 45, 50, 19, blue, 'font-weight="700" text-anchor="middle"'),
    text(d.name, 76, 51, 23, ink, 'font-weight="700"'),
    text(d.en, 696, 47, 10, muted, 'text-anchor="end" letter-spacing="1.3"'),
    text(d.description, 29, 83, 13, muted),
    rect(24, 107, 326, 187, '#F8FAFE', 12),
    rect(374, 107, 326, 187, ink, 12),
    mark(d, 127, 126, 120),
    mark(d, 477, 126, 120, '#FFFFFF'),
    text('标准色 · 透明底', 187, 276, 10, muted, 'text-anchor="middle"'),
    text('反白 · 深色底', 537, 276, 10, '#B4C1D4', 'text-anchor="middle"'),
    '<path d="M24 316H700" stroke="#E7EBF2"/>',
    text('网站侧栏预览', 28, 342, 11, muted),
    text('应用图标 · 原尺寸', 451, 342, 11, muted),
    rect(24, 358, 396, 158, '#FFFFFF', 12, '#E7EBF2'),
    icon(d, 42, 379, 36),
    text(systemName, 89, 395, 14, ink, 'font-weight="700"'),
    text('EXAM CENTER', 90, 411, 8, muted, 'letter-spacing="1.7"'),
    '<path d="M24 432H420" stroke="#EDF1F7"/>',
    rect(38, 444, 368, 28, '#EFF5FF', 6),
    '<path d="m51 455 5-4 5 4v7h-4v-4h-2v4h-4v-7Z" fill="#2563EB"/>',
    text('首页', 73, 463, 11, blue),
    '<rect x="51" y="486" width="10" height="11" rx="1" stroke="#858F9E"/><path d="M54 489h4m-4 4h4" stroke="#858F9E"/>',
    text('学习中心', 73, 496, 11, muted),
    icon(d, 451, 377, 64),
    icon(d, 545, 405, 36),
    icon(d, 611, 417, 24),
    text('64 px', 483, 466, 10, muted, 'text-anchor="middle"'),
    text('36 px', 563, 466, 10, muted, 'text-anchor="middle"'),
    text('24 px', 623, 466, 10, muted, 'text-anchor="middle"'),
    text('蓝底白标 / 圆角方形', 451, 497, 10, muted),
    text(d.keywords, 28, 546, 11, muted, 'letter-spacing=".5"'),
    text(`OPTION ${d.id}`, 696, 546, 10, '#9AA6B7', 'letter-spacing="1.5" text-anchor="end"'),
  ].join('');
  return `<g transform="translate(${x} ${y})">${content}</g>`;
}

await fs.mkdir(output, { recursive: true });
for (const d of designs) {
  const dir = path.join(output, d.folder);
  await fs.mkdir(dir, { recursive: true });
  const files = {
    'logo.svg': svg(`<title>${d.id} · ${d.name}</title><desc>${d.description}</desc>${mark(d)}`, 64, 64, `${systemName} ${d.name}`),
    'logo-white.svg': svg(mark(d, 0, 0, 64, '#FFFFFF'), 64, 64, `${d.name}反白版`),
    'app-icon.svg': svg(icon(d), 64, 64, `${d.name}应用图标`),
    'logo-horizontal.svg': svg(`${mark(d, 0, 12, 72)}${text(systemName, 90, 47, 29, ink, 'font-weight="700"')}${text('ZHUODA · LEARNING &amp; ASSESSMENT', 92, 73, 12, muted, 'letter-spacing="1.9"')}`, 560, 96, systemName),
  };
  for (const [name, data] of Object.entries(files)) {
    await fs.writeFile(path.join(dir, name), data);
  }
  for (const size of [24, 36, 64, 512]) {
    await sharp(Buffer.from(files['app-icon.svg'])).resize(size, size).png().toFile(path.join(dir, `app-icon-${size}.png`));
  }
  await sharp(Buffer.from(files['logo.svg'])).resize(512, 512).png().toFile(path.join(dir, 'logo-512.png'));
  await sharp(Buffer.from(files['logo-horizontal.svg'])).resize(1120, 192).png().toFile(path.join(dir, 'logo-horizontal.png'));
  console.log(`Generated ${d.id}: ${d.name}`);
}

const board = svg([
  rect(0, 0, 1600, 1456, '#F4F7FC'),
  rect(64, 49, 7, 7, blue, 3.5),
  text('ZHUODA / BRAND IDENTITY EXPLORATIONS', 83, 58, 11, muted, 'letter-spacing="2.1"'),
  text('四种构思，一个卓达。', 64, 119, 40, ink, 'font-weight="700" letter-spacing="1"'),
  text(`${systemName} · Logo 备选方案`, 65, 155, 16, muted),
  text('蓝色主调 / 平面矢量 / 网站适配', 1535, 155, 12, muted, 'text-anchor="end"'),
  ...designs.map((d, i) => card(d, i % 2 ? 812 : 64, i < 2 ? 190 : 784)),
  '<path d="M64 1390H1536" stroke="#DAE2EE"/>',
  rect(65, 1411, 13, 13, blue, 3),
  text('#2563EB 品牌蓝', 88, 1422, 11, muted),
  rect(244, 1411, 13, 13, ink, 3),
  text('#172338 墨蓝', 267, 1422, 11, muted),
  text('4 套独立设计 · 保留现有网站 Logo', 1536, 1422, 11, muted, 'text-anchor="end"'),
].join(''), 1600, 1456, '卓达煤矿考试学习系统四款 Logo 对比图');

await fs.writeFile(path.join(output, 'comparison.svg'), board);
await sharp(Buffer.from(board)).png().toFile(path.join(output, 'comparison.png'));

const html = `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>卓达 · 四款 Logo 备选</title><style>
*{box-sizing:border-box}body{margin:0;background:#f4f7fc;color:#172338;font-family:"Microsoft YaHei",sans-serif}.board{display:block;width:100%;max-width:1600px;height:auto;margin:auto}.downloads{max-width:1472px;margin:0 auto 48px;padding:24px;display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:20px;background:white;border:1px solid #e1e7f0;border-radius:16px}.downloads h2{font-size:16px;margin:0 0 16px}.downloads a{display:inline-block;font-size:13px;color:#2563eb;margin:0 12px 12px 0}.note{max-width:1472px;margin:24px auto;padding:0 24px;font-size:12px;color:#66758a;line-height:1.8}@media(max-width:800px){.downloads{margin:12px;grid-template-columns:repeat(2,minmax(0,1fr))}}
</style></head><body><img class="board" src="comparison.svg" alt="四款 Logo、反白、小尺寸与网站侧栏的对比图"/><section class="downloads">${designs.map(d => `<article><h2>${d.id} · ${d.name}</h2><a href="${d.folder}/logo.svg" download>透明底 SVG</a><a href="${d.folder}/logo-white.svg" download>反白 SVG</a><a href="${d.folder}/app-icon.svg" download>应用图标 SVG</a><a href="${d.folder}/logo-horizontal.svg" download>横向组合 SVG</a><a href="${d.folder}/logo-horizontal.png" download>横向组合 PNG</a><a href="${d.folder}/app-icon-512.png" download>应用图标 PNG</a><a href="${d.folder}/logo-512.png" download>透明底 PNG</a></article>`).join('')}</section><p class="note">四款均使用系统品牌蓝 #2563EB。对比图中的 24 / 36 / 64 px 为设计稿原尺寸，浏览器缩放后将按页面比例显示。横向组合文字使用本机“微软雅黑”，回退为 Noto Sans SC。当前页面仅展示备选，未替换网站 Logo。</p></body></html>`;
await fs.writeFile(path.join(output, 'index.html'), html);

await fs.writeFile(path.join(output, '使用说明.txt'), `卓达煤矿考试学习系统 · 四款 Logo 备选\n\n${designs.map(d => `${d.id} · ${d.name}（${d.folder}）\n${d.description}\n${d.keywords}`).join('\n\n')}\n\n每款提供：\nlogo.svg / logo-512.png：透明底蓝色主标志。\nlogo-white.svg：透明底白色反白标志，用于深色背景。\napp-icon.svg / app-icon-512.png：蓝底白色圆角应用图标。\napp-icon-24.png / app-icon-36.png / app-icon-64.png：各尺寸直接导出。\nlogo-horizontal.svg：包含系统全称的横向组合，文字依赖微软雅黑或 Noto Sans SC。\nlogo-horizontal.png：横向组合的 1120×192 透明 PNG，无字体依赖。\n\ncomparison.png / comparison.svg：完整四款对比图。\nindex.html：可离线打开的预览和下载页。\n\n使用规范：主色 #2563EB，墨蓝 #172338；保持纵横比，不附加渐变、阴影或描边。\n主标志与应用图标建议最小 24px；图形四周留白不少于图形宽度的 1/8。\n本次只新增独立备选素材，未替换现有网站 Logo，未修改接口或业务功能。\n`);
console.log('Generated comparison.svg, comparison.png and index.html');
