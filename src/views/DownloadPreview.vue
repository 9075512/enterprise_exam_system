<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { Monitor, Cellphone, TopRight, Check } from '@element-plus/icons-vue';
import DownloadDesign from '@/components/download/DownloadDesign.vue';
import { downloadDesigns as designs, resolveDownloadDesign } from '@/components/download/designs';

const route = useRoute();
const router = useRouter();
const design = computed(() => resolveDownloadDesign(route.query.design));
const device = computed(() => route.query.device === 'mobile' ? 'mobile' : 'desktop');
const standalone = computed(() => route.query.standalone === '1');
const current = computed(() => designs.find(item => item.id === design.value)!);
const frameUrl = computed(() => `/download-preview?design=${design.value}&standalone=1`);
const frameLoading = ref(true);
watch(frameUrl, () => { frameLoading.value = true; });
function select(query: { design?: string; device?: string }) {
  void router.replace({ path: '/download-preview', query: { ...route.query, ...query } });
}
</script>

<template>
  <DownloadDesign v-if="standalone" :design="design" />
  <div v-else class="download-preview">
    <header class="download-preview__header"><div class="download-preview__brand"><img src="/brand/app-icon.svg" alt="" width="32" height="32" /><div><h1>下载页设计选稿</h1><p>五种方向，找到你喜欢的那一版。</p></div></div><a href="/download" target="_blank" rel="noopener">查看现有下载页<TopRight aria-hidden="true" /></a></header>
    <main class="download-preview__workspace">
      <nav class="download-preview__designs" aria-label="设计方案"><button v-for="item in designs" :key="item.id" type="button" :aria-pressed="design === item.id" @click="select({ design: item.id })"><span :class="['download-preview__swatch', `download-preview__swatch--${item.color}`]">{{ item.id.toUpperCase() }}</span><span><strong>{{ item.name }}</strong><small>{{ item.description }}</small></span><Check v-if="design === item.id" class="download-preview__selected" aria-hidden="true" /></button></nav>
      <div class="download-preview__toolbar"><div class="download-preview__current"><strong>方案 {{ design.toUpperCase() }}</strong><span>{{ current.name }}</span><span class="download-preview__local">本地预览</span></div><div class="download-preview__controls"><div class="download-preview__devices" role="group" aria-label="预览宽度"><button type="button" :aria-pressed="device === 'desktop'" @click="select({ device: 'desktop' })"><Monitor aria-hidden="true" /><span>桌面</span></button><button type="button" :aria-pressed="device === 'mobile'" @click="select({ device: 'mobile' })"><Cellphone aria-hidden="true" /><span>手机 · 375px</span></button></div><a :href="frameUrl" target="_blank" rel="noopener" aria-label="在新窗口打开当前方案"><TopRight aria-hidden="true" /></a></div></div>
      <div :class="['download-preview__stage', `download-preview__stage--${device}`]" :aria-busy="frameLoading"><span v-if="frameLoading" class="download-preview__loading" role="status">正在加载真实页面…</span><iframe :src="frameUrl" :title="`方案 ${design.toUpperCase()}：${current.name}`" @load="frameLoading = false"></iframe></div>
      <p class="download-preview__note">预览接入实际发布版本 · 桌面宽度至少 1024px，手机宽度 375px · 扫码始终打开正式下载页</p>
    </main>
  </div>
</template>

