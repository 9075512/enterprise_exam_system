<script setup lang="ts">
/**
 * 主系统内练题布局：PC 是桌面内容页；移动考生复用主系统的移动头部与底栏，
 * 本布局只负责练题内容和二级练题导航，避免出现两套移动导航。
 */
import { onBeforeUnmount, onMounted, ref } from 'vue';
import PracticeTabBar from '@practice/views/practice/components/PracticeTabBar.vue';

const props = withDefaults(defineProps<{ tabbar?: boolean; bare?: boolean }>(), {
  tabbar: false,
  bare: false,
});

const layoutStyle = ref<Record<string, string>>({});
function syncViewport(): void {
  const height = window.visualViewport?.height;
  if (height && height > 0) layoutStyle.value = { '--practice-vh': `${Math.round(height)}px` };
}

onMounted(() => {
  syncViewport();
  window.addEventListener('resize', syncViewport);
  window.addEventListener('orientationchange', syncViewport);
  window.visualViewport?.addEventListener('resize', syncViewport);
});
onBeforeUnmount(() => {
  window.removeEventListener('resize', syncViewport);
  window.removeEventListener('orientationchange', syncViewport);
  window.visualViewport?.removeEventListener('resize', syncViewport);
});
</script>

<template>
  <div class="practice-layout is-integrated" :class="{ 'is-tabbar': props.tabbar }" :style="layoutStyle">
    <header v-if="!props.bare" class="practice-layout__bar">
      <div class="practice-layout__brand">
        <span class="practice-layout__badge" aria-hidden="true">练</span>
        <span class="practice-layout__title"><slot name="brand">在线练题</slot></span>
      </div>
      <div class="practice-layout__actions"><slot name="actions" /></div>
    </header>

    <PracticeTabBar v-if="props.tabbar" />

    <main class="practice-layout__main" :class="{ 'is-flush': props.bare }">
      <slot />
    </main>
  </div>
</template>

<style scoped lang="scss">
@use '@/styles/variables.scss' as *;

.practice-layout {
  position: relative;
  display: flex;
  flex-direction: column;
  min-height: 100%;
  color: $text-primary;

  &__bar { display: none; }

  &__main {
    order: 2;
    width: 100%;
    max-width: 1120px;
    margin: 0 auto;
    padding: 18px 0 0;
    box-sizing: border-box;
  }
}

@media (min-width: 901px) {
  .practice-layout.is-integrated {
    width: 100%;
    max-width: 1280px;
    margin: 0 auto;
  }

  .practice-layout.is-integrated > .practice-layout__main {
    max-width: none;
  }

  .practice-layout :deep(.pf) {
    max-width: 760px;
  }
}

@media (max-width: 900px) {
  // 合并版移动端由本布局直接控制内容留白。此前把规则绑定在外层 scoped
  // 选择器上，编译后无法命中，导致练题卡片贴住屏幕两侧。
  .practice-layout.is-integrated {
    min-height: 100vh;
    min-height: var(--practice-vh, 100dvh);
    overflow-x: hidden;
    background: $practice-bg;
    -webkit-tap-highlight-color: transparent;
  }

  .practice-layout.is-integrated > .practice-layout__main {
    flex: 1;
    width: 100%;
    max-width: 600px;
    padding: 14px 12px calc(78px + env(safe-area-inset-bottom));
    box-sizing: border-box;
  }

  .practice-layout.is-integrated > .practice-layout__main.is-flush { max-width: none; padding: 0; }
}
</style>
