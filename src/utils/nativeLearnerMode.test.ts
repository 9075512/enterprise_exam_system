import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

const script = readFileSync(resolve('mobile/android/app/src/main/assets/learner-mode.js'), 'utf8');

function setup(path = '/login') {
  document.body.innerHTML = '<h2 class="login__title">登录考试系统</h2><p class="login__subtitle">使用工作账号进入考试管理系统</p>';
  const replace = vi.fn();
  const history = { pushState: vi.fn(), replaceState: vi.fn() };
  const storage = { removeItem: vi.fn() };
  const nativeClick = vi.fn();
  const location = { href: `http://139.9.134.68${path}`, origin: 'http://139.9.134.68', pathname: path, search: '', replace };
  const context = {
    window: { addEventListener: vi.fn(), __zhuodaDownloadQueue: [] as { name: string; data: string }[] },
    document, history, localStorage: storage, location, URL, URLSearchParams,
    fetch: vi.fn(), alert: vi.fn(),
    FileReader: class {
      result = 'data:text/csv;base64,YSxi';
      onload: (() => void) | null = null;
      readAsDataURL() { this.onload?.(); }
    },
    HTMLAnchorElement: class {
      download = '';
      href = '';
      hasAttribute(name: string) { return name === 'download' && this.download !== ''; }
      click() { nativeClick(); }
    },
    MutationObserver: class { observe() {} },
  };
  runInNewContext(script, context);
  return { context, history, storage, replace, nativeClick };
}

afterEach(() => { document.body.innerHTML = ''; document.head.querySelectorAll('style').forEach((style) => style.remove()); });

describe('compatibility with the existing deployed learner site', () => {
  it('hands a detached score CSV anchor to native saving instead of WebView navigation', async () => {
    const { context, nativeClick } = setup();
    context.fetch.mockResolvedValue({ ok: true, blob: async () => ({ size: 3 }) });
    const anchor = new context.HTMLAnchorElement();
    anchor.download = '我的成绩.csv';
    anchor.href = 'blob:http://139.9.134.68/score-export';
    anchor.click();
    await vi.waitFor(() => expect(context.window.__zhuodaDownloadQueue).toEqual([
      { name: '我的成绩.csv', data: 'data:text/csv;base64,YSxi' },
    ]));
    expect(nativeClick).not.toHaveBeenCalled();
  });

  it('leaves a regular link click unchanged', () => {
    const { context, nativeClick } = setup();
    const anchor = new context.HTMLAnchorElement();
    anchor.href = 'http://139.9.134.68/exam/my';
    anchor.click();
    expect(nativeClick).toHaveBeenCalledOnce();
    expect(context.fetch).not.toHaveBeenCalled();
  });

  it('allows learner navigation with the original router history state', () => {
    const { history, replace } = setup();
    history.pushState({ back: '/exam/home' }, '', '/exam/practice');
    expect(replace).not.toHaveBeenCalled();
  });

  it('blocks management navigation and discards the local token', () => {
    const { history, replace, storage } = setup();
    history.pushState({}, '', '/admin/dashboard');
    expect(storage.removeItem).toHaveBeenCalledWith('exam_sys.token');
    expect(replace).toHaveBeenCalledWith('/login?learnerOnly=1');
  });

  it('blocks a non-learner page already restored by the deployed router', () => {
    const { replace } = setup('/author/banks');
    expect(replace).toHaveBeenCalledWith('/login?learnerOnly=1');
  });

  it('adapts login copy and installs its hooks only once', () => {
    const { context, history } = setup();
    expect(document.querySelector('.login__title')?.textContent).toBe('欢迎回来');
    expect(document.querySelector('.login__subtitle')?.textContent).toContain('开启今天的学习');
    const wrappedPush = history.pushState;
    runInNewContext(script, context);
    expect(history.pushState).toBe(wrappedPush);
    expect(context.window.addEventListener).toHaveBeenCalledTimes(1);
  });

  it('adds the mobile layout to the current deployment and reads the configured brand safely', () => {
    const { context } = setup();
    document.body.innerHTML = '<div class="login"><div class="login__card"><section class="login__brand"><span class="login__logo-name">单位学习系统<small>EXAM MANAGEMENT</small></span><p class="login__copyright">© 单位</p></section><section class="login__panel"><div class="login__form-wrap"><h2 class="login__title">登录考试系统</h2></div></section></div></div>';
    // Fresh document lifecycle, as when WebView navigates from a learner page to login.
    (context.window as unknown as Record<string, unknown>).__zhuodaLearnerMode = false;
    runInNewContext(script, context);
    expect(document.querySelector('.login-mobile-brand__name')?.textContent).toBe('单位学习系统');
    expect(document.querySelector('.login-mobile-footer__copyright')?.textContent).toBe('© 单位');
    expect(document.querySelector('.login-mobile-help summary')?.textContent).toBe('登录遇到问题？');
    expect(document.querySelectorAll('.login-mobile-hero')).toHaveLength(1);
  });

  it('does not overwrite two-factor instructions in the existing deployment', () => {
    const { context } = setup();
    document.querySelector('.login__title')!.textContent = '两步验证';
    document.querySelector('.login__subtitle')!.textContent = '请输入动态验证码或恢复码';
    (context.window as unknown as Record<string, unknown>).__zhuodaLearnerMode = false;
    runInNewContext(script, context);
    expect(document.querySelector('.login__title')?.textContent).toBe('两步验证');
    expect(document.querySelector('.login__subtitle')?.textContent).toBe('请输入动态验证码或恢复码');
  });
});