<style scoped lang="scss">
@use '@/styles/variables.scss' as *;
.download-preview {
  min-height: 100vh; background: #edf0f5; color: $text-primary;
  * { box-sizing: border-box; }
  svg { width: 18px; height: 18px; flex-shrink: 0; }
  a { text-decoration: none; color: $text-secondary; }
  button { font: inherit; cursor: pointer; }
  button:focus-visible, a:focus-visible, iframe:focus-visible { outline: 3px solid $color-primary; outline-offset: 3px; }
  &__header { display: flex; align-items: center; justify-content: space-between; gap: 20px; padding: 18px 32px; background: white; border-bottom: 1px solid $border-color; > a { display: inline-flex; align-items: center; gap: 6px; min-height: 44px; font-size: 12px; } }
  &__brand { display: flex; align-items: center; gap: 12px; h1 { margin: 0; font-size: 17px; } p { margin: 4px 0 0; color: $text-secondary; font-size: 11px; } }
  &__workspace { max-width: 1600px; padding: 24px 32px 12px; margin: auto; }
  &__designs { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 12px; margin-bottom: 20px; > button { display: flex; align-items: center; gap: 11px; position: relative; min-width: 0; min-height: 94px; padding: 14px 12px; background: #fff; border: 1px solid $line-strong; border-radius: $radius-lg; text-align: left; color: $text-primary; &[aria-pressed='true'] { border-color: $color-primary; box-shadow: 0 0 0 1px $color-primary; } &:hover { border-color: $color-primary; } } strong, small { display: block; } strong { font-size: 13px; line-height: 1.6; } small { margin-top: 5px; color: $text-secondary; font-size: 11px; line-height: 1.7; } }
  &__swatch { display: grid; place-items: center; width: 42px; height: 46px; border-radius: $radius-base; border: 1px solid $line-strong; font-size: 17px; font-weight: 650; flex-shrink: 0; &--light { background: #f4f6fb; color: $text-primary; } &--blue { background: $color-primary; color: white; border-color: $color-primary; } &--dark { background: #0b1424; color: #abc8ff; border-color: #29374e; } }
  &__swatch--sage { background: #e2e9de; color: #235f48; border-color: #cbd5c7; }
  &__swatch--poster { background: #1552dc; color: #e8f4a2; border-color: #1552dc; }
  &__selected { position: absolute; right: 8px; top: 8px; width: 12px !important; height: 12px !important; color: $color-primary; }
  &__toolbar { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 12px 16px; border: 1px solid $line-strong; border-bottom: 0; border-radius: $radius-lg $radius-lg 0 0; background: white; }
  &__current { display: flex; align-items: center; gap: 12px; font-size: 12px; > span { color: $text-secondary; } }
  &__local { font-size: 10px; padding: 4px 7px; border: 1px solid $border-color; border-radius: 4px; }
  &__controls { display: flex; align-items: center; gap: 12px; > a { display: grid; place-items: center; width: 44px; height: 44px; border: 1px solid $border-color; border-radius: $radius-base; } }
  &__devices { display: flex; padding: 3px; border: 1px solid $border-color; border-radius: $radius-base; background: $bg-page; button { display: flex; align-items: center; gap: 7px; min-height: 44px; padding: 8px 12px; border: 0; border-radius: 5px; color: $text-secondary; background: transparent; font-size: 12px; &[aria-pressed='true'] { background: white; color: $color-primary; box-shadow: $shadow-sm; } } }
  &__stage { position: relative; display: flex; align-items: flex-start; justify-content: center; height: calc(100vh - 325px); min-height: 560px; padding: 0; overflow: auto; background: #dfe4ec; border: 1px solid $line-strong; border-radius: 0 0 $radius-base $radius-base; iframe { display: block; width: 100%; height: 100%; min-height: 560px; flex-shrink: 0; border: 0; background: white; } &--desktop { justify-content: flex-start; iframe { min-width: 1024px; } } &--mobile { height: auto; min-height: 0; padding: 24px; iframe { width: 375px; height: 812px; min-height: 812px; box-shadow: $shadow-md; border-radius: $radius-lg; } } }
  &__loading { position: absolute; top: 16px; z-index: 1; padding: 10px 16px; border-radius: $radius-base; background: $bg-paper; color: $text-secondary; box-shadow: $shadow-md; font-size: 12px; }
  &__note { margin: 12px 0; text-align: center; color: $text-secondary; font-size: 11px; line-height: 1.9; }
}
@media(min-width: 761px) and (max-width: 1150px) { .download-preview__designs > button { flex-direction: column; align-items: flex-start; } }
@media(max-width: 760px) { .download-preview { &__header { padding: 12px 16px; > a { font-size: 10px; } } &__brand { gap: 8px; h1 { font-size: 14px; } p { display: none; } img { width: 28px; height: 28px; } } &__workspace { padding: 16px 10px; } &__designs { gap: 8px; margin-bottom: 14px; > button { min-height: 105px; padding: 12px 6px; flex-direction: column; justify-content: center; gap: 8px; text-align: center; } strong { font-size: 11px; } small, .download-preview__selected { display: none; } } &__swatch { width: 32px; height: 34px; font-size: 14px; } &__toolbar { flex-wrap: wrap; padding: 10px; gap: 10px; } &__current { gap: 8px; font-size: 11px; } &__local { display: none; } &__controls { width: 100%; justify-content: space-between; } &__stage { height: 75vh; min-height: 520px; &--mobile { justify-content: flex-start; padding: 12px; } } &__note { font-size: 10px; } } }
@media(max-width: 760px) { .download-preview__stage--mobile { height: auto; min-height: 0; } }
@media(max-width: 420px) { .download-preview { &__workspace { padding-inline: 0; } &__designs { padding-inline: 10px; } &__stage--mobile { padding-inline: 0; border-inline: 0; } &__note { padding-inline: 12px; } } }
</style>
