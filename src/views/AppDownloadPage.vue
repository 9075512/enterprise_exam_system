<script setup lang="ts">
import { Reading, EditPen, Trophy, Check, TopRight, Close } from '@element-plus/icons-vue';
import { useAppDownload } from '@/composables/useAppDownload';
import DownloadActions from '@/components/download/DownloadActions.vue';
import DownloadQr from '@/components/download/DownloadQr.vue';
import DownloadDetails from '@/components/download/DownloadDetails.vue';
import '@/components/download/download-center.scss';
const state = useAppDownload();
const features = [
  { icon: Reading, title: '课程随时学', text: '打开课程，接着上次的进度。' },
  { icon: EditPen, title: '练习有方向', text: '科目练习、错题回顾，逐步巩固。' },
  { icon: Trophy, title: '成果看得见', text: '参加考试，及时查看学习成果。' },
];
</script>

<template>
  <div class="app-download dl-design dl-design--a" data-ui-layout="app-download" data-ui-page="AppDownloadPage" data-download-design="a">
    <div v-if="state.showBrowserHint.value" class="dl-browser-hint" role="alert"><div><strong>请在浏览器中打开</strong><p>点击微信右上角“···”，选择“在浏览器打开”后下载安装。</p></div><button type="button" aria-label="关闭提示" @click="state.showBrowserHint.value = false"><Close aria-hidden="true" /></button></div>
    <header class="dl-nav dl-container">
      <a href="/download" class="dl-brand"><img src="/brand/app-icon.svg" alt="" width="36" height="36" /><strong>{{ state.appName.value }}</strong><span class="dl-nav__divider"></span><span class="dl-nav__label">下载中心</span></a>
      <nav aria-label="页面导航"><a href="#installation" class="dl-nav__guide">安装指引</a><RouterLink to="/login">进入网页版<TopRight aria-hidden="true" /></RouterLink></nav>
    </header>

    <main class="dl-container dl-a">
      <section class="dl-a__intro"><span class="dl-kicker"><span class="dl-status-dot"></span>学习，从这里继续</span><h1>把学习带在身边。</h1><p>课程、练习与考试，一个 App 就够了。</p></section>
      <section class="dl-a__card" aria-label="安卓 App 下载">
        <div class="dl-a__download"><div class="dl-a__identity"><img src="/brand/app-icon.svg" alt="" width="72" height="72" /><div><span class="dl-tag">ANDROID APP</span><h2>{{ state.appName.value }}</h2><p>你的移动学习空间</p></div></div><DownloadActions :state="state" /><div class="dl-assurances"><span><Check aria-hidden="true" />原有账号登录</span><span><Check aria-hidden="true" />学习数据同步</span></div></div>
        <DownloadQr :state="state" />
      </section>
      <section class="dl-features dl-a__features" aria-label="应用功能"><article v-for="feature in features" :key="feature.title"><span class="dl-feature-icon"><component :is="feature.icon" aria-hidden="true" /></span><div><h2>{{ feature.title }}</h2><p>{{ feature.text }}</p></div></article></section>
      <DownloadDetails :state="state" />
    </main>

    <footer class="dl-footer dl-container"><span>{{ state.brand.publicSettings.copyright }}</span><span>让学习，随时发生。<RouterLink to="/login">进入网页版<TopRight aria-hidden="true" /></RouterLink></span></footer>
  </div>
</template>
