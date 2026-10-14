/* =====================================================================
   UI Kit · 布局引擎（原型用，不属于产品代码）
   用法：<body data-page="exams"> → 自动注入侧栏 / 顶栏 / 页面索引控件
   ===================================================================== */
(function () {
  'use strict';

  /* ---------------- 图标库 ---------------- */
  var ICONS = {
    grid:'<rect x="2.4" y="2.4" width="4.6" height="4.6" rx="1.2"/><rect x="9" y="2.4" width="4.6" height="4.6" rx="1.2"/><rect x="2.4" y="9" width="4.6" height="4.6" rx="1.2"/><rect x="9" y="9" width="4.6" height="4.6" rx="1.2"/>',
    file:'<path d="M3.6 1.9h5.2l3.6 3.6v8.6H3.6z"/><path d="M8.8 1.9v3.6h3.6"/><path d="M5.8 9h4.4M5.8 11.4h3"/>',
    bank:'<ellipse cx="8" cy="3.9" rx="4.9" ry="2.1"/><path d="M3.1 3.9v8.2c0 1.2 2.2 2.1 4.9 2.1s4.9-.9 4.9-2.1V3.9"/><path d="M3.1 8c0 1.2 2.2 2.1 4.9 2.1s4.9-.9 4.9-2.1"/>',
    layers:'<path d="M8 1.9l5.6 3.1L8 8.1 2.4 5z"/><path d="M2.4 8.6L8 11.7l5.6-3.1"/><path d="M2.4 11.6L8 14.7l5.6-3.1"/>',
    check:'<path d="M13.2 4.4L6.4 11.5 2.8 8"/>',
    circcheck:'<circle cx="8" cy="8" r="6.1"/><path d="M5.4 8.2l1.9 1.9 3.4-3.9"/>',
    chart:'<path d="M2.6 13.4h10.8"/><path d="M4.8 13.4V9M8 13.4V5.2M11.2 13.4v-3"/>',
    users:'<circle cx="6" cy="5.4" r="2.4"/><path d="M1.9 13.4c0-2.3 1.8-3.5 4.1-3.5s4.1 1.2 4.1 3.5"/><path d="M10.9 3.5a2.2 2.2 0 010 3.9"/><path d="M12.3 13.4c0-1.5-.5-2.5-1.5-3.1"/>',
    cog:'<circle cx="8" cy="8" r="2.1"/><path d="M8 1.6v1.7M8 12.7v1.7M1.6 8h1.7M12.7 8h1.7M3.5 3.5l1.2 1.2M11.3 11.3l1.2 1.2M12.5 3.5l-1.2 1.2M4.7 11.3l-1.2 1.2"/>',
    shield:'<path d="M8 1.9l4.9 1.7v4.2c0 3.1-2 5.3-4.9 6.3-2.9-1-4.9-3.2-4.9-6.3V3.6z"/><path d="M6 7.9l1.5 1.5 2.8-3.1"/>',
    bell:'<path d="M4 6.6a4 4 0 018 0c0 3 1.1 3.9 1.1 3.9H2.9S4 9.6 4 6.6z"/><path d="M6.6 12.5a1.7 1.7 0 002.8 0"/>',
    search:'<circle cx="7.2" cy="7.2" r="4.4"/><path d="M10.5 10.5L14 14"/>',
    help:'<circle cx="8" cy="8" r="6.1"/><path d="M6.4 6.3a1.7 1.7 0 013.3.4c0 1.1-1.7 1.3-1.7 1.3"/><circle cx="8" cy="11.2" r=".8" fill="currentColor" stroke="none"/>',
    plus:'<path d="M8 3.4v9.2M3.4 8h9.2"/>',
    filter:'<path d="M2.2 3.5h11.6L9.2 8.8v4.4l-2.4-1.3V8.8z"/>',
    download:'<path d="M8 2.4v7.4"/><path d="M5.1 7.2L8 10.1l2.9-2.9"/><path d="M2.8 12.9h10.4"/>',
    upload:'<path d="M8 10.1V2.7"/><path d="M5.1 5.6L8 2.7l2.9 2.9"/><path d="M2.8 12.9h10.4"/>',
    more:'<circle cx="3.6" cy="8" r="1.15" fill="currentColor" stroke="none"/><circle cx="8" cy="8" r="1.15" fill="currentColor" stroke="none"/><circle cx="12.4" cy="8" r="1.15" fill="currentColor" stroke="none"/>',
    chevd:'<path d="M4.4 6.4L8 10l3.6-3.6"/>',
    chevr:'<path d="M6.4 4.4L10 8l-3.6 3.6"/>',
    chevl:'<path d="M9.6 4.4L6 8l3.6 3.6"/>',
    x:'<path d="M4.2 4.2l7.6 7.6M11.8 4.2l-7.6 7.6"/>',
    clock:'<circle cx="8" cy="8" r="6.1"/><path d="M8 4.6V8l2.3 1.5"/>',
    cal:'<rect x="2.4" y="3.5" width="11.2" height="10.1" rx="1.7"/><path d="M2.4 6.7h11.2M5.7 2.3v2.4M10.3 2.3v2.4"/>',
    edit:'<path d="M11.3 2.6l2.2 2.2-8 8H3.2v-2.3z"/><path d="M9.9 4l2.2 2.2"/>',
    trash:'<path d="M2.9 4.3h10.2"/><path d="M6.3 4.3V2.9h3.4v1.4"/><path d="M4.3 4.3l.7 9h6l.7-9"/>',
    eye:'<path d="M1.8 8S4 4.2 8 4.2 14.2 8 14.2 8 12 11.8 8 11.8 1.8 8 1.8 8z"/><circle cx="8" cy="8" r="1.9"/>',
    send:'<path d="M14 2L7.2 8.8"/><path d="M14 2l-4.6 12-2.2-5.2L2 6.6z"/>',
    flag:'<path d="M3.6 14V2.4"/><path d="M3.6 3.2h7.8l-1.4 2.6 1.4 2.6H3.6"/>',
    logout:'<path d="M6.6 2.6H3.4v10.8h3.2"/><path d="M6.4 8h7.2"/><path d="M10.9 5.4L13.5 8l-2.6 2.6"/>',
    refresh:'<path d="M13.2 8a5.2 5.2 0 11-1.6-3.8"/><path d="M13.4 2.6v2.9h-2.9"/>',
    grip:'<circle cx="6" cy="4.4" r="1" fill="currentColor" stroke="none"/><circle cx="6" cy="8" r="1" fill="currentColor" stroke="none"/><circle cx="6" cy="11.6" r="1" fill="currentColor" stroke="none"/><circle cx="10" cy="4.4" r="1" fill="currentColor" stroke="none"/><circle cx="10" cy="8" r="1" fill="currentColor" stroke="none"/><circle cx="10" cy="11.6" r="1" fill="currentColor" stroke="none"/>',
    arrowur:'<path d="M4.4 11.6L11.6 4.4"/><path d="M5.9 4.4h5.7v5.7"/>',
    arrowdr:'<path d="M4.4 4.4l7.2 7.2"/><path d="M11.6 5.9v5.7H5.9"/>',
    star:'<path d="M8 2.1l1.75 3.7 4.05.55-2.95 2.75.72 3.9L8 11.15l-3.57 1.85.72-3.9L2.2 6.35l4.05-.55z"/>',
    play:'<path d="M5 3.2l7.4 4.8L5 12.8z"/>',
    pause:'<path d="M6 3.2v9.6M10 3.2v9.6"/>',
    key:'<circle cx="5.4" cy="8" r="2.8"/><path d="M8.2 8h5.4"/><path d="M11.4 8v2.4M13.2 8v1.8"/>',
    list:'<path d="M5.6 4.2h8M5.6 8h8M5.6 11.8h8"/><circle cx="2.7" cy="4.2" r=".9" fill="currentColor" stroke="none"/><circle cx="2.7" cy="8" r=".9" fill="currentColor" stroke="none"/><circle cx="2.7" cy="11.8" r=".9" fill="currentColor" stroke="none"/>',
    img:'<rect x="2.2" y="3.2" width="11.6" height="9.6" rx="1.6"/><circle cx="6" cy="6.6" r="1.1"/><path d="M2.6 11l3.2-2.8 2.6 2.2 2.2-1.8 3 2.6"/>',
    mail:'<rect x="2" y="3.6" width="12" height="8.8" rx="1.6"/><path d="M2.6 5l5.4 3.6L13.4 5"/>',
    warn:'<path d="M8 2.2l6 10.6H2z"/><path d="M8 6.4v3"/><circle cx="8" cy="11.2" r=".7" fill="currentColor" stroke="none"/>',
    link:'<path d="M6.6 9.4a2.8 2.8 0 004.2.3l1.8-1.8a2.8 2.8 0 00-4-4l-1 1"/><path d="M9.4 6.6a2.8 2.8 0 00-4.2-.3L3.4 8.1a2.8 2.8 0 004 4l1-1"/>',
    db:'<ellipse cx="8" cy="3.9" rx="4.9" ry="2.1"/><path d="M3.1 3.9v8.2c0 1.2 2.2 2.1 4.9 2.1s4.9-.9 4.9-2.1V3.9"/><path d="M3.1 8c0 1.2 2.2 2.1 4.9 2.1s4.9-.9 4.9-2.1"/>',
    home:'<path d="M2.6 7.4L8 3l5.4 4.4V14H2.6z"/><path d="M6.4 14V9.6h3.2V14"/>',
    doc:'<path d="M4 2h5l3 3v9H4z"/><path d="M9 2v3h3"/>',
    cut:'<circle cx="4.4" cy="4.4" r="1.9"/><circle cx="4.4" cy="11.6" r="1.9"/><path d="M6 5.8L13.4 12M6 10.2L13.4 4"/>',
    copy:'<rect x="5.6" y="5.6" width="7.8" height="7.8" rx="1.5"/><path d="M10.4 5.6V4a1.5 1.5 0 00-1.5-1.5H4a1.5 1.5 0 00-1.5 1.5v4.9A1.5 1.5 0 004 10.4h1.6"/>'
  };

  /* ---------------- 页面注册表（顺序即上一页/下一页顺序） ---------------- */
  var PAGES = [
    { f:'login',            t:'登录',            role:'admin',    nav:'',                 crumb:'登录' },
    { f:'dashboard',        t:'数据总览',        role:'admin',    nav:'dashboard',        crumb:'考试运营 / 数据总览' },
    { f:'exams',            t:'考试管理',        role:'admin',    nav:'exams',            crumb:'考试运营 / 考试管理' },
    { f:'exam-monitor',     t:'监考监控',        role:'admin',    nav:'exams',            crumb:'考试管理 / 监考监控' },
    { f:'retakes',          t:'补考管理',        role:'admin',    nav:'retakes',          crumb:'考试运营 / 补考管理' },
    { f:'reviews',          t:'人工阅卷',        role:'admin',    nav:'reviews',          crumb:'考试运营 / 人工阅卷' },
    { f:'appeals',          t:'成绩复核',        role:'admin',    nav:'appeals',          crumb:'考试运营 / 成绩复核' },
    { f:'scores',           t:'成绩报表',        role:'admin',    nav:'scores',           crumb:'考试运营 / 成绩报表' },
    { f:'banks',            t:'题库管理',        role:'admin',    nav:'banks',            crumb:'教研组卷 / 题库管理' },
    { f:'bank-detail',      t:'题库详情',        role:'admin',    nav:'banks',            crumb:'题库管理 / 题库详情' },
    { f:'papers',           t:'试卷管理',        role:'admin',    nav:'papers',           crumb:'教研组卷 / 试卷管理' },
    { f:'composer',         t:'组卷工作台',      role:'admin',    nav:'papers',           crumb:'试卷管理 / 组卷' },
    { f:'paper-preview',    t:'试卷预览',        role:'admin',    nav:'papers',           crumb:'试卷管理 / 试卷预览' },
    { f:'departments',      t:'科室管理',        role:'admin',    nav:'departments',      crumb:'组织与权限 / 科室管理' },
    { f:'users',            t:'用户管理',        role:'admin',    nav:'users',            crumb:'组织与权限 / 用户管理' },
    { f:'permissions',      t:'菜单权限',        role:'admin',    nav:'permissions',      crumb:'组织与权限 / 菜单权限' },
    { f:'content',          t:'公告与轮播',      role:'admin',    nav:'content',          crumb:'内容管理 / 公告与轮播' },
    { f:'home-config',      t:'首页配置',        role:'admin',    nav:'home-config',      crumb:'内容管理 / 首页配置' },
    { f:'practice-settings',t:'练题端设置',      role:'admin',    nav:'practice-settings',crumb:'内容管理 / 练题端设置' },
    { f:'settings',         t:'系统设置',        role:'admin',    nav:'settings',         crumb:'系统 / 系统设置' },
    { f:'audit',            t:'审计日志',        role:'admin',    nav:'audit',            crumb:'系统 / 审计日志' },
    { f:'login-logs',       t:'登录日志',        role:'admin',    nav:'login-logs',       crumb:'系统 / 登录日志' },
    { f:'maintenance',      t:'系统维护',        role:'admin',    nav:'maintenance',      crumb:'系统 / 系统维护' },
    { f:'exam-home',        t:'考试首页',        role:'examinee', nav:'home',             crumb:'考试首页' },
    { f:'exam-my',          t:'我的考试',        role:'examinee', nav:'my',               crumb:'我的考试' },
    { f:'exam-taking',      t:'在线答题',        role:'examinee', nav:'',                 crumb:'在线答题' },
    { f:'exam-scores',      t:'我的成绩',        role:'examinee', nav:'scores',           crumb:'我的成绩' },
    { f:'score-detail',     t:'成绩明细',        role:'examinee', nav:'scores',           crumb:'我的成绩 / 成绩明细' },
    { f:'exam-retakes',     t:'我的补考',        role:'examinee', nav:'retakes',          crumb:'我的补考' },
    { f:'notifications',    t:'消息中心',        role:'examinee', nav:'notifications',    crumb:'消息中心' },
    { f:'dialogs',          t:'业务弹窗合集',    role:'admin',    nav:'',                 crumb:'组件 / 业务弹窗' },
    { f:'p-login',          t:'练题端 · 登录',   role:'practice', nav:'',                 crumb:'练题端 / 登录' },
    { f:'p-home',           t:'练题端 · 首页',   role:'practice', nav:'home',             crumb:'练题端 / 首页' },
    { f:'p-session',        t:'练题端 · 答题',   role:'practice', nav:'home',             crumb:'练题端 / 答题' },
    { f:'p-wrongbook',      t:'练题端 · 错题本', role:'practice', nav:'wrong',            crumb:'练题端 / 错题本' },
    { f:'p-report',         t:'练题端 · 报告',   role:'practice', nav:'report',           crumb:'练题端 / 学习报告' },
    { f:'p-favorites',      t:'练题端 · 收藏',   role:'practice', nav:'favorites',        crumb:'练题端 / 我的收藏' },
    { f:'p-profile',        t:'练题端 · 我的',   role:'practice', nav:'profile',          crumb:'练题端 / 我的' }
  ];

  var MENUS = {
    admin: [
      { g:'考试运营', items:[
        ['dashboard','数据总览','grid'], ['exams','考试管理','file', 6], ['retakes','补考管理','refresh'],
        ['reviews','人工阅卷','circcheck', 128], ['appeals','成绩复核','flag', 3], ['scores','成绩报表','chart']
      ]},
      { g:'教研组卷', items:[
        ['banks','题库管理','bank'], ['papers','试卷管理','layers']
      ]},
      { g:'组织与权限', items:[
        ['departments','科室管理','users'], ['users','用户管理','users'], ['permissions','菜单权限','key']
      ]},
      { g:'内容管理', items:[
        ['content','公告与轮播','img'], ['home-config','首页配置','home'], ['practice-settings','练题端设置','edit']
      ]},
      { g:'系统', items:[
        ['settings','系统设置','cog'], ['audit','审计日志','shield'], ['login-logs','登录日志','clock'],
        ['maintenance','系统维护','db']
      ]}
    ],
    author: [
      { g:'教研组卷', items:[
        ['banks','题库管理','bank'], ['papers','试卷管理','layers'], ['reviews','人工阅卷','circcheck', 12]
      ]}
    ],
    examinee: [
      { g:'我的考试', items:[
        ['home','考试首页','home'], ['my','我的考试','file'], ['scores','我的成绩','chart'], ['retakes','我的补考','refresh']
      ]},
      { g:'消息', items:[ ['notifications','消息中心','bell', 5] ]}
    ],
    practice: []
  };

  var USERS = {
    admin:    { name:'陈明远', role:'系统管理员', init:'陈', ph:'搜索考试、试卷、考生…' },
    author:   { name:'林静',   role:'出题人 · 教研', init:'林', ph:'搜索题库、试卷、题目…' },
    examinee: { name:'周然',   role:'考生 · 安全生产部', init:'周', ph:'搜索考试…' },
    practice: { name:'张小北', role:'练题学员', init:'张', ph:'搜索题库…' }
  };

  function el(html) { var d = document.createElement('div'); d.innerHTML = html.trim(); return d.firstChild; }
  function icon(n, cls) { return '<svg class="ic ' + (cls || '') + '"><use href="#i-' + n + '"/></svg>'; }

  /* ---------------- 图标 sprite ---------------- */
  (function injectSprite() {
    var s = '<svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs>';
    Object.keys(ICONS).forEach(function (k) { s += '<symbol id="i-' + k + '" viewBox="0 0 16 16">' + ICONS[k] + '</symbol>'; });
    s += '</defs></svg>';
    document.body.insertBefore(el(s), document.body.firstChild);
  })();

  var pageKey = document.body.dataset.page || 'dashboard';
  var meta = PAGES.filter(function (p) { return p.f === pageKey; })[0] || PAGES[1];
  var role = document.body.dataset.role || meta.role;
  if (role === 'practice') { return; }                 // 练题端走 mshell.js
  if (pageKey === 'login') { buildPctl(); return; }    // 登录页无壳

  var user = USERS[role] || USERS.admin;

  /* ---------------- 侧栏 ---------------- */
  var side = '<aside class="side">'
    + '<div class="side__brand"><div class="side__mark">考</div>'
    + '<div class="side__name">考试中心<small>EXAM CENTER</small></div></div>'
    + '<div class="side__scroll">';
  (MENUS[role] || MENUS.admin).forEach(function (grp) {
    side += '<div class="side__grp">' + grp.g + '</div>';
    grp.items.forEach(function (it) {
      var on = it[0] === meta.nav ? ' is-on' : '';
      side += '<a class="nav__i' + on + '" href="' + it[0] + '.html">' + icon(it[2])
        + '<span>' + it[1] + '</span>'
        + (it[3] ? '<span class="cnt">' + it[3] + '</span>' : '') + '</a>';
    });
  });
  side += '</div><div class="side__foot"><div class="side__user">'
    + '<div class="av av--sm">' + user.init + '</div>'
    + '<div class="flex1"><div class="nm">' + user.name + '</div><div class="rl">' + user.role + '</div></div>'
    + icon('chevd', '') + '</div></div></aside>';

  /* ---------------- 顶栏 ---------------- */
  var top = '<header class="top">'
    + '<div class="crumb"><span>考试运营</span><span class="sp">/</span><b>' + meta.crumb.split(' / ').pop() + '</b></div>'
    + '<div class="top__sp"></div>'
    + '<label class="search">' + icon('search') + '<input placeholder="' + user.ph + '"><kbd>⌘K</kbd></label>'
    + '<a class="iconbtn" href="notifications.html" title="消息中心">' + icon('bell') + '<span class="iconbtn__dot"></span></a>'
    + '<button class="iconbtn" title="帮助">' + icon('help') + '</button>'
    + '</header>';

  /* ---------------- 组装 ---------------- */
  var page = document.getElementById('page');
  var app = el('<div class="app"></div>');
  if (document.body.dataset.bare !== '1') app.appendChild(el(side));
  var main = el('<div class="main"></div>');
  main.appendChild(el(top));
  var content = el('<div class="content"></div>');
  if (page) { content.innerHTML = page.innerHTML; page.parentNode.removeChild(page); }
  main.appendChild(content);
  app.appendChild(main);
  document.body.insertBefore(app, document.body.firstChild);

  /* 统一修正侧栏高亮（面包屑首段） */
  var seg = meta.crumb.split(' / ');
  app.querySelector('.crumb').innerHTML = seg.length > 1
    ? '<span>' + seg[0] + '</span><span class="sp">/</span><b>' + seg[1] + '</b>'
    : '<b>' + meta.crumb + '</b>';

  /* ---------------- 交互：data-go 跳转 / 勾选 / 开关 / 单选 ---------------- */
  document.addEventListener('click', function (e) {
    var go = e.target.closest('[data-go]');
    if (go) { location.href = go.dataset.go + '.html'; return; }
    var cb = e.target.closest('.cb');
    if (cb) { cb.classList.toggle('is-on'); cb.classList.remove('is-part'); return; }
    var rd = e.target.closest('.rd');
    if (rd) {
      var g = rd.closest('[data-rdgroup]');
      if (g) { g.querySelectorAll('.rd').forEach(function (x) { x.classList.remove('is-on'); }); }
      rd.classList.add('is-on'); return;
    }
    var sw = e.target.closest('.switch');
    if (sw) { sw.classList.toggle('is-on'); return; }
    var tg = e.target.closest('.seg button, .tabs button');
    if (tg) {
      var box = tg.parentNode;
      box.querySelectorAll('button').forEach(function (x) { x.classList.remove('is-on'); });
      tg.classList.add('is-on'); return;
    }
    var op = e.target.closest('.opt');
    if (op) {
      var wrap = op.closest('[data-opts]') || op.parentNode;
      wrap.querySelectorAll('.opt').forEach(function (x) { x.classList.remove('is-on'); });
      op.classList.add('is-on'); return;
    }
    var acc = e.target.closest('.acc__h');
    if (acc) { var b = acc.nextElementSibling; if (b) b.style.display = b.style.display === 'none' ? '' : 'none'; return; }
  });

  /* ---------------- 页面索引控件 ---------------- */
  function buildPctl() {
    var i = PAGES.findIndex(function (p) { return p.f === pageKey; });
    var prev = PAGES[i - 1], next = PAGES[i + 1];
    var box = el('<div class="pctl"></div>');
    box.innerHTML =
      '<button onclick="location.href=\'../index.html\'">◱ 全部页面</button>'
      + (prev ? '<button onclick="location.href=\'' + prev.f + '.html\'">← ' + prev.t + '</button>' : '')
      + (next ? '<button onclick="location.href=\'' + next.f + '.html\'">' + next.t + ' →</button>' : '')
      + '<span class="who">' + (i + 1) + ' / ' + PAGES.length + ' · ' + meta.t + '</span>';
    document.body.appendChild(box);
  }
  buildPctl();
})();
