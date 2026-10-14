/**
 * 练题端（practice-web）保真度审计 —— 与管理端 audit-fidelity.mjs 同法，
 * 但探针换成移动端设计 kit `kit/m.css` 的 `.m-*` ↔ 练题端工程选择器。
 *
 * 为什么单开一条 lane：主审计只覆盖根应用（admin / exam / author，同源 5173）；
 * 练题端是独立构建、独立端口（5174）、独立 token（`practice.token`），
 * 且设计稿是自包含单文件（`pages/p-*.html`，由 5173 托管）。
 *
 * 用法：
 *   node docs/ui-v3b/tools/audit-practice.mjs --out=audit-practice.json [--only=p-home,p-login]
 * 前置：后端 3001、vite 5173（托管设计稿）、练题端 dev 5174、Chrome --remote-debugging-port=9222
 */
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, ...v] = a.replace(/^--/, '').split('=');
    return [k, v.join('=') || true];
  }),
);
const OUT = args.out ?? 'audit-practice.json';
const ONLY = args.only ? String(args.only).split(',') : null;

const DESIGN_BASE = 'http://localhost:5173';
const APP_BASE = 'http://localhost:5174';
const DESIGN = (f) => `${DESIGN_BASE}/docs/ui-v3b/pages/${f}.html`;

/** 设计稿页 → 练题端路由 */
const PAGES = [
  { key: 'p-login', route: '/practice' },
  { key: 'p-home', route: '/practice/home' },
  { key: 'p-session', route: '/practice/banks/bank-culture' },
  { key: 'p-wrongbook', route: '/practice/wrong-book' },
  { key: 'p-report', route: '/practice/report' },
  { key: 'p-favorites', route: '/practice/favorites' },
  { key: 'p-profile', route: '/practice/profile' },
];

const P = (name, designSel, appSel, props) => ({ name, designSel, appSel, props });
const BOX = [
  'fontSize', 'fontWeight', 'lineHeight', 'color', 'backgroundColor',
  'borderRadius', 'padding', 'height', 'borderColor', 'borderWidth', 'boxShadow', 'letterSpacing',
];
/** 全局层 + 顶层容器（设计 kit `.m-*` ↔ 练题端工程选择器） */
const MOBILE_PROBES = [
  P('body', 'body', 'body', ['fontSize', 'lineHeight', 'color']),
  P('顶栏', '.m-bar', '.practice-layout__bar', ['height', 'backgroundColor', 'borderBottomColor']),
  P('内容区', '.m-body', '.practice-layout__main', ['padding', 'backgroundColor']),
  P('底栏Tab', '.m-tab', '.tabbar', ['height', 'backgroundColor', 'borderTopColor']),
  P('Tab项', '.m-tab a', '.tabbar__item', ['fontSize', 'fontWeight', 'color', 'paddingTop']),
  P('页头标题', '.m-bar__t', '.practice-layout__title', ['fontSize', 'fontWeight', 'letterSpacing', 'color']),
  P('输入框', '.m-inp', '.el-input__wrapper', ['height', 'borderRadius', 'boxShadow', 'fontSize']),
  P('主按钮', '.m-btn', '.el-button--primary', ['height', 'borderRadius', 'fontSize', 'fontWeight', 'backgroundColor', 'color']),
  P('次按钮', '.m-btn--ghost', '.el-button:not(.el-button--primary)', ['height', 'borderRadius', 'fontSize', 'fontWeight', 'borderColor', 'color', 'backgroundColor']),
  P('进度条', '.m-prog', '.el-progress-bar__outer', ['height', 'backgroundColor', 'borderRadius']),
  P('空态图标', '.m-emp .ic', '.el-empty__image, .empty-state__icon', ['width', 'height', 'color']),
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function findPageWs() {
  for (let i = 0; i < 40; i += 1) {
    try {
      const list = await (await fetch('http://127.0.0.1:9222/json/list')).json();
      const page = list.find((t) => t.type === 'page');
      if (page?.webSocketDebuggerUrl) return page.webSocketDebuggerUrl;
    } catch {
      /* retry */
    }
    await sleep(250);
  }
  throw new Error('no CDP page target on 127.0.0.1:9222');
}

class CDP {
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.pending = new Map();
    ws.addEventListener('message', (ev) => {
      const m = JSON.parse(ev.data);
      if (m.id && this.pending.has(m.id)) {
        const { resolve, reject } = this.pending.get(m.id);
        this.pending.delete(m.id);
        m.error ? reject(new Error(JSON.stringify(m.error))) : resolve(m.result);
      }
    });
  }
  send(method, params = {}) {
    this.id += 1;
    const id = this.id;
    return new Promise((res, rej) => {
      this.pending.set(id, { resolve: res, reject: rej });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }
  async eval(expression) {
    const r = await this.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? 'eval failed');
    return r.result.value;
  }
}

const PROBE_FN = `
(function (probes) {
  const px = (v) => (v == null ? null : String(v));
  const out = {};
  for (const p of probes) {
    let el = null;
    try { el = document.querySelector(p.sel); } catch (e) { el = null; }
    if (!el) { out[p.name] = null; continue; }
    const cs = getComputedStyle(el);
    const rec = {};
    for (const prop of p.props) rec[prop] = px(cs[prop]);
    const r = el.getBoundingClientRect();
    rec.__rect = Math.round(r.width) + 'x' + Math.round(r.height);
    out[p.name] = rec;
  }
  return out;
})`;

/** 设计稿 token 源（kit/m.css 的 :root）↔ 练题端运行时 token 实测值 */
const VARS_FN = `
(function () {
  const names = ['--el-color-primary','--el-border-color','--el-border-radius-base','--el-input-border-color',
    '--el-font-size-base','--el-text-color-regular','--el-text-color-primary','--el-fill-color-light','--el-bg-color-page'];
  const from = (sel) => {
    const el = document.querySelector(sel) || document.documentElement;
    const cs = getComputedStyle(el);
    const o = {};
    for (const n of names) o[n] = cs.getPropertyValue(n).trim();
    return o;
  };
  return { root: from(':root'), input: from('.el-input'), button: from('.el-button') };
})()`;

const PRACTICE_TOKEN = await (async () => {
  const r = await (
    await fetch('http://localhost:3001/api/practice/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'admin123' }),
    })
  ).json();
  if (!r?.data?.token) throw new Error('practice login failed: ' + JSON.stringify(r));
  return r.data.token;
})();

