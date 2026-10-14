/* =====================================================================
   UI Kit · 练题端布局引擎（原型用）
   用法：<body data-page="p-home" data-tab="home" data-title="在线练题" data-sub="安全生产题库">
   ===================================================================== */
(function () {
  'use strict';

  var SPRITE = {
    home:'<path d="M2.6 7.4L8 3l5.4 4.4V14H2.6z"/><path d="M6.4 14V9.6h3.2V14"/>',
    wrong:'<path d="M3.4 2.4h9.2v11.2H3.4z"/><path d="M6 6.4l4 4M10 6.4l-4 4"/>',
    me:'<circle cx="8" cy="5.6" r="2.7"/><path d="M2.8 13.6c0-2.6 2.3-4 5.2-4s5.2 1.4 5.2 4"/>',
    chart:'<path d="M2.6 13.4h10.8"/><path d="M4.8 13.4V9M8 13.4V5.2M11.2 13.4v-3"/>',
    star:'<path d="M8 2.1l1.75 3.7 4.05.55-2.95 2.75.72 3.9L8 11.15l-3.57 1.85.72-3.9L2.2 6.35l4.05-.55z"/>',
    chevr:'<path d="M6.4 4.4L10 8l-3.6 3.6"/>',
    chevl:'<path d="M9.6 4.4L6 8l3.6 3.6"/>',
    chevd:'<path d="M4.4 6.4L8 10l3.6-3.6"/>',
    x:'<path d="M4.2 4.2l7.6 7.6M11.8 4.2l-7.6 7.6"/>',
    search:'<circle cx="7.2" cy="7.2" r="4.4"/><path d="M10.5 10.5L14 14"/>',
    clock:'<circle cx="8" cy="8" r="6.1"/><path d="M8 4.6V8l2.3 1.5"/>',
    check:'<path d="M13.2 4.4L6.4 11.5 2.8 8"/>',
    plus:'<path d="M8 3.4v9.2M3.4 8h9.2"/>',
    flag:'<path d="M3.6 14V2.4"/><path d="M3.6 3.2h7.8l-1.4 2.6 1.4 2.6H3.6"/>',
    send:'<path d="M14 2L7.2 8.8"/><path d="M14 2l-4.6 12-2.2-5.2L2 6.6z"/>',
    bank:'<ellipse cx="8" cy="3.9" rx="4.9" ry="2.1"/><path d="M3.1 3.9v8.2c0 1.2 2.2 2.1 4.9 2.1s4.9-.9 4.9-2.1V3.9"/><path d="M3.1 8c0 1.2 2.2 2.1 4.9 2.1s4.9-.9 4.9-2.1"/>',
    logout:'<path d="M6.6 2.6H3.4v10.8h3.2"/><path d="M6.4 8h7.2"/><path d="M10.9 5.4L13.5 8l-2.6 2.6"/>',
    cog:'<circle cx="8" cy="8" r="2.1"/><path d="M8 1.6v1.7M8 12.7v1.7M1.6 8h1.7M12.7 8h1.7M3.5 3.5l1.2 1.2M11.3 11.3l1.2 1.2M12.5 3.5l-1.2 1.2M4.7 11.3l-1.2 1.2"/>',
    refresh:'<path d="M13.2 8a5.2 5.2 0 11-1.6-3.8"/><path d="M13.4 2.6v2.9h-2.9"/>',
    doc:'<path d="M4 2h5l3 3v9H4z"/><path d="M9 2v3h3"/>',
    fire:'<path d="M8 14c2.5 0 4-1.6 4-3.8C12 7.6 10 6.4 8 2.4c0 2.6-4 3.6-4 7.8C4 12.4 5.5 14 8 14z"/>'
  };

  var TABS = [
    { k:'home',    t:'练题',   f:'p-home',      i:'home' },
    { k:'wrong',   t:'错题本', f:'p-wrongbook', i:'wrong' },
    { k:'report',  t:'报告',   f:'p-report',    i:'chart' },
    { k:'profile', t:'我的',   f:'p-profile',   i:'me' }
  ];

  var PAGES = ['p-login','p-home','p-session','p-wrongbook','p-report','p-favorites','p-profile'];
  var TITLES = { 'p-login':'登录','p-home':'在线练题','p-session':'练题','p-wrongbook':'错题本','p-report':'学习报告','p-favorites':'我的收藏','p-profile':'我的' };

  function el(h) { var d = document.createElement('div'); d.innerHTML = h.trim(); return d.firstChild; }
  function ic(n, cls) { return '<svg class="ic ' + (cls || '') + '"><use href="#i-' + n + '"/></svg>'; }

  var page = document.body.dataset.page || 'p-home';
  var tab = document.body.dataset.tab || 'home';
  var bare = page === 'p-login' || page === 'p-session';

  var sprite = '<svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs>';
  Object.keys(SPRITE).forEach(function (k) { sprite += '<symbol id="i-' + k + '" viewBox="0 0 16 16">' + SPRITE[k] + '</symbol>'; });
  sprite += '</defs></svg>';
  document.body.appendChild(el(sprite));

  var src = document.getElementById('page');
  var inner = src ? src.innerHTML : '';
  if (src) src.parentNode.removeChild(src);

  var scr = '<div class="phone__scr">';
  if (!bare) {
    scr += '<div class="m-status"><span>9:41</span><span class="r">'
        + '<svg class="ic" style="width:14px;height:14px"><use href="#i-fire"/></svg>'
        + '5G<span class="bat"></span></span></div>';
    var title = document.body.dataset.title || TITLES[page] || '';
    var sub = document.body.dataset.sub || '';
    scr += '<div class="m-bar">'
        + (document.body.dataset.back ? '<a href="' + document.body.dataset.back + '.html">' + ic('chevl') + '</a>' : '')
        + '<div class="flex1"><div class="m-bar__t">' + title + '</div>'
        + (sub ? '<div class="m-bar__sub">' + sub + '</div>' : '') + '</div>'
        + ic('search') + '</div>';
  } else {
    scr += '<div class="m-status m-status--bare"><span>9:41</span><span class="r">'
        + '<svg class="ic" style="width:14px;height:14px"><use href="#i-fire"/></svg>5G<span class="bat"></span></span></div>';
  }
  scr += '<div class="m-body' + (bare ? ' m-body--flush' : '') + '">' + inner + '</div>';

  if (!bare) {
    scr += '<nav class="m-tab">';
    TABS.forEach(function (t) {
      scr += '<a href="' + t.f + '.html" class="' + (t.k === tab ? 'is-on' : '') + '">' + ic(t.i) + '<span>' + t.t + '</span></a>';
    });
    scr += '</nav>';
  }
  scr += '</div>';

  var label = TITLES[page] || '';
  var wrap = el('<div class="phone-wrap"><div class="phone">' + scr + '</div><div class="phone__label">练题端 · ' + label + ' · 390 × 800</div></div>');
  document.body.insertBefore(wrap, document.body.firstChild);

  /* 交互 */
  document.addEventListener('click', function (e) {
    var go = e.target.closest('[data-go]');
    if (go) { location.href = go.dataset.go + '.html'; return; }
    var op = e.target.closest('.m-opt');
    if (op) {
      var w = op.closest('[data-opts]') || op.parentNode;
      w.querySelectorAll('.m-opt').forEach(function (x) { x.classList.remove('is-on'); });
      op.classList.add('is-on'); return;
    }
    var ch = e.target.closest('.m-chip');
    if (ch) { ch.parentNode.querySelectorAll('.m-chip').forEach(function (x) { x.classList.remove('is-on'); }); ch.classList.add('is-on'); return; }
  });

  /* 索引控件 */
  var i = PAGES.indexOf(page);
  var box = el('<div class="pctl"></div>');
  box.innerHTML = '<button onclick="location.href=\'../index.html\'">◱ 全部页面</button>'
    + (i > 0 ? '<button onclick="location.href=\'' + PAGES[i - 1] + '.html\'">← ' + TITLES[PAGES[i - 1]] + '</button>' : '')
    + (i < PAGES.length - 1 ? '<button onclick="location.href=\'' + PAGES[i + 1] + '.html\'">' + TITLES[PAGES[i + 1]] + ' →</button>' : '')
    + '<span class="who">' + (i + 1) + ' / ' + PAGES.length + ' · 练题端</span>';
  document.body.appendChild(box);
})();
