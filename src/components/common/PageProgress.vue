<script setup lang="ts">
/**
 * 顶栏进度细条（Loading 方案 ⑤，Loading 设计 §5）。
 * 3px 主色渐变细条固定在视口顶部，路由跳转期间从左向右冲刺循环；
 * 快速导航不显示；慢导航至少显示 250ms，再淡出。挂在 App 根部即可。
 */
import { usePageProgress } from '@/composables/usePageProgress';
import { useDelayedLoading } from '@/composables/useDelayedLoading';

const { active } = usePageProgress();
const visible = useDelayedLoading(active);
</script>

<template>
  <Transition name="page-progress">
    <div v-if="visible" class="page-progress" role="progressbar" aria-label="页面加载中">
      <span class="page-progress__fill" />
    </div>
  </Transition>
</template>

<style scoped lang="scss">
@use '@/styles/variables.scss' as *;

.page-progress {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  height: 3px;
  z-index: 3000;
  background: $color-primary-50;
  overflow: hidden;
  pointer-events: none;
}

.page-progress__fill {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  width: 38%;
  border-radius: 2px;
  background: linear-gradient(90deg, $color-primary, #548cff);
  animation: page-progress-run 1.5s cubic-bezier(0.2, 0.6, 0.4, 1) infinite;
}

@keyframes page-progress-run {
  0% {
    left: -38%;
    width: 38%;
  }
  60% {
    left: 62%;
    width: 46%;
  }
  100% {
    left: 100%;
    width: 0%;
  }
}

.page-progress-enter-active,
.page-progress-leave-active {
  transition: opacity 0.15s ease;
}

.page-progress-enter-from,
.page-progress-leave-to {
  opacity: 0;
}
/* 无障碍豁免（同 BootSplash）：加载反馈属功能性动画，reduce 偏好下恢复时长，
   否则进度指示静止会被误判为页面卡死。!important 才能压过全局 * !important。 */
@media (prefers-reduced-motion: reduce) {
  .page-progress__fill {
    animation-duration: 1.5s !important;
  }
}
</style>
