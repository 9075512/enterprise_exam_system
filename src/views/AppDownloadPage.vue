<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import QRCode from 'qrcode';
import { ArrowRight, Download, Reading, EditPen, Trophy, Check, TopRight as ArrowUpRight, Close } from '@element-plus/icons-vue';
import { latestApp, formatAppDate, formatAppSize, type AppRelease } from '@/api/apps';
import { useSettingsStore } from '@/stores/settings';
const brand = useSettingsStore();
const pageHost = location.host;
const release = ref<AppRelease | null>(null);
const loading = ref(true), error = ref(''), qr = ref(''), showBrowserHint = ref(false);
const wechat = /MicroMessenger/i.test(navigator.userAgent);
const ios = /iPad|iPhone|iPod/.test(navigator.userAgent);
const releaseLines = computed(() => release.value?.releaseNotes.split(/\r?\n/).map(line => line.replace(/^[-•]\s*/, '').trim()).filter(Boolean) ?? []);
async function load() {
  loading.value = true; error.value = '';
  try { release.value = await latestApp(); }
  catch { error.value = '版本信息暂时无法加载，请稍后重试。'; }
  finally { loading.value = false; }
}
function download(event: MouseEvent) {
  if (!release.value || wechat || ios) {
    event.preventDefault();
    if (wechat) showBrowserHint.value = true;
  }
}
onMounted(async () => {
  void brand.loadPublic(); void load();
  try { qr.value = await QRCode.toDataURL(`${location.origin}/download`, { width: 224, margin: 2, color: { dark: '#18304c', light: '#ffffff' } }); } catch { /* Text link remains usable. */ }
});
</script>

