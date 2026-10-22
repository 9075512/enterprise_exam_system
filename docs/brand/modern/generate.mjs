import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire('C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/package.json');
const sharp = require('sharp');
const root = path.dirname(fileURLToPath(import.meta.url));
const blue = '#2563EB', ink = '#172338', gray = '#738096';
const font = 'Microsoft YaHei, Noto Sans SC, sans-serif';
const systemName = '卓达煤矿考试学习系统';
const designs = [
  {
    id: '01', folder: '01-flow-z', name: '流线 Z', en: 'FLOW',
    description: '定制 Z 字形，圆润转折与利落切角形成节奏。',
    idea: '流动 · 敏捷 · 向前',
    shape: '<path d="M15 10h34c5 0 8 6 4 10L26 44h27l-4 10H15c-5 0-8-6-4-10l27-24H11l4-10Z"/>',
  },
  {
    id: '02', folder: '02-open-d', name: '开域 d', en: 'OPEN',
    description: '连续弧线构成开放的 d，留白带来轻盈感。',
    idea: '开放 · 从容 · 连接',
    shape: '<path d="M48 10v24c0 11-7 18-18 18S12 45 12 34s7-18 18-18h5" fill="none" stroke="currentColor" stroke-width="10" stroke-linecap="round" stroke-linejoin="round"/>',
  },
  {
    id: '03', folder: '03-zhuo-type', name: '卓印', en: 'SIGNATURE',
    description: '重绘「卓」的笔画，以字形建立专属识别。',
    idea: '东方 · 秩序 · 精准',
    shape: '<path d="M28 5h8v7h13v7H28V5Z"/><path fill-rule="evenodd" d="M16 22h32v24H16V22Zm8 6v3h16v-3H24Zm0 9v3h16v-3H24Z"/><path d="M28 46h8v4h18v7H36v6h-8v-6H10v-7h18v-4Z"/>',
  },
];
function svg(body, width = 64, height = 64, label = systemName) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" fill="none" role="img" aria-label="${label}">${body}</svg>\n`;
}
function mark(d, x = 0, y = 0, size = 64, color = blue) {
  return `<g transform="translate(${x} ${y}) scale(${size / 64})" fill="${color}" color="${color}">${d.shape}</g>`;
}
function app(d, x = 0, y = 0, size = 64) {
  return `<g transform="translate(${x} ${y}) scale(${size / 64})"><rect width="64" height="64" rx="16" fill="${blue}"/>${mark(d,8,8,48,'#FFFFFF')}</g>`;
}
function text(value,x,y,size=14,color=ink,extra='') {
  return `<text x="${x}" y="${y}" font-family="${font}" font-size="${size}" fill="${color}" ${extra}>${value}</text>`;
}
function rect(x,y,width,height,fill,rx=0,stroke='none') {
  return `<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="${rx}" fill="${fill}" stroke="${stroke}"/>`;
}
await fs.mkdir(root,{recursive:true});
for(const d of designs) {
  const dir=path.join(root,d.folder);
  await fs.mkdir(dir,{recursive:true});
  const files={
    'logo.svg':svg(`<title>${d.name}</title><desc>${d.description}</desc>${mark(d)}`,64,64,`${d.name}标志`),
    'logo-white.svg':svg(mark(d,0,0,64,'#FFFFFF'),64,64,`${d.name}反白版`),
    'logo-mono.svg':svg(mark(d,0,0,64,ink),64,64,`${d.name}单色版`),
    'app-icon.svg':svg(app(d),64,64,`${d.name}应用图标`),
    'logo-horizontal.svg':svg(`${mark(d,0,12,72)}${text(systemName,92,47,28,ink,'font-weight="700"')}${text('ZHUODA · LEARNING &amp; ASSESSMENT',94,72,11,gray,'letter-spacing="1.7"')}`,560,96),
  };
  for(const [name,data] of Object.entries(files)) await fs.writeFile(path.join(dir,name),data);
  for(const size of [24,36,64,512]) await sharp(Buffer.from(files['app-icon.svg'])).resize(size,size).png().toFile(path.join(dir,`app-icon-${size}.png`));
  await sharp(Buffer.from(files['logo.svg'])).resize(512,512).png().toFile(path.join(dir,'logo-512.png'));
  await sharp(Buffer.from(files['logo-horizontal.svg'])).resize(1120,192).png().toFile(path.join(dir,'logo-horizontal.png'));
}

