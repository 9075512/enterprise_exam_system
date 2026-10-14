/**
 * 把全部设计图页面合并成「单文件报告」report.html：
 *   - 每个页面的完整 HTML 以字符串内嵌；
 *   - 左侧分组目录 + 上一页/下一页 + iframe(srcdoc) 渲染；
 *   - 点 iframe 内部的卡片/侧栏链接会被拦截并切换到对应页（同源可拦截）；
 *   - 嵌入副本里隐藏页面自带的右下角翻页控件（.pctl），避免与报告导航重复。
 *
 * 为什么需要：预览面板是「单文件快照」式加载，跨文件跳转和目录体验都受限；
 * 单文件报告让整个交付物在一个预览里完整可翻。独立页面文件仍保留供开发对照。
 *
 * 用法（在 docs/ui-v3b 下）：node tools/build-deck.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const read = (p) => fs.readFileSync(p, 'utf8');

/* 顺序与分组（与 index.html 的分组一致；m = 移动端窄幅渲染，bare = 全屏无壳） */
const GROUPS = [
  { name: '登录 · 入口', pages: [['login', '登录（管理端）'], ['p-login', '练题端 · 登录', 'm']] },
  { name: '考试运营', pages: [['dashboard', '数据总览'], ['exams', '考试管理'], ['exam-monitor', '监考监控'], ['retakes', '补考管理'], ['reviews', '人工阅卷'], ['appeals', '成绩复核'], ['scores', '成绩报表']] },
  { name: '教研组卷', pages: [['banks', '题库管理'], ['bank-detail', '题库详情'], ['papers', '试卷管理'], ['composer', '组卷工作台'], ['paper-preview', '试卷预览']] },
  { name: '组织与权限', pages: [['departments', '科室管理'], ['users', '用户管理'], ['permissions', '菜单权限']] },
  { name: '内容管理', pages: [['content', '公告与轮播'], ['home-config', '考生首页配置'], ['practice-settings', '练题端设置']] },
  { name: '系统', pages: [['settings', '系统设置'], ['audit', '审计日志'], ['login-logs', '登录日志'], ['maintenance', '系统维护']] },
  { name: '考生考试端', pages: [['exam-home', '考生首页'], ['exam-my', '我的考试'], ['exam-taking', '在线答题', 'bare'], ['exam-scores', '我的成绩'], ['score-detail', '成绩明细'], ['exam-retakes', '我的补考'], ['notifications', '消息中心']] },
  { name: '练题端（暂缓 · 仅视觉示意）', pages: [['p-home', '练题首页', 'm'], ['p-session', '答题', 'm', 'bare'], ['p-wrongbook', '错题本', 'm'], ['p-report', '学习报告', 'm'], ['p-favorites', '我的收藏', 'm'], ['p-profile', '我的', 'm']] },
  { name: '组件与规范', pages: [['dialogs', '业务弹窗合集'], ['design-system', '设计系统与 Token']] },
];

/* 嵌入页面：读内联后的自包含文档，注入隐藏 .pctl 的样式，再安全地转成 JS 字符串 */
const DOCS = {};
const ORDER = [];
for (const g of GROUPS) {
  for (const [file, title, mode, mode2] of g.pages) {
    const rel = file.endsWith('.html') ? file : `pages/${file}.html`;
    let p = path.join(ROOT, rel);
    if (!fs.existsSync(p)) p = path.join(ROOT, path.basename(rel)); /* 顶层页面（如 design-system.html） */
    let html = read(p);
    html = html.replace('</head>', '<style>.pctl{display:none!important}</style></head>');
    DOCS[file] = html;
    ORDER.push({ key: file, title, group: g.name, mode: mode2 || mode });
  }
}

const docsJs = JSON.stringify(DOCS)
  .replace(/<\!--/g, '<\\!--')   /* 防止 HTML 解析器进入 script 转义态 */
  .replace(/<\/script/gi, '<\\/script');

const orderJs = JSON.stringify(ORDER, null, 0);