<template>
  <div class="app-download" data-ui-layout="app-download" data-ui-page="AppDownloadPage">
    <div v-if="showBrowserHint" class="app-download__browser-hint" role="alert">
      <div><strong>请在浏览器中打开</strong><p>点击微信右上角“···”，选择“在浏览器打开”后下载安装。</p></div>
      <button aria-label="关闭提示" @click="showBrowserHint = false"><Close /></button>
    </div>
    <header class="app-download__nav">
      <RouterLink to="/download" class="app-download__brand"><img src="/brand/app-icon.svg" alt="" /><span>{{ release?.appName || '卓达学习' }}<small>让学习，随时发生</small></span></RouterLink>
      <nav aria-label="页面导航"><a href="#features">认识 App</a><a href="#installation">安装指引</a><RouterLink to="/login">进入网页版 <ArrowUpRight /></RouterLink></nav>
    </header>
    <main>
      <section class="app-download__hero">
        <div class="app-download__intro">
          <span class="app-download__eyebrow"><span></span> 你的移动学习伙伴</span>
          <h1>把学习，<br>装进<span>口袋。</span></h1>
          <p class="app-download__lead">从一节课程，到一次进步。<br>学习、练题、考试与成绩，在这里连成日常。</p>
          <div class="app-download__actions">
            <a :href="release?.downloadUrl || undefined" :aria-disabled="!release || ios || loading" class="app-download__primary" @click="download"><Download /><span>{{ loading ? '正在获取版本…' : error ? '暂时无法下载' : !release ? '安装包待发布' : ios ? '此版本适用于安卓' : '下载 Android 版' }}</span><ArrowRight /></a>
            <a href="#download-code" class="app-download__scan">扫码下载 <ArrowUpRight /></a>
          </div>
          <p v-if="error" class="app-download__error" role="alert">{{ error }} <button @click="load">重新加载</button></p>
          <p v-else-if="release" class="app-download__version">v{{ release.versionName }} <span>·</span> {{ formatAppSize(release.fileSize) }} <span>·</span> Android {{ release.minAndroid }} 及以上</p>
          <p v-else-if="!loading" class="app-download__version">管理员发布安装包后，即可在这里下载。</p>
          <p v-if="ios" class="app-download__platform-note">当前提供安卓安装包，iPhone 可通过上方入口使用网页版。</p>
          <div class="app-download__promises"><span><Check /> 使用原有账号</span><span><Check /> 学习数据同步</span><span><Check /> 无需重复注册</span></div>
        </div>
        <div class="app-download__showcase" aria-label="App 登录页预览">
          <div class="app-download__orbit app-download__orbit--one"></div><div class="app-download__orbit app-download__orbit--two"></div>
          <div class="app-download__floating app-download__floating--top"><Reading /><div>学习不必等到电脑前<small>碎片时间，也能有所收获</small></div></div>
          <div class="app-download__phone"><div class="app-download__phone-top"><span>9:41</span><span>● ▰</span></div><img src="/app/login-preview.jpg" alt="移动端登录界面：品牌欢迎区、账号密码输入框与登录按钮" /><div class="app-download__phone-bottom"></div></div>
          <div class="app-download__floating app-download__floating--bottom"><span class="app-download__check"><Check /></span><div>每一步，都算数<small>把知识积累，变成成长底气</small></div></div>
        </div>
      </section>
      <section id="features" class="app-download__features">
        <article><span class="app-download__feature-icon"><Reading /></span><div><small>01 / 随时学习</small><h2>好课程，接着看</h2><p>随时打开课程，把学习融入日常。</p></div></article>
        <article><span class="app-download__feature-icon"><EditPen /></span><div><small>02 / 日常练习</small><h2>薄弱点，逐个练</h2><p>科目练习、错题回顾，积累每次进步。</p></div></article>
        <article><span class="app-download__feature-icon"><Trophy /></span><div><small>03 / 考试与成绩</small><h2>每一份努力，看得见</h2><p>参加考试、查看成绩，了解学习成果。</p></div></article>
      </section>
      <section class="app-download__details">
        <article id="installation" class="app-download__installation">
          <div class="app-download__section-label">GET STARTED</div><h2>三步，开始新的学习日常。</h2>
          <ol><li><span>1</span><div><h3>下载安装包</h3><p>在安卓手机浏览器中打开本页，点击下载按钮。</p></div></li><li><span>2</span><div><h3>按手机提示安装</h3><p>打开下载的 APK，按系统提示允许该文件来源安装应用。</p></div></li><li><span>3</span><div><h3>登录工作账号</h3><p>使用原有学员账号登录。更新 App 可直接覆盖安装。</p></div></li></ol>
          <p class="app-download__online-note">App 需联网使用；账号或密码问题请联系科室管理员。</p>
        </article>
        <aside id="download-code" class="app-download__qr-card"><span class="app-download__section-label">SCAN & GO</span><h2>扫一扫，把学习带走。</h2><img v-if="qr" :src="qr" alt="用安卓手机扫描，打开本下载页" width="184" height="184" /><p>使用安卓手机相机或浏览器扫码</p><span class="app-download__qr-url">{{ pageHost }}/download</span></aside>
      </section>
      <section v-if="release" class="app-download__release"><div><span class="app-download__section-label">WHAT’S NEW</span><h2>新版本，继续向前。</h2><p>v{{ release.versionName }} · {{ formatAppDate(release.publishedAt) }}</p></div><div><ul><li v-for="(line, index) in releaseLines" :key="index">{{ line }}</li></ul><details><summary>查看安装包 SHA-256 校验值</summary><code>{{ release.sha256 }}</code></details></div></section>
    </main>
    <footer class="app-download__footer"><span>{{ brand.publicSettings.copyright }}</span><span>学习不止于此。<RouterLink to="/login">进入网页版 <ArrowUpRight /></RouterLink></span></footer>
  </div>
</template>

