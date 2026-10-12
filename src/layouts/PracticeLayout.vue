<script setup lang="ts">
/**
 * 练题独立布局（公网 · 仅移动端）。
 *
 * - 沉稳深蓝实色顶栏（系统标识 + 标题 + 右侧操作插槽）+ 内容区；无后台侧栏；
 * - 传 `tabbar` 时在底部渲染练题端导航栏（练题 / 错题本 / 我的），并为内容区预留避让空间；
 * - 视觉基调：冷静蓝 · 商务风（单一主色、平铺浅底、细边框、小圆角，无渐变 / 无氛围光）；
 * - **微信内置浏览器兼容**：不使用裸 `100vh`（iOS 微信 `100vh` 含地址栏会导致底部被遮挡），
 *   优先用 `visualViewport.height` 计算可用高度，退化为 `100dvh`，最后兜底 `100vh`；
 * - 底部使用 `env(safe-area-inset-bottom)` 处理全面屏安全区。
 */
import { onBeforeUnmount, onMounted, ref } from 'vue';
import PracticeTabBar from '@/views/practice/components/PracticeTabBar.vue';

/** 是否显示底部导航栏（练题首页 / 错题本 / 我的 开启；登录页与作答页不显示） */
const props = withDefaults(defineProps<{ tabbar?: boolean }>(), { tabbar: false });

/** 动态视口高度样式（`--practice-vh`），由 visualViewport 计算得出。 */
const layoutStyle = ref<Record<string, string>>({});

function syncViewport(): void {
  const vv = window.visualViewport;
  if (vv && typeof vv.height === 'number' && vv.height > 0) {
    layoutStyle.value = { '--practice-vh': `${Math.round(vv.height)}px` };
  }
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
  <div class="practice-layout" :class="{ 'is-tabbar': props.tabbar }" :style="layoutStyle">
    <header class="practice-layout__bar">
      <div class="practice-layout__brand">
        <span class="practice-layout__badge" aria-hidden="true">练</span>
        <span class="practice-layout__title">
          <slot name="brand">在线练题系统</slot>
        </span>
      </div>
      <div class="practice-layout__actions">
        <slot name="actions" />
      </div>
    </header>

    <main class="practice-layout__main">
      <slot />
    </main>

    <PracticeTabBar v-if="props.tabbar" />
  </div>
</template>

<style scoped lang="scss">
@use '@/styles/variables.scss' as *;

.practice-layout {
  position: relative;
  display: flex;
  flex-direction: column;
  /* 微信 iOS：优先动态视口，退化 100dvh，最后兜底 100vh（避免底部被地址栏遮挡） */
  min-height: 100vh;
  min-height: var(--practice-vh, 100dvh);
  background: $practice-bg;
  color: $text-primary;
  /* 移动端无横向滚动 */
  overflow-x: hidden;
  -webkit-tap-highlight-color: transparent;

  &__bar {
    position: sticky;
    top: 0;
    z-index: 20;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    height: 52px;
    padding: 0 16px;
    padding-top: env(safe-area-inset-top);
    background: $practice-header;
    color: #fff;
    border-bottom: 1px solid rgba(255, 255, 255, 0.16);
  }

  &__brand {
    display: flex;
    align-items: center;
    gap: 10px;
    min-width: 0;
  }

  &__badge {
    flex: 0 0 auto;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 26px;
    height: 26px;
    border: 1px solid rgba(255, 255, 255, 0.55);
    border-radius: 4px;
    font-size: 14px;
    font-weight: 700;
    line-height: 1;
  }

  &__title {
    font-size: 15px;
    font-weight: 700;
    letter-spacing: 1px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  &__actions {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-shrink: 0;
    font-size: 14px;
  }

  &__main {
    position: relative;
    z-index: 1;
    flex: 1;
    width: 100%;
    max-width: 600px;
    margin: 0 auto;
    padding: 16px 14px calc(24px + env(safe-area-inset-bottom));
    box-sizing: border-box;
  }

  /* 有底部导航栏时：为内容区预留避让空间（52px 导航 + 24px 间距） */
  &.is-tabbar &__main {
    padding-bottom: calc(76px + env(safe-area-inset-bottom));
  }
}
</style>
