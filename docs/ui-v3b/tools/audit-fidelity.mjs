/**
 * 设计图保真度审计 —— 逐页把「设计图」与「工程页面」的同语义元素取 computed style 做数值 diff。
 *
 * 为什么用 CDP 同源加载：docs/ui-v3b 是自包含单文件 HTML，vite dev 会把它当静态资源托管，
 * 与 SPA 同源 → 同一个 Chrome target 里来回导航即可，无需两套环境。
 * （视觉相似不代表刻度一致；EP 内部尺寸多为编译期常量，只看源码必漏，必须量计算值。）
 *
 * 用法：
 *   node docs/ui-v3b/tools/audit-fidelity.mjs --tokens=<file>   # 三行：admin / author / examinee
 *   node docs/ui-v3b/tools/audit-fidelity.mjs --tokens=f --out=audit.json --only=dashboard,users
 * 前置：后端 3001 在跑、vite dev 5173 在跑、Chrome 已开 --remote-debugging-port=9222
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, ...v] = a.replace(/^--/, '').split('=');
    return [k, v.join('=') || true];
  }),
);
const TOKEN_FILE = args.tokens;
const OUT = args.out ?? 'audit-fidelity.json';
const ONLY = args.only ? String(args.only).split(',') : null;
if (!TOKEN_FILE) {
  console.error('need --tokens=<file> (3 lines: admin / author / examinee)');
  process.exit(1);
}
const [TOKEN_ADMIN, TOKEN_AUTHOR, TOKEN_EXAMINEE] = readFileSync(resolve(TOKEN_FILE), 'utf8')
  .split(/\r?\n/)
  .map((s) => s.trim())
  .filter(Boolean);

const BASE = 'http://localhost:5173';
const DESIGN = (f) => `${BASE}/docs/ui-v3b/pages/${f}.html`;

const MOCK_IDS = {
  examId: args.examId ?? 'exam-mv4tbv9o-javyrb',
  bankId: args.bankId ?? 'bank-culture',
  paperId: args.paperId ?? 'paper-demo',
  recordId: args.recordId ?? 'rec-mv4y2zxz-exh2rt',
  takingId: args.takingId ?? 'rec-mv4q5yra-9lp1a8',
};

/** 设计图页 → 工程路由（role 决定用哪个 token） */
const PAGES = [
  { key: 'dashboard', role: 'admin', route: '/admin/dashboard' },
  { key: 'departments', role: 'admin', route: '/admin/departments' },
  { key: 'users', role: 'admin', route: '/admin/users' },
  { key: 'exams', role: 'admin', route: '/admin/exams' },
  { key: 'exam-monitor', role: 'admin', route: `/admin/exams/${MOCK_IDS.examId}/monitor` },
  { key: 'retakes', role: 'admin', route: '/admin/retakes' },
  { key: 'scores', role: 'admin', route: '/admin/scores' },
  { key: 'appeals', role: 'admin', route: '/admin/appeals' },
  { key: 'reviews', role: 'admin', route: '/admin/reviews' },
  { key: 'practice-settings', role: 'admin', route: '/admin/practice-settings' },
  { key: 'content', role: 'admin', route: '/admin/content' },
  { key: 'home-config', role: 'admin', route: '/admin/home-config' },
  { key: 'settings', role: 'admin', route: '/admin/settings' },
  { key: 'permissions', role: 'admin', route: '/admin/permissions' },
  { key: 'audit', role: 'admin', route: '/admin/audit' },
  { key: 'login-logs', role: 'admin', route: '/admin/login-logs' },
  { key: 'maintenance', role: 'admin', route: '/admin/maintenance' },
  { key: 'login', role: 'guest', route: '/login' },
  { key: 'banks', role: 'author', route: '/author/banks' },
  { key: 'bank-detail', role: 'author', route: `/author/banks/${MOCK_IDS.bankId}` },
  { key: 'papers', role: 'author', route: '/author/papers' },
  { key: 'composer', role: 'author', route: '/author/papers/composer' },
  { key: 'paper-preview', role: 'author', route: `/author/papers/${MOCK_IDS.paperId}/preview` },
  { key: 'exam-home', role: 'examinee', route: '/exam/home' },
  { key: 'exam-my', role: 'examinee', route: '/exam/my' },
  { key: 'exam-taking', role: 'examinee', route: `/exam/taking/${MOCK_IDS.takingId}` },
  { key: 'exam-scores', role: 'examinee', route: '/exam/scores' },
  { key: 'score-detail', role: 'examinee', route: `/score-detail/${MOCK_IDS.recordId}` },
  { key: 'exam-retakes', role: 'examinee', route: '/exam/retakes' },
  { key: 'notifications', role: 'admin', route: '/notifications' },
];