<style scoped lang="scss">
@use '@/styles/variables.scss' as *;
.app-download { --ink: #{$text-primary}; --muted: #{$text-secondary}; min-height: 100vh; color: var(--ink); background: $bg-page; font-family: inherit;
  svg { width: 20px; height: 20px; flex-shrink: 0; } a { color: inherit; text-decoration: none; } button { font: inherit; cursor: pointer; } a:focus-visible, button:focus-visible, summary:focus-visible { outline: 3px solid $color-primary-light; outline-offset: 5px; }
  &__nav, main, &__footer { width: min(1160px, calc(100% - 80px)); margin: 0 auto; }
  &__nav { display: flex; align-items: center; justify-content: space-between; min-height: 100px; gap: 24px; border-bottom: 1px solid $border-color; nav { display: flex; align-items: center; gap: 30px; font-size: 13px; a { display: flex; align-items: center; gap: 5px; } } }
  &__brand { display: flex; gap: 11px; align-items: center; font-size: 19px; font-weight: 700; img { width: 40px; height: 40px; } small { display: block; margin-top: 2px; color: var(--muted); font-size: 10px; font-weight: 400; letter-spacing: 1px; } }
  &__hero { display: grid; grid-template-columns: 1.05fr 1fr; align-items: center; min-height: 700px; gap: 30px; padding: 44px 0 54px; }
  &__eyebrow { display: inline-flex; align-items: center; gap: 9px; color: $color-primary; font-size: 12px; letter-spacing: 2px; span { width: 6px; height: 6px; border-radius: 50%; background: $color-primary; } }
  h1 { margin: 27px 0 24px; font-size: clamp(48px, 5.4vw, 72px); font-weight: 750; line-height: 1.25; letter-spacing: -3px; span { color: $color-primary; } }
  &__lead { color: $text-secondary; font-size: 16px; line-height: 2; }
  &__actions { display: flex; gap: 24px; align-items: center; flex-wrap: wrap; margin: 34px 0 13px; }
  &__primary { display: inline-flex; align-items: center; justify-content: center; gap: 12px; min-height: 58px; padding: 0 25px; border-radius: 8px; color: #fff !important; background: $color-primary; box-shadow: 0 7px 20px rgba($color-primary, .11); font-size: 14px; font-weight: 600; transition: transform .15s, background .15s; &:hover { transform: translateY(-2px); background: $color-primary-dark; } &[aria-disabled='true'] { background: $text-disabled; box-shadow: none; cursor: default; transform: none; } }
  &__scan { display: flex; align-items: center; gap: 5px; font-size: 13px; }
  &__version, &__platform-note { font-size: 11px; line-height: 1.9; color: $text-secondary; span { margin: 0 6px; } }
  &__promises { display: flex; gap: 20px; flex-wrap: wrap; margin-top: 31px; font-size: 11px; color: $text-secondary; span { display: flex; align-items: center; gap: 5px; } svg { width: 14px; height: 14px; color: $color-primary; } }
  &__showcase { position: relative; min-height: 585px; display: flex; align-items: center; justify-content: center; }
  &__orbit { position: absolute; width: 400px; height: 400px; border: 1px solid $color-primary-border; border-radius: 50%; background: rgba($color-primary, .04); &--two { width: 490px; height: 490px; background: transparent; border-style: dashed; opacity: .6; } }
  &__phone { position: relative; z-index: 1; width: 246px; padding: 7px; border: 2px solid #3c4858; border-radius: 38px; /* radius-exception: device illustration frame. */ background: #203044; box-shadow: 16px 26px 55px #1b364923; transform: rotate(5deg); overflow: hidden; img { display: block; width: 100%; border-radius: 0 0 24px 24px; /* radius-exception: device illustration screen. */ } }
  &__phone-top { display: flex; justify-content: space-between; align-items: center; height: 28px; padding: 0 16px; border-radius: 26px 26px 0 0; /* radius-exception: device illustration screen. */ color: #1c3047; background: #f4f7fd; font-size: 9px; font-weight: 700; }
  &__phone-bottom { position: absolute; bottom: 10px; left: 38%; width: 25%; height: 3px; border-radius: 3px; background: #30415d; }
  &__floating { position: absolute; z-index: 2; display: flex; align-items: center; gap: 12px; padding: 17px 19px; border: 1px solid white; border-radius: $radius-lg; background: #fffffff5; box-shadow: 0 12px 32px #19314c0c; font-size: 12px; font-weight: 600; small { display: block; margin-top: 4px; color: $text-secondary; font-size: 10px; font-weight: 400; } > svg { width: 32px; height: 32px; padding: 6px; border-radius: 8px; color: $color-primary; background: $color-primary-soft; } &--top { left: -5px; top: 80px; } &--bottom { right: -8px; bottom: 65px; } }
  &__check { display: grid; place-items: center; width: 30px; height: 30px; color: $color-primary; background: $color-primary-soft; border-radius: 50%; }
  &__features { display: grid; grid-template-columns: repeat(3, 1fr); border-top: 1px solid $border-color; border-bottom: 1px solid $border-color; padding: 34px 0; gap: 30px; article { display: flex; gap: 15px; align-items: flex-start; } small { color: $text-secondary; font-size: 10px; letter-spacing: 1px; } h2 { margin: 9px 0 8px; font-size: 17px; } p { margin: 0; color: $text-secondary; font-size: 12px; line-height: 1.8; } }
  &__feature-icon { color: $color-primary; background: $color-primary-soft; border-radius: 8px; padding: 10px; display: inline-flex; }
  &__details { display: grid; grid-template-columns: 1.4fr 1fr; gap: 80px; padding: 78px 0; h2 { font-size: 25px; margin: 14px 0 30px; } }
  &__section-label { color: $text-secondary; font-size: 10px; letter-spacing: 2px; font-weight: 600; }
  &__installation { ol { display: flex; flex-direction: column; gap: 25px; list-style: none; margin: 0; padding: 0; } li { display: flex; align-items: flex-start; gap: 18px; > span { display: grid; place-items: center; flex: 0 0 30px; height: 30px; border: 1px solid $line-strong; border-radius: 50%; color: $color-primary; font-size: 12px; } } h3 { margin: 2px 0 6px; font-size: 14px; } li p { margin: 0; color: $text-secondary; font-size: 12px; line-height: 1.9; } }
  &__online-note { margin-top: 28px; font-size: 11px; color: $text-secondary; }
  &__qr-card { align-self: start; padding: 34px; border: 1px solid $color-primary-border; border-radius: $radius-lg; text-align: center; background: $color-primary-soft; h2 { margin-bottom: 20px; font-size: 21px; } img { display: block; width: 184px; height: 184px; margin: 0 auto; border: 8px solid #fff; border-radius: 8px; } p { margin-top: 18px; font-size: 11px; color: $text-secondary; } }
  &__qr-url { font-size: 10px; color: $text-secondary; overflow-wrap: anywhere; }
  &__release { display: grid; grid-template-columns: 1fr 1.5fr; gap: 55px; border-top: 1px solid $border-color; padding: 40px 0 60px; h2 { margin: 12px 0; font-size: 24px; } p, li { color: $text-secondary; font-size: 12px; line-height: 2; } ul { padding-left: 16px; } details { margin-top: 24px; color: $text-secondary; font-size: 10px; } summary { cursor: pointer; } code { display: block; overflow-wrap: anywhere; padding-top: 8px; } }
  &__footer { display: flex; justify-content: space-between; gap: 15px; padding: 25px 0; border-top: 1px solid $border-color; color: $text-secondary; font-size: 10px; > span:last-child, a { display: flex; align-items: center; gap: 10px; } svg { width: 13px; height: 13px; } }
  &__error { color: $color-error-text; font-size: 12px; button { color: $color-primary; border: 0; background: none; } }
  &__browser-hint { position: fixed; inset: 0 0 auto; z-index: 100; display: flex; justify-content: space-between; gap: 15px; padding: 24px; color: #fff; background: rgba($text-primary, .96); font-size: 15px; p { font-size: 12px; line-height: 1.9; } button { border: 0; align-self: flex-start; color: inherit; background: none; } }
}
@media(max-width: 1000px) { .app-download { &__nav, main, &__footer { width: calc(100% - 48px); } &__hero { min-height: 620px; } &__showcase { min-height: 550px; } &__phone { width: 215px; } &__orbit { width: 290px; height: 290px; &--two { width: 350px; height: 350px; } } &__floating { padding: 12px; &--top { top: 70px; left: -20px; } &--bottom { right: -5px; bottom: 65px; } } &__details { gap: 35px; } } }
@media(max-width: 700px) { .app-download { overflow-x: clip; &__nav, main, &__footer { width: calc(100% - 40px); } &__nav { min-height: 82px; nav { gap: 12px; a:not(:last-child) { display: none; } a { font-size: 11px; } } } &__brand { font-size: 17px; img { width: 35px; height: 35px; } small { font-size: 9px; } } &__hero { grid-template-columns: 1fr; gap: 28px; padding-top: 43px; padding-bottom: 26px; } h1 { font-size: 55px; margin: 23px 0 18px; letter-spacing: -2px; } &__lead { font-size: 14px; } &__actions { gap: 20px; margin-top: 25px; } &__primary { min-height: 54px; padding: 0 20px; font-size: 13px; } &__promises { margin-top: 24px; gap: 16px; font-size: 10px; } &__showcase { min-height: 525px; } &__phone { width: 220px; } &__floating { font-size: 11px; small { font-size: 9px; } &--top { top: 58px; left: -5px; } &--bottom { bottom: 47px; right: -3px; } } &__features { grid-template-columns: 1fr; gap: 25px; padding: 28px 0; article { gap: 20px; } } &__details { grid-template-columns: 1fr; padding: 45px 0; gap: 35px; h2 { font-size: 22px; } } &__release { grid-template-columns: 1fr; gap: 15px; padding-bottom: 35px; } &__footer { flex-direction: column; align-items: center; text-align: center; font-size: 9px; } } }
@media(prefers-reduced-motion: reduce) { .app-download__primary { transition: none; } }
</style>
