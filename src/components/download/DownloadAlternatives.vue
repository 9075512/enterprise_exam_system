<script setup lang="ts">
import { Reading, EditPen, Trophy, Check, TopRight, Close, ArrowRight, Cellphone } from '@element-plus/icons-vue';
import { useAppDownload } from '@/composables/useAppDownload';
import DownloadActions from './DownloadActions.vue';
import DownloadQr from './DownloadQr.vue';
import DownloadPhone from './DownloadPhone.vue';
import DownloadDetails from './DownloadDetails.vue';
import type { DownloadDesignId } from './designs';
import './download-designs.scss';
defineProps<{ design: Exclude<DownloadDesignId, 'b'> }>();
const state = useAppDownload();
const features = [
  { icon: Reading, title: '课程随时学', text: '打开课程，接着上次的进度。', number: '01' },
  { icon: EditPen, title: '练习有方向', text: '科目练习、错题回顾，逐步巩固。', number: '02' },
  { icon: Trophy, title: '成果看得见', text: '参加考试，及时查看学习成果。', number: '03' },
];
</script>

<template>
  <div :class="['dl-design', `dl-design--${design}`]" data-ui-layout="app-download" :data-download-design="design">
    <div v-if="state.showBrowserHint.value" class="dl-browser-hint" role="alert"><div><strong>请在浏览器中打开</strong><p>点击微信右上角“···”，选择“在浏览器打开”后下载安装。</p></div><button type="button" aria-label="关闭提示" @click="state.showBrowserHint.value = false"><Close aria-hidden="true" /></button></div>
    <header class="dl-nav dl-container">
      <a href="/download" class="dl-brand"><img src="/brand/app-icon.svg" alt="" width="36" height="36" /><strong>{{ state.appName.value }}</strong><span v-if="design === 'a'" class="dl-nav__divider"></span><span v-if="design === 'a'" class="dl-nav__label">下载中心</span></a>
      <nav aria-label="页面导航"><a href="#installation" class="dl-nav__guide">安装指引</a><RouterLink to="/login">进入网页版<TopRight aria-hidden="true" /></RouterLink></nav>
    </header>

    <main v-if="design === 'a'" class="dl-container dl-a">
      <section class="dl-a__intro"><span class="dl-kicker"><span class="dl-status-dot"></span>学习，从这里继续</span><h1>把学习带在身边。</h1><p>课程、练习与考试，一个 App 就够了。</p></section>
      <section class="dl-a__card" aria-label="安卓 App 下载">
        <div class="dl-a__download"><div class="dl-a__identity"><img src="/brand/app-icon.svg" alt="" width="72" height="72" /><div><span class="dl-tag">ANDROID APP</span><h2>{{ state.appName.value }}</h2><p>你的移动学习空间</p></div></div><DownloadActions :state="state" /><div class="dl-assurances"><span><Check aria-hidden="true" />原有账号登录</span><span><Check aria-hidden="true" />学习数据同步</span></div></div>
        <DownloadQr :state="state" />
      </section>
      <section class="dl-features dl-a__features" aria-label="应用功能"><article v-for="feature in features" :key="feature.title"><span class="dl-feature-icon"><component :is="feature.icon" aria-hidden="true" /></span><div><h2>{{ feature.title }}</h2><p>{{ feature.text }}</p></div></article></section>
      <DownloadDetails :state="state" />
    </main>

    <main v-else-if="design === 'c'" class="dl-c dl-container">
      <section class="dl-c__intro"><span class="dl-kicker"><span class="dl-status-dot"></span>你的移动学习空间</span><h1>你的下一次进步，<br /><em>随时开始。</em></h1><p>把课程、练习和考试，连接到你的每一天。</p><div class="dl-c__pills"><span>课程学习</span><span>在线练习</span><span>考试测评</span></div></section>
      <section class="dl-c__panel" aria-label="安卓 App 下载"><div class="dl-c__platform"><span class="dl-c__platform-icon"><Cellphone aria-hidden="true" /></span><div><span class="dl-tag">ANDROID APP</span><h2>{{ state.appName.value }}</h2><p>原有账号登录 · 学习数据同步</p></div></div><DownloadActions :state="state" /><DownloadQr :state="state" /></section>
      <section class="dl-c__showcase" aria-label="移动学习体验"><div class="dl-c__showcase-heading"><span class="dl-kicker">从屏幕，到日常</span><h2>小小屏幕，<br />装下你的成长。</h2><p>通勤路上、午间片刻，<br />让每一段时间都有所收获。</p></div><DownloadPhone /><div class="dl-c__features"><article v-for="feature in features" :key="feature.title"><component :is="feature.icon" aria-hidden="true" /><div><h3>{{ feature.title }}</h3><p>{{ feature.text }}</p></div></article></div></section>
      <DownloadDetails :state="state" />
    </main>

    <main v-else-if="design === 'd'" class="dl-d dl-container">
      <section class="dl-d__hero">
        <div class="dl-d__intro"><span class="dl-kicker">A LITTLE EVERY DAY / 每天一点点</span><h1>把日常，<br />写成<em>进步。</em></h1><p class="dl-d__lead">不必等一段完整的时间。<br />一节课，一道题，从当下开始。</p><div class="dl-d__subjects"><span>课程学习</span><span>日常练习</span><span>考试测评</span></div><p class="dl-d__footnote"><span>01 —</span> 让知识，在日常里慢慢生长。</p></div>
        <section class="dl-d__download" aria-label="安卓 App 下载"><div class="dl-d__app"><img src="/brand/app-icon.svg" alt="" width="52" height="52" /><div><span class="dl-tag">你的移动学习伙伴</span><h2>{{ state.appName.value }}</h2></div></div><DownloadActions :state="state" /><DownloadQr :state="state" /><div class="dl-d__account"><Check aria-hidden="true" />沿用原有账号，无需重复注册。</div></section>
      </section>
      <section class="dl-d__story" aria-label="移动学习体验"><div class="dl-d__portrait"><span class="dl-kicker">LEARNING IN YOUR POCKET</span><DownloadPhone /><p>随手打开，就是新的开始。</p></div><div class="dl-d__chapters"><span class="dl-kicker">为日常，留一点成长的空间</span><h2>学习这件事，<br />可以更从容。</h2><article v-for="feature in features" :key="feature.title"><span>{{ feature.number }}</span><div><h3>{{ feature.title }}</h3><p>{{ feature.text }}</p></div><component :is="feature.icon" aria-hidden="true" /></article></div></section>
      <DownloadDetails :state="state" />
    </main>

    <main v-else class="dl-e dl-container">
      <section class="dl-e__hero"><div class="dl-e__intro"><span class="dl-kicker">随时开学 / ALWAYS READY</span><h1>学习，<br />即刻发生<span>。</span></h1><p>把想学的，变成学会的。<br />让每一次打开，都离目标近一点。</p><div class="dl-e__seal"><ArrowRight aria-hidden="true" /><span>你的下一步，从这里开始</span></div></div><section class="dl-e__download" aria-label="安卓 App 下载"><div class="dl-e__card-top"><span class="dl-tag">DOWNLOAD THE APP</span><Cellphone aria-hidden="true" /></div><div class="dl-e__app"><img src="/brand/app-icon.svg" alt="" width="64" height="64" /><h2>{{ state.appName.value }}<small>装进口袋，随时开学。</small></h2></div><DownloadActions :state="state" /><DownloadQr :state="state" /><p class="dl-e__account"><Check aria-hidden="true" />原有账号登录 · 学习数据同步</p></section></section>
      <section class="dl-e__features" aria-label="应用功能"><article v-for="(feature, index) in features" :key="feature.title"><div class="dl-e__feature-top"><span>{{ feature.number }} / {{ ['LEARN', 'PRACTICE', 'ACHIEVE'][index] }}</span><component :is="feature.icon" aria-hidden="true" /></div><span class="dl-e__big-word" aria-hidden="true">{{ ['学', '练', '考'][index] }}</span><h2>{{ feature.title }}</h2><p>{{ feature.text }}</p></article></section>
      <DownloadDetails :state="state" />
    </main>
    <footer class="dl-footer dl-container"><span>{{ state.brand.publicSettings.copyright }}</span><span>让学习，随时发生。<RouterLink to="/login">进入网页版<TopRight aria-hidden="true" /></RouterLink></span></footer>
  </div>
</template>