const ws = new WebSocket(await findPageWs());
await new Promise((r, j) => {
  ws.addEventListener('open', r, { once: true });
  ws.addEventListener('error', j, { once: true });
});
const cdp = new CDP(ws);
await cdp.send('Page.enable');
await cdp.send('Runtime.enable');
await cdp.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });

const toFnArgs = (side) =>
  JSON.stringify(
    MOBILE_PROBES.map((p) => ({ name: p.name, sel: side === 'design' ? p.designSel : p.appSel, props: p.props })),
  );

async function measure(url, side, waitMs) {
  await cdp.send('Page.navigate', { url });
  await sleep(waitMs);
  let prev = -1;
  for (let i = 0; i < 8; i += 1) {
    const len = await cdp.eval(`document.body.innerHTML.length`);
    if (len === prev && prev > 0) break;
    prev = len;
    await sleep(700);
  }
  const probes = await cdp.eval(`${PROBE_FN}(${toFnArgs(side)})`);
  const vars = side === 'app' ? await cdp.eval(VARS_FN) : null;
  const path = await cdp.eval(`location.pathname`);
  return { probes, vars, path };
}

// 先落到练题端，写入练题 token（独立键 practice.token）
await cdp.send('Page.navigate', { url: `${APP_BASE}/practice` });
await sleep(2500);
await cdp.eval(`localStorage.setItem('practice.token', ${JSON.stringify(PRACTICE_TOKEN)})`);

const report = { generatedAt: new Date().toISOString(), app: 'practice-web', pages: {} };
const list = ONLY ? PAGES.filter((p) => ONLY.includes(p.key)) : PAGES;

for (const page of list) {
  const entry = { route: page.route, design: {}, app: {}, appPath: null };
  try {
    const d = await measure(DESIGN(page.key), 'design', 1600);
    entry.design = d.probes;
    // ⚠️ localStorage 是「按源」隔离的：必须先落到 5174 源，再写入/清除练题 token，
    //    否则操作落在 5173（设计稿源）上，练题端会带着上一次的登录态跳走。
    await cdp.send('Page.navigate', { url: `${APP_BASE}/practice` });
    await sleep(1200);
    if (page.key === 'p-login') await cdp.eval(`localStorage.clear()`);
    else await cdp.eval(`localStorage.setItem('practice.token', ${JSON.stringify(PRACTICE_TOKEN)})`);
    const a = await measure(`${APP_BASE}${page.route}`, 'app', 3400);
    entry.app = a.probes;
    entry.appVars = a.vars;
    entry.appPath = a.path;
    console.log('audited', page.key, '→', a.path);
  } catch (err) {
    entry.error = String(err.message ?? err);
    console.error('FAIL', page.key, entry.error);
  }
  report.pages[page.key] = entry;
}

writeFileSync(resolve(OUT), JSON.stringify(report, null, 2));
console.log('written', resolve(OUT));
process.exit(0);
