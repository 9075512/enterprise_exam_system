<script setup lang="ts">
import { Reading, EditPen, Trophy, Check, TopRight, Close, ArrowRight } from '@element-plus/icons-vue';
import { useAppDownload } from '@/composables/useAppDownload';
import DownloadActions from '@/components/download/DownloadActions.vue';
import DownloadQr from '@/components/download/DownloadQr.vue';
import DownloadPhone from '@/components/download/DownloadPhone.vue';
import DownloadDetails from '@/components/download/DownloadDetails.vue';
import '@/components/download/download-brand.scss';
const state = useAppDownload();
const features = [
  { icon: Reading, title: '课程随时学', text: '打开课程，接着上次的进度。', number: '01' },
  { icon: EditPen, title: '练习有方向', text: '科目练习、错题回顾，逐步巩固。', number: '02' },
  { icon: Trophy, title: '成果看得见', text: '参加考试，及时查看学习成果。', number: '03' },
];
</script>

<template>
  <div class="app-download dl-design dl-design--b" data-ui-layout="app-download" data-ui-page="AppDownloadPage" data-download-design="b">
    <div v-if="state.showBrowserHint.value" class="dl-browser-hint" role="alert"><div><strong>请在浏览器中打开</strong><p>点击微信右上角“···”，选择“在浏览器打开”后下载安装。</p></div><button type="button" aria-label="关闭提示" @click="state.showBrowserHint.value = false"><Close aria-hidden="true" /></button></div>
    <header class="dl-nav dl-container">
      <a href="/download" class="dl-brand"><img src="/brand/app-icon.svg" alt="" width="36" height="36" /><strong>{{ state.appName.value }}</strong></a>
      <nav aria-label="页面导航"><a href="#installation" class="dl-nav__guide">安装指引</a><RouterLink to="/login">进入网页版<TopRight aria-hidden="true" /></RouterLink></nav>
    </header>

    <main class="dl-b">
      <section class="dl-b__hero dl-container">
        <div class="dl-b__intro"><span class="dl-kicker">为每一个想进步的你</span><h1>随时启程，<br /><em>学有所成。</em></h1><p class="dl-b__lead">让一节好课、一次练习，<br />自然融入你的每一天。</p><DownloadActions :state="state" /><DownloadQr :state="state" /><p class="dl-b__account"><Check aria-hidden="true" />使用原有学员账号，接着学、继续练。</p></div>
        <div class="dl-b__visual"><div class="dl-b__visual-label"><span>MOBILE LEARNING</span><span>随行 · 随学</span></div><div class="dl-b__wordmark" aria-hidden="true">学</div><DownloadPhone /><div class="dl-b__caption"><span>把一点一滴，积累成进步。</span><ArrowRight aria-hidden="true" /></div></div>
      </section>
      <div class="dl-container"><section class="dl-features dl-b__features" aria-label="应用功能"><article v-for="feature in features" :key="feature.title"><span class="dl-feature-number">{{ feature.number }}</span><component :is="feature.icon" aria-hidden="true" /><h2>{{ feature.title }}</h2><p>{{ feature.text }}</p></article></section><DownloadDetails :state="state" /></div>
    </main>

    <footer class="dl-footer dl-container"><span>{{ state.brand.publicSettings.copyright }}</span><span>让学习，随时发生。<RouterLink to="/login">进入网页版<TopRight aria-hidden="true" /></RouterLink></span></footer>
  </div>
</template>