function column(d,x) {
  return `<g transform="translate(${x} 0)">${[
    text(d.id,0,219,14,blue,'letter-spacing="2"'),
    text(d.en,432,219,10,gray,'text-anchor="end" letter-spacing="2"'),
    rect(0,244,432,356,'#FFFFFF',16),
    mark(d,136,281,160),
    text('卓达',216,514,35,ink,'text-anchor="middle" font-weight="500" letter-spacing="8"'),
    text('ZHUODA',216,543,10,gray,'text-anchor="middle" letter-spacing="5"'),
    text(d.name,0,644,24,ink,'font-weight="700"'),
    text(d.description,0,677,12,gray),
    text(d.idea,0,702,11,gray,'letter-spacing="1"'),
    '<path d="M0 729H432" stroke="#DBE2ED"/>',
    text('图标与单色',0,758,11,gray),
    app(d,0,779,64),
    app(d,92,807,36),
    app(d,157,819,24),
    rect(232,779,84,64,ink,12),
    mark(d,250,787,48,'#FFFFFF'),
    mark(d,359,787,48,ink),
    text('64',32,868,9,gray,'text-anchor="middle"'),
    text('36',110,868,9,gray,'text-anchor="middle"'),
    text('24 px',169,868,9,gray,'text-anchor="middle"'),
    text('反白',274,868,9,gray,'text-anchor="middle"'),
    text('单色',383,868,9,gray,'text-anchor="middle"'),
    text('网站侧栏',0,915,11,gray),
    rect(0,934,432,135,'#FFFFFF',12,'#E3E8F0'),
    app(d,20,954,36),
    text(systemName,68,971,14,ink,'font-weight="700"'),
    text('EXAM CENTER',69,987,8,gray,'letter-spacing="1.6"'),
    '<path d="M0 1007H432" stroke="#EDF1F6"/>',
    rect(16,1020,400,32,'#EFF5FF',6),
    '<path d="m28 1033 5-4 5 4v8h-4v-5h-2v5h-4v-8Z" fill="#2563EB"/>',
    text('首页',48,1041,12,blue),
  ].join('')}</g>`;
}

const board=svg([
  rect(0,0,1500,1160,'#F4F6FA'),
  rect(60,47,6,6,blue,3),
  text('ZHUODA / MODERN IDENTITY',78,56,11,gray,'letter-spacing="2.3"'),
  text('精致 · 现代',60,120,42,ink,'font-weight="700" letter-spacing="3"'),
  text('定制字形 / 克制留白 / 简洁轮廓',62,156,14,gray),
  text('卓达煤矿考试学习系统',1440,119,14,ink,'text-anchor="end"'),
  text('NEW DIRECTIONS  /  03',1440,150,10,gray,'text-anchor="end" letter-spacing="2"'),
  '<path d="M60 180H1440" stroke="#DBE2ED"/>',
  ...designs.map((d,i)=>column(d,60+i*474)),
  '<path d="M60 1100H1440" stroke="#DBE2ED"/>',
  text('品牌蓝 #2563EB  ·  墨蓝 #172338',60,1130,10,gray),
  text('独立备选素材 · 现有网站 Logo 保留',1440,1130,10,gray,'text-anchor="end"'),
].join(''),1500,1160,'卓达精致现代风格三款 Logo 设计');
await fs.writeFile(path.join(root,'comparison.svg'),board);
await sharp(Buffer.from(board)).png().toFile(path.join(root,'comparison.png'));
await fs.writeFile(path.join(root,'index.html'),`<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>卓达 · 精致现代</title><style>*{box-sizing:border-box}body{margin:0;background:#f4f6fa;color:#172338;font-family:"Microsoft YaHei",sans-serif}.board{display:block;width:100%;max-width:1500px;height:auto;margin:auto}.assets{max-width:1380px;margin:0 auto 40px;padding:25px;display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:30px;background:#fff;border-radius:14px}h2{font-size:16px;margin:0 0 16px}a{display:inline-block;color:#2563eb;font-size:12px;margin:0 16px 14px 0}.note{max-width:1380px;padding:0 25px;margin:20px auto;color:#738096;font-size:12px;line-height:1.8}@media(max-width:700px){.assets{margin:0 12px;grid-template-columns:1fr}}</style></head><body><img class="board" src="comparison.svg" alt="三款精致现代 Logo 对比图"/><section class="assets">${designs.map(d=>`<article><h2>${d.id} · ${d.name}</h2><a href="${d.folder}/logo.svg" download>主标志 SVG</a><a href="${d.folder}/logo-white.svg" download>反白 SVG</a><a href="${d.folder}/logo-mono.svg" download>单色 SVG</a><a href="${d.folder}/app-icon.svg" download>应用图标 SVG</a><a href="${d.folder}/logo-horizontal.svg" download>横向组合 SVG</a><a href="${d.folder}/logo-512.png" download>透明 PNG</a><a href="${d.folder}/app-icon-512.png" download>应用图标 PNG</a><a href="${d.folder}/logo-horizontal.png" download>横向组合 PNG</a></article>`).join('')}</section><p class="note">主色沿用 #2563EB。每款含 24、36、64、512px 应用图标。SVG 中的文字使用微软雅黑或 Noto Sans SC；横向 PNG 无字体依赖。此页仅供选稿，现有网站 Logo 未替换。</p></body></html>`);
await fs.writeFile(path.join(root,'使用说明.txt'),`卓达煤矿考试学习系统 · 精致现代设计方向\n\n${designs.map(d=>`${d.id} ${d.name} / ${d.folder}\n${d.description}\n${d.idea}`).join('\n\n')}\n\n每款包含蓝色主标志、反白、单色、应用图标、带系统全称的横向组合 SVG，以及透明 PNG。\n应用图标导出尺寸为 24 / 36 / 64 / 512px。\ncomparison.png 为三款对比图，index.html 为预览与下载页。\n请保持纵横比，主标志周围留白不小于图形宽度的 1/8。\n现有网站 Logo 未替换。\n`);
console.log('Created 3 modern logo sets and comparison.');
