<script setup lang="ts">
/**
 * 品牌徽标脉冲全屏加载（Loading 方案 ①）。
 * 「考」徽标呼吸缩放 + 双层反向进度环 + 字距拉开的品牌字；
 * 用于冷启动 / 进入考试等 &gt; 800ms 的整页等待，dark 态用于深底场景。
 */
withDefaults(defineProps<{ show: boolean; dark?: boolean; caption?: string }>(), {
  dark: false,
  caption: '',
});
</script>

<template>
  <Transition name="boot-splash">
    <div v-if="show" class="boot-splash" :class="{ 'is-dark': dark }" role="status" aria-label="加载中">
      <div class="boot-splash__wrap">
        <span class="boot-splash__ring" />
        <span class="boot-splash__ring boot-splash__ring--2" />
        <span class="boot-splash__mark">考</span>
      </div>
      <span class="boot-splash__brand">EXAM CENTER</span>
      <span v-if="caption" class="boot-splash__caption">{{ caption }}</span>
    </div>
  </Transition>
</template>

<style scoped lang="scss">
@use '@/styles/variables.scss' as *;

.boot-splash {
  position: fixed;
  inset: 0;
  z-index: 4000;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 18px;
  background: rgba(245, 247, 250, 0.96);

  &.is-dark {
    background: rgba(11, 15, 25, 0.96);

    .boot-splash__brand {
      color: $sidebar-text;
    }
  }
}

.boot-splash__wrap {
  position: relative;
  width: 72px;
  height: 72px;
}

.boot-splash__mark {
  position: absolute;
  inset: 10px;
  display: grid;
  place-items: center;
  border-radius: 18px; // radius-exception：品牌徽标块（同侧栏 logo 圆角语言）
  background: linear-gradient(160deg, $color-primary, $color-primary-dark);
  color: #fff;
  font-size: 24px;
  font-weight: 700;
  animation: boot-breathe 1.8s ease-in-out infinite;
}

.boot-splash__ring {
  position: absolute;
  inset: 0;
  border: 2px solid rgba($color-primary, 0.18);
  border-top-color: $color-primary;
  border-radius: 50%;
  animation: boot-spin 1.1s linear infinite;

  &--2 {
    inset: -8px;
    border-width: 1px;
    border-color: rgba($color-primary, 0.08);
    border-top-color: rgba($color-primary, 0.4);
    animation-duration: 1.7s;
    animation-direction: reverse;
  }
}

.boot-splash__brand {
  font-size: 12.5px;
  letter-spacing: 0.32em;
  text-indent: 0.32em;
  color: $text-secondary;
}

.boot-splash__caption {
  margin-top: -8px;
  font-size: 12px;
  color: $text-secondary;
}

@keyframes boot-breathe {
  0%,
  100% {
    transform: scale(1);
  }
  50% {
    transform: scale(0.92);
  }
}

@keyframes boot-spin {
  to {
    transform: rotate(360deg);
  }
}

/* 无障碍豁免：全局 reduce 规则（index.scss）会把 animation-duration 压成 0.001ms，
   但加载反馈是**功能性动画**——被压停后用户只看到静止色块，会误判为页面卡死。
   故对进度指示类动画显式恢复时长（同样 !important 才能压过全局 * !important）。 */
@media (prefers-reduced-motion: reduce) {
  .boot-splash__mark {
    animation-duration: 1.8s !important;
  }

  .boot-splash__ring {
    animation-duration: 1.1s !important;

    &--2 {
      animation-duration: 1.7s !important;
    }
  }
}

.boot-splash-leave-active {
  transition: opacity 0.35s ease;
}

.boot-splash-leave-to {
  opacity: 0;
}
</style>
