<script setup lang="ts">
import { formatAppDate } from '@/api/apps';
import type { AppDownloadState } from '@/composables/useAppDownload';
defineProps<{ state: AppDownloadState }>();
const steps = [
  { title: '下载安装包', text: '用安卓手机浏览器打开本页，下载 APK 文件。' },
  { title: '按提示完成安装', text: '打开下载文件，按系统提示允许该来源安装。更新时可直接覆盖安装。' },
  { title: '登录工作账号', text: '使用原有学员账号登录，继续课程学习和练习。' },
];
</script>

<template>
  <section id="installation" class="dl-install" aria-labelledby="install-title">
    <div class="dl-section-heading"><span class="dl-kicker">开始使用</span><h2 id="install-title">三步，开启移动学习。</h2><p>沿用原有账号，无需重复注册。</p></div>
    <ol class="dl-steps"><li v-for="(step, index) in steps" :key="step.title"><span class="dl-step-number">0{{ index + 1 }}</span><h3>{{ step.title }}</h3><p>{{ step.text }}</p></li></ol>
    <p class="dl-install-note">App 需联网使用。账号或密码问题，请联系科室管理员。</p>
  </section>
  <section v-if="state.release.value" class="dl-release" aria-labelledby="release-title">
    <div><span class="dl-kicker">版本更新</span><h2 id="release-title">每一次更新，都为更好的体验。</h2><p>v{{ state.release.value.versionName }} · {{ formatAppDate(state.release.value.publishedAt) }}</p></div>
    <div class="dl-release__content"><ul v-if="state.releaseLines.value.length"><li v-for="(line, index) in state.releaseLines.value" :key="index">{{ line }}</li></ul><p v-else>当前版本暂无更新说明。</p><details><summary>安装包 SHA-256 校验值</summary><code>{{ state.release.value.sha256 }}</code></details></div>
  </section>
</template>