const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>考试中心 · 全站 UI 设计图报告（单文件版）</title>
<style>
:root{--p:#0B5BFF;--side:#0B0F19;--bg:#F7F8FA;--line:#E6E9EF;--t1:#151A23;--t3:#858F9E}
*{box-sizing:border-box;margin:0;padding:0}
html,body{height:100%}
body{display:flex;font-family:'Inter','PingFang SC','Microsoft YaHei',system-ui,sans-serif;background:var(--bg);color:var(--t1)}
/* 侧栏 */
nav{width:252px;flex:0 0 252px;background:var(--side);color:#fff;display:flex;flex-direction:column;overflow:hidden}
.brand{padding:16px 16px 13px;border-bottom:1px solid rgba(255,255,255,.09)}
.brand b{font-size:13.5px;font-weight:640;letter-spacing:.02em}
.brand span{display:block;margin-top:3px;font-size:10.5px;color:#7C8698;letter-spacing:.06em}
.toc{flex:1;overflow-y:auto;padding:10px 8px 16px}
.toc::-webkit-scrollbar{width:8px}.toc::-webkit-scrollbar-thumb{background:rgba(255,255,255,.14);border-radius:4px}
.grp{margin:13px 8px 5px;font-size:10.5px;font-weight:600;color:#7C8698;letter-spacing:.08em}
.grp.is-defer{color:#B8A15C}
.it{display:flex;align-items:center;gap:8px;padding:7px 10px;border-radius:7px;font-size:12.5px;color:#C6CDD8;cursor:pointer;user-select:none}
.it:hover{background:rgba(255,255,255,.06);color:#fff}
.it.is-on{background:var(--p);color:#fff;font-weight:560}
.it .no{font-size:10px;color:rgba(255,255,255,.42);font-variant-numeric:tabular-nums;width:16px;flex:0 0 16px}
.it.is-on .no{color:rgba(255,255,255,.7)}
.it .tag{margin-left:auto;font-size:9.5px;padding:1px 5px;border-radius:4px;background:rgba(255,255,255,.12);color:#AEB7C4}
/* 主区 */
main{flex:1;display:flex;flex-direction:column;min-width:0}
.bar{height:46px;flex:0 0 46px;background:#fff;border-bottom:1px solid var(--line);display:flex;align-items:center;gap:12px;padding:0 14px}
.bar .tt{font-size:13px;font-weight:620}
.bar .ct{font-size:11px;color:var(--t3);font-variant-numeric:tabular-nums}
.bar .sp{flex:1}
.nb{height:28px;padding:0 11px;border:1px solid var(--line);border-radius:6px;background:#fff;font-size:12px;color:var(--t1);cursor:pointer}
.nb:hover:not([disabled]){border-color:var(--p);color:var(--p)}
.nb[disabled]{opacity:.4;cursor:not-allowed}
.stage{flex:1;min-height:0;position:relative;background:#EEF1F5}
.frame{position:absolute;inset:0;border:0;width:100%;height:100%;background:#fff}
.stage.is-m .frame{inset:14px auto 14px;left:50%;transform:translateX(-50%);width:412px;border-radius:18px;
  box-shadow:0 12px 40px rgba(11,15,25,.16),0 0 0 1px rgba(11,15,25,.06)}
.stage.is-bare{background:#fff}
.hint{position:absolute;left:50%;bottom:10px;transform:translateX(-50%);font-size:10.5px;color:var(--t3);background:rgba(255,255,255,.9);
  border:1px solid var(--line);border-radius:99px;padding:3px 12px;pointer-events:none}
</style>
</head>
<body>
<nav>
  <div class="brand"><b>考试中心 · UI 设计图报告</b><span>方向 C 精密蓝 · 单文件版</span></div>
  <div class="toc" id="toc"></div>
</nav>
<main>
  <div class="bar">
    <span class="tt" id="tt">—</span><span class="ct" id="ct"></span>
    <span class="sp"></span>
    <button class="nb" id="pv">← 上一页</button>
    <button class="nb" id="nx">下一页 →</button>
  </div>
  <div class="stage" id="stage">
    <iframe class="frame" id="fr" title="设计图"></iframe>
    <div class="hint" id="hint"></div>
  </div>
</main>
<script>
var DOCS = ${docsJs};
var ORDER = ${orderJs};
var toc = document.getElementById('toc'), fr = document.getElementById('fr'),
    tt = document.getElementById('tt'), ct = document.getElementById('ct'),
    pv = document.getElementById('pv'), nx = document.getElementById('nx'),
    stage = document.getElementById('stage'), hint = document.getElementById('hint');
var cur = null;

ORDER.forEach(function (p, i) {
  if (i === 0 || ORDER[i - 1].group !== p.group) {
    var h = document.createElement('div');
    h.className = 'grp' + (p.group.indexOf('暂缓') >= 0 ? ' is-defer' : '');
    h.textContent = p.group;
    toc.appendChild(h);
  }
  var it = document.createElement('div');
  it.className = 'it'; it.dataset.key = p.key;
  it.innerHTML = '<span class="no">' + String(i + 1).padStart(2, '0') + '</span>' + p.title
    + (p.mode === 'm' ? '<span class="tag">移动端</span>' : '');
  it.onclick = function () { select(p.key, true); };
  toc.appendChild(it);
});

function paint() {
  var i = ORDER.findIndex(function (p) { return p.key === cur; });
  var p = ORDER[i];
  tt.textContent = p.title;
  ct.textContent = (i + 1) + ' / ' + ORDER.length + ' · ' + p.group;
  pv.disabled = i <= 0; nx.disabled = i >= ORDER.length - 1;
  stage.className = 'stage' + (p.mode === 'm' ? ' is-m' : '') + (p.mode === 'bare' ? ' is-bare' : '');
  hint.textContent = p.mode === 'm' ? '移动端 390 × 800' : (p.mode === 'bare' ? '全屏作答态（无侧栏）' : '');
  var its = toc.querySelectorAll('.it');
  its.forEach(function (el) { el.classList.toggle('is-on', el.dataset.key === cur); });
  var on = toc.querySelector('.it.is-on');
  if (on) on.scrollIntoView({ block: 'nearest' });
}
function select(key, push) {
  if (!DOCS[key]) return;
  cur = key;
  fr.srcdoc = DOCS[key];
  if (push) history.replaceState(null, '', '#' + key);
  paint();
}
pv.onclick = function () { var i = ORDER.findIndex(function (p) { return p.key === cur; }); if (i > 0) select(ORDER[i - 1].key, true); };
nx.onclick = function () { var i = ORDER.findIndex(function (p) { return p.key === cur; }); if (i < ORDER.length - 1) select(ORDER[i + 1].key, true); };
document.addEventListener('keydown', function (e) {
  if (e.key === 'ArrowLeft') pv.onclick(); else if (e.key === 'ArrowRight') nx.onclick();
});

/* 拦截 iframe 内部跳转（卡片 / 侧栏 / 返回链接），改为切换报告页 */
fr.addEventListener('load', function () {
  var doc;
  try { doc = fr.contentDocument; } catch (err) { return; }
  if (!doc) return;
  doc.addEventListener('click', function (e) {
    var t = e.target && e.target.closest ? e.target.closest('[data-go], a[href]') : null;
    if (!t) return;
    var key = t.dataset && t.dataset.go;
    if (!key) {
      var href = t.getAttribute('href') || '';
      if (href.charAt(0) === '#') return;
      key = href.split('/').pop().replace(/\\.html$/, '');
    }
    if (key && DOCS[key]) { e.preventDefault(); e.stopPropagation(); select(key, true); }
  }, true);
});

var h0 = (location.hash || '').replace('#', '');
select(DOCS[h0] ? h0 : ORDER[0].key, false);
</script>
</body>
</html>
`;

fs.writeFileSync(path.join(ROOT, 'report.html'), html, 'utf8');
console.log('✅ report.html 已生成：' + ORDER.length + ' 页，' + Math.round(html.length / 1024) + ' KB');
