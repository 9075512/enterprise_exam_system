<script setup lang="ts">
/**
 * 三点波加载（Loading 方案 ②）—— 局部区块 / 按钮旁的最小加载指示。
 * 三点错相上跳 + 透明度递减；体量最小，不打断视线。
 */
withDefaults(defineProps<{ size?: 'sm' | 'md' }>(), { size: 'md' });
</script>

<template>
  <span class="loading-dots" :class="`loading-dots--${size}`" role="status" aria-label="加载中">
    <i /><i /><i />
  </span>
</template>

<style scoped lang="scss">
@use '@/styles/variables.scss' as *;

.loading-dots {
  display: inline-flex;
  align-items: center;
  gap: 9px;

  i {
    width: 9px;
    height: 9px;
    border-radius: 50%;
    background: $color-primary;
    animation: loading-dots-wave 1.2s ease-in-out infinite;
  }

  i:nth-child(2) {
    animation-delay: 0.15s;
    opacity: 0.75;
  }

  i:nth-child(3) {
    animation-delay: 0.3s;
    opacity: 0.5;
  }

  &--sm {
    gap: 6px;

    i {
      width: 6px;
      height: 6px;
    }
  }
}

@keyframes loading-dots-wave {
  0%,
  60%,
  100% {
    transform: translateY(0);
  }
  30% {
    transform: translateY(-9px);
  }
}
</style>
