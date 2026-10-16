<script setup lang="ts">
/**
 * 练题独立布局（公网 · 仅移动端）。
 *
 * - 白底顶栏（品牌标识 + 标题 + 右侧操作插槽）+ 内容区；无后台侧栏；
 * - 传 `tabbar` 时在底部渲染练题端导航栏（练题 / 错题本 / 报告 / 我的），并为内容区预留避让空间；
 * - 视觉基调：v3.1 方向 C「精密蓝」——单一主色、白底 + 发丝线、零投影、圆角 10/8/6；
 * - **微信内置浏览器兼容**：不使用裸 `100vh`（iOS 微信 `100vh` 含地址栏会导致底部被遮挡），
 *   优先用 `visualViewport.height` 计算可用高度，退化为 `100dvh`，最后兜底 `100vh`；
 * - 底部使用 `env(safe-area-inset-bottom)` 处理全面屏安全区。
 */
import { onBeforeUnmount, onMounted, ref } from 'vue';
import PracticeTabBar from '@/views/practice/components/PracticeTabBar.vue';

/** 是否显示底部导航栏（练题首页 / 错题本 / 报告 / 我的 开启；登录页与作答页不显示） */
/** `bare`：不渲染顶栏（登录页 —— 由主色 hero 承担品牌），内容区满幅 */
const props = withDefaults(defineProps<{ tabbar?: boolean; bare?: boolean }>(), {
  tabbar: false,
  bare: false,
});

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
    <header v-if="!props.bare" class="practice-layout__bar">
      <div class="practice-layout__brand">
        <span class="practice-layout__badge" aria-hidden="true">练</span>
        <span class="practice-layout__title">
          <slot name="brand">在线练题</slot>
        </span>
      </div>
      <div class="practice-layout__actions">
        <slot name="actions" />
      </div>
    </header>

    <main class="practice-layout__main" :class="{ 'is-flush': props.bare }">
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

  /* 顶栏（v3.1 方向 C：白底 + 发丝线，44px；去 v1.7 的深蓝实色块） */
  &__bar {
    position: sticky;
    top: 0;
    z-index: 20;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    height: calc(56px + env(safe-area-inset-top));
    padding: 0 16px;
    padding-top: env(safe-area-inset-top);
    box-sizing: border-box;
    background: $practice-header;
    color: $text-primary;
    border-bottom: 1px solid $border-color;
  }

  &__brand {
    display: flex;
    align-items: center;
    gap: 10px;
    min-width: 0;
  }

  /* 品牌徽标：主色浅底 + 主色字，白顶栏上的唯一色点 */
  &__badge {
    flex: 0 0 auto;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 26px;
    height: 26px;
    background: $practice-soft;
    border: 1px solid $practice-border-soft;
    border-radius: $radius-xs;
    font-size: 13px;
    font-weight: 700;
    color: $practice-primary;
    line-height: 1;
  }

  &__title {
    font-size: 15px;
    font-weight: 640;
    letter-spacing: -0.01em;
    color: $text-primary;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  &__actions {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-shrink: 0;
    font-size: 13px;
    color: $text-secondary;
  }

  &__main {
    position: relative;
    z-index: 1;
    flex: 1;
    width: 100%;
    max-width: 600px;
    margin: 0 auto;
    padding: 20px 20px calc(24px + env(safe-area-inset-bottom));
    box-sizing: border-box;
  }

  /* bare（登录页）：内容满幅，顶部延伸至状态栏区域（hero 主色铺顶） */
  &__main.is-flush {
    padding: 0;
    max-width: none;
    display: flex;
    flex-direction: column;
  }

  /* 有底部导航栏时：为内容区预留避让空间（56px 导航 + 18px 间距） */
  &.is-tabbar &__main {
    padding-bottom: calc(74px + env(safe-area-inset-bottom));
  }
}
</style>