/**
 * 探针：同一语义在设计图与工程里的选择器 + 要对比的属性。
 * 属性只挑「看得见的刻度」——字号/字重/行高/内距/圆角/边框/底色/字色/尺寸。
 */
const P = (name, designSel, appSel, props) => ({ name, designSel, appSel, props });
const BOX = ['fontSize', 'fontWeight', 'lineHeight', 'color', 'backgroundColor', 'borderRadius', 'padding', 'height', 'width', 'borderColor', 'borderWidth', 'boxShadow', 'letterSpacing', 'textTransform'];
const LAYOUT_PROBES = [
  P('侧栏', '.side', '.layout__aside', ['width', 'backgroundColor', 'borderRightColor']),
  P('顶栏', '.top', '.layout__header', ['height', 'backgroundColor', 'borderBottomColor', 'boxShadow']),
  P('内容区', '.content', '.layout__content', ['padding', 'backgroundColor']),
  P('页面标题', '.ph h1', '.page-header__title', ['fontSize', 'fontWeight', 'letterSpacing', 'color', 'margin']),
  P('页面说明', '.ph p', '.page-header__desc', ['fontSize', 'color', 'marginTop']),
];
const PRIMITIVE_PROBES = [
  P('卡片', '.card', '.el-card.el-card', ['borderRadius', 'borderColor', 'backgroundColor', 'boxShadow', 'padding']),
  P('卡头', '.card__hd', '.el-card__header', ['minHeight', 'padding', 'borderBottomColor']),
  P('卡头标题', '.card__hd h3', '.el-card__header', ['fontSize', 'fontWeight', 'color']),
  P('卡片内距', '.card__bd', '.el-card__body', ['padding']),
  P('主按钮', '.btn--p', '.el-button--primary', ['height', 'padding', 'borderRadius', 'fontSize', 'fontWeight', 'backgroundColor', 'color']),
  P('次按钮', '.btn--s', '.el-button:not(.el-button--primary):not(.el-button--danger):not(.is-text):not(.is-link)', ['height', 'padding', 'borderRadius', 'fontSize', 'fontWeight', 'borderColor', 'color']),
  P('表格表头', '.tbl th', '.el-table th.el-table__cell', ['fontSize', 'fontWeight', 'color', 'backgroundColor', 'letterSpacing', 'textTransform', 'padding', 'borderBottomColor']),
  P('表头底边(EP真实规则)', '.tbl th', '.el-table th.el-table__cell.is-leaf', ['borderBottomColor', 'borderBottomWidth']),
  P('表格单元', '.tbl td', '.el-table td.el-table__cell', ['fontSize', 'color', 'padding', 'borderBottomColor']),
  P('表头行高', '.tbl thead tr', '.el-table__header tr', ['height']),
  P('数据行高', '.tbl tbody tr', '.el-table__body tr', ['height']),
  P('页签', '.tabs button', '.el-tabs__item', ['height', 'fontSize', 'fontWeight', 'color', 'padding']),
  P('分页选中', '.pg.is-on', '.el-pager li.is-active', ['height', 'width', 'fontSize', 'borderRadius', 'backgroundColor', 'color']),
  P('提示条', '.tip', '.el-alert.el-alert', ['padding', 'borderRadius', 'fontSize', 'backgroundColor', 'color']),
  P('空态图标', '.emp__ic', '.empty-state__icon', ['width', 'height', 'borderRadius', 'backgroundColor', 'color']),
  P('输入框', '.inp', '.el-input__wrapper', ['height', 'borderRadius', 'backgroundColor', 'boxShadow']),
  P('统计卡数值', '.stat__v', '.stat-card__value', ['fontSize', 'fontWeight', 'letterSpacing', 'color', 'marginTop']),
  P('统计卡图标', '.stat__ico', '.stat-card__icon', ['width', 'height', 'borderRadius', 'backgroundColor', 'color']),
  P('统计卡左条', '.stat__rule', '.stat-card__rule', ['width', 'backgroundColor']),
  P('徽标', '.bdg', '.el-tag', ['height', 'padding', 'borderRadius', 'fontSize', 'fontWeight']),
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
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }
  async eval(expression) {
    const r = await this.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? 'eval failed');
    return r.result.value;
  }
}

