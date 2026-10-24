/* Compatibility for the existing deployment; frontend guards also detect the App UA.
 * This only controls learner navigation. Server roles still authorize every API. */
(() => {
  if (window.__zhuodaLearnerMode) return;
  window.__zhuodaLearnerMode = true;
  const allowedPath = (path) => path === '/' || path === '/login' || path === '/no-access'
    || path === '/profile' || path === '/notifications'
    || path.startsWith('/exam/') || path.startsWith('/score-detail/');
  const check = (url) => {
    const next = new URL(url || location.href, location.href);
    if (next.origin !== location.origin || allowedPath(next.pathname)) return true;
    localStorage.removeItem('exam_sys.token');
    location.replace('/login?learnerOnly=1');
    return false;
  };
  for (const name of ['pushState', 'replaceState']) {
    const original = history[name];
    history[name] = function (state, unused, url) {
      if (check(url)) return original.apply(this, arguments);
    };
  }
  window.addEventListener('popstate', () => check(location.href));
  // 成绩 CSV / 准考证 PDF 是前端创建的 Blob。交给原生系统文件保存器，
  // 由原生主动读取队列，不暴露可被 iframe 调用的 JavascriptInterface。
  window.__zhuodaDownloadQueue = [];
  const captureDownload = (anchor) => {
    if (!anchor.hasAttribute('download') || !anchor.href.startsWith('blob:')) return false;
    if (window.__zhuodaDownloadQueue.length >= 3) { alert('请先完成当前文件的保存'); return true; }
    const name = anchor.download || '学习资料';
    fetch(anchor.href).then((response) => {
      if (!response.ok) throw new Error('download failed');
      return response.blob();
    }).then((blob) => {
      if (blob.size > 10 * 1024 * 1024) throw new Error('file too large');
      const reader = new FileReader();
      reader.onload = () => window.__zhuodaDownloadQueue.push({ name, data: reader.result });
      reader.onerror = () => alert('文件读取失败，请重试');
      reader.readAsDataURL(blob);
    }).catch(() => alert('文件准备失败或超过 10 MB，请重试或通过网页端下载'));
    return true;
  };
  const anchorClick = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function () {
    if (!captureDownload(this)) return anchorClick.apply(this, arguments);
  };
  document.addEventListener('click', (event) => {
    const anchor = event.target.closest?.('a[download]');
    if (anchor && captureDownload(anchor)) event.preventDefault();
  }, true);
  const style = document.createElement('style');
  style.textContent = '.login__demo{display:none!important}body{overscroll-behavior-y:none}';
  document.head.appendChild(style);
  const ensureMobileLogin = () => {
    const card = document.querySelector('.login__card');
    if (!card || location.pathname !== '/login') return;
    if (!card.querySelector('.login-mobile-hero')) {
      const hero = document.createElement('header');
      hero.className = 'login-mobile-hero';
      hero.innerHTML = '<div class="login-mobile-brand"><img src="/brand/app-icon.svg" alt="" aria-hidden="true"><div><div class="login-mobile-brand__name"></div><small class="login-mobile-brand__caption">学员学习中心</small></div></div><div class="login-mobile-intro"><h1>学有所获，<br><span>每一步都算数。</span></h1><p>把知识积累，变成成长的底气。</p></div>';
      card.prepend(hero);
    }
    const originalName = card.querySelector('.login__logo-name')?.cloneNode(true);
    originalName?.querySelector('small')?.remove();
    const name = originalName?.textContent.trim() || document.title;
    const brandName = card.querySelector('.login-mobile-brand__name');
    if (brandName && brandName.textContent !== name) brandName.textContent = name;
    const form = card.querySelector('.login__form-wrap');
    if (form && !form.querySelector('.login-mobile-help')) {
      const help = document.createElement('details');
      help.className = 'login-mobile-help';
      help.innerHTML = '<summary>登录遇到问题？</summary><p>账号由单位统一分配。忘记密码或账号无法使用，请联系科室管理员重置；首次登录后请及时修改初始密码。</p>';
      form.appendChild(help);
    }
    if (!card.querySelector('.login-mobile-footer')) {
      const footer = document.createElement('footer');
      footer.className = 'login-mobile-footer';
      footer.innerHTML = '<p class="login-mobile-footer__features">学习课程 · 在线练题 · 考试测评</p><p class="login-mobile-footer__copyright"></p>';
      card.appendChild(footer);
    }
    const copyright = card.querySelector('.login__copyright')?.textContent.trim() || '';
    const footerCopyright = card.querySelector('.login-mobile-footer__copyright');
    if (footerCopyright && footerCopyright.textContent !== copyright) footerCopyright.textContent = copyright;
  };
  const updateLogin = () => {
    ensureMobileLogin();
    const title = document.querySelector('.login__title');
    if (title && !title.querySelector('.login__title-mobile') && ['登录考试系统', '学员登录'].includes(title.textContent.trim())) title.textContent = '欢迎回来';
    const subtitle = document.querySelector('.login__subtitle');
    const text = new URLSearchParams(location.search).has('learnerOnly')
      ? '请使用学员账号登录；管理员和出题人请使用网页端。'
      : '登录工作账号，开启今天的学习';
    if (subtitle && !subtitle.querySelector('.login__subtitle-mobile') && location.pathname === '/login' && subtitle.textContent.includes('使用工作账号') && subtitle.textContent !== text) {
      subtitle.textContent = text;
    }
  };
  new MutationObserver(updateLogin).observe(document.body, { childList: true, subtree: true });
  updateLogin();
  check(location.href);
})();
