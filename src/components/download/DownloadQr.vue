<script setup lang="ts">
import { TopRight } from '@element-plus/icons-vue';
import type { AppDownloadState } from '@/composables/useAppDownload';
defineProps<{ state: AppDownloadState }>();
</script>

<template>
  <aside class="dl-qr" aria-label="扫码打开下载页">
    <div class="dl-qr__image">
      <img v-if="state.qr.value" :src="state.qr.value" alt="用安卓手机扫码，打开正式下载页" width="144" height="144" />
      <div v-else-if="state.qrFailed.value" class="dl-qr__fallback"><span role="status">二维码生成失败</span><button type="button" @click="state.makeQr">重新生成</button></div>
      <span v-else class="dl-qr__fallback" role="status">正在生成二维码…</span>
    </div>
    <div class="dl-qr__caption"><strong>手机扫码下载</strong><p>使用安卓相机或浏览器扫一扫</p><a :href="state.pageUrl" class="dl-qr__url">{{ state.pageUrl.replace(/^https?:\/\//, '') }}<TopRight aria-hidden="true" /></a></div>
  </aside>
</template>
