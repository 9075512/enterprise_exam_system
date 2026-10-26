<script setup lang="ts">
import { Download, TopRight, RefreshRight } from '@element-plus/icons-vue';
import { formatAppSize } from '@/api/apps';
import type { AppDownloadState } from '@/composables/useAppDownload';
defineProps<{ state: AppDownloadState }>();
</script>

<template>
  <div class="dl-actions" :aria-busy="state.loading.value">
    <a class="dl-button" :href="state.downloadUrl.value" :aria-disabled="!state.canDownload.value" @click="state.download"><Download aria-hidden="true" />{{ state.buttonText.value }}</a>
    <p v-if="state.error.value" class="dl-error" role="alert">{{ state.error.value }}<button type="button" @click="state.load"><RefreshRight aria-hidden="true" />重新加载</button></p>
    <p v-else-if="state.loading.value" class="dl-meta" role="status">正在检查最新发布版本</p>
    <p v-else-if="state.release.value" class="dl-meta">v{{ state.release.value.versionName }}<span>·</span>{{ formatAppSize(state.release.value.fileSize) }}<span>·</span>Android {{ state.release.value.minAndroid }}+</p>
    <p v-else class="dl-meta">管理员发布安装包后，即可在这里下载。</p>
    <p v-if="state.ios" class="dl-platform">当前提供安卓安装包，iPhone 请使用网页版。</p>
    <RouterLink to="/login" class="dl-web">使用网页版<TopRight aria-hidden="true" /></RouterLink>
  </div>
</template>