/** 在页面里跑探针：返回 { 探针名: { 属性: 值 } }，选择器未命中记为 null */
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
    for (const prop of p.props) {
      rec[prop] = px(cs[prop]);
    }
    const r = el.getBoundingClientRect();
    rec.__rect = Math.round(r.width) + 'x' + Math.round(r.height);
    out[p.name] = rec;
  }
  return out;
})`;

/** 页面结构清单：卡片/分区标题文本 + 表格列名，用于「设计图有而工程无」的结构比对。
 *  两侧选择器不同（设计图是 .card__hd h3，工程是 .el-card__header），必须分开传。 */
const HEAD_SEL = {
  design: ['.card__hd h3', '.ph h1', '.dstage__cap .micro'],
  app: ['.el-card__header', '.page-header__title'],
};
const STRUCT_FN = `
function (headSels) {
  const clean = (el) => {
    const t = (el.textContent || '').trim().replace(/\\s+/g, ' ');
    return t.length <= 40 ? t : t.slice(0, 40);
  };
  const heads = [];
  for (const s of headSels) {
    document.querySelectorAll(s).forEach((el) => {
      const t = clean(el);
      if (t) heads.push(t);
    });
  }
  return {
    heads: heads.filter(Boolean),
    tableHeads: [...document.querySelectorAll('.tbl thead th, .el-table th.el-table__cell')]
      .map((e) => (e.textContent || '').trim()).filter(Boolean),
    cards: document.querySelectorAll('.card, .el-card').length,
    tables: document.querySelectorAll('.tbl, .el-table').length,
    buttons: document.querySelectorAll('.btn, .el-button').length,
  };
}`;

/** EP 组件级变量实测值（EP 会在组件作用域重定义同名变量，覆盖 :root 全局赋值） */
const VARS_FN = `
(function () {
  const names = ['--el-color-primary','--el-border-color','--el-border-radius-base','--el-input-border-color','--el-table-border-color','--el-card-padding','--el-tabs-header-height','--el-pagination-button-height','--el-font-size-base','--el-text-color-regular','--el-text-color-primary','--el-fill-color-light','--el-bg-color-page'];
  const from = (sel) => {
    const el = document.querySelector(sel) || document.documentElement;
    const cs = getComputedStyle(el);
    const o = {};
    for (const n of names) o[n] = cs.getPropertyValue(n).trim();
    return o;
  };
  return { root: from(':root'), input: from('.el-input'), table: from('.el-table') };
})()`;

const ws = new WebSocket(await findPageWs());
await new Promise((r, j) => {
  ws.addEventListener('open', r, { once: true });
  ws.addEventListener('error', j, { once: true });
});
const cdp = new CDP(ws);
await cdp.send('Page.enable');
await cdp.send('Runtime.enable');
await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });

const probeSet = [...LAYOUT_PROBES, ...PRIMITIVE_PROBES];
/** 把探针集转成页面内执行用的参数（side 决定用设计图选择器还是工程选择器） */
const toFnArgs = (side) =>
  JSON.stringify(
    probeSet.map((p) => ({ name: p.name, sel: side === 'design' ? p.designSel : p.appSel, props: p.props })),
  );

async function measure(url, side, waitMs) {
  await cdp.send('Page.navigate', { url });
  await sleep(waitMs);
  // 等渲染稳定（连续两次 innerHTML 长度一致）
  let prev = -1;
  for (let i = 0; i < 8; i += 1) {
    const len = await cdp.eval(`document.body.innerHTML.length`);
    if (len === prev && prev > 0) break;
    prev = len;
    await sleep(900);
  }
  const probes = await cdp.eval(`${PROBE_FN}(${toFnArgs(side)})`);
  const struct = await cdp.eval(`(${STRUCT_FN})(${JSON.stringify(HEAD_SEL[side])})`);
  const vars = side === 'app' ? await cdp.eval(VARS_FN) : null;
  const path = await cdp.eval(`location.pathname`);
  return { probes, struct, vars, path };
}

const tokenFor = (role) =>
  role === 'admin' ? TOKEN_ADMIN : role === 'author' ? TOKEN_AUTHOR : role === 'examinee' ? TOKEN_EXAMINEE : null;

// 先落到登录页，写入三种 token 备用（后续按角色覆盖）
await cdp.send('Page.navigate', { url: `${BASE}/login` });
await sleep(2500);

const report = { generatedAt: new Date().toISOString(), pages: {} };
const list = ONLY ? PAGES.filter((p) => ONLY.includes(p.key)) : PAGES;

for (const page of list) {
  const entry = { role: page.role, route: page.route, design: {}, app: {}, designStruct: null, appStruct: null, appPath: null };
  try {
    const d = await measure(DESIGN(page.key), 'design', 2200);
    entry.design = d.probes;
    entry.designStruct = d.struct;

    const tk = tokenFor(page.role);
    await cdp.eval(
      tk
        ? `localStorage.setItem('exam_sys.token', ${JSON.stringify(tk)}); localStorage.removeItem('exam_sys.user')`
        : `localStorage.removeItem('exam_sys.token')`,
    );
    const a = await measure(`${BASE}${page.route}`, 'app', 4200);
    entry.app = a.probes;
    entry.appStruct = a.struct;
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
