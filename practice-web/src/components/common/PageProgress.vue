<script setup lang="ts">
/**
 * 顶栏进度细条（Loading 方案 ⑤，Loading 设计 §5）。
 * 3px 主色渐变细条固定在视口顶部，路由跳转期间从左向右冲刺循环；
 * 结束后 300ms 淡出。配合 `usePageProgress` 使用，挂在 App 根部即可。
 */
import { ref, watch } from 'vue';
import { usePageProgress } from '@/composables/usePageProgress';

const { active } = usePageProgress();
/** active=false 后延迟 300ms 再移除 DOM（淡出） */
const visible = ref(active.value);
let hideTimer: number | undefined;

watch(active, (on) => {
  window.clearTimeout(hideTimer);
  if (on) {
    visible.value = true;
  } else {
    hideTimer = window.setTimeout(() => (visible.value = false), 300);
  }
});
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
  background: $practice-soft;
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
  background: linear-gradient(90deg, $practice-primary, #548CFF);
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
  transition: opacity 0.3s ease;
}

.page-progress-enter-from,
.page-progress-leave-to {
  opacity: 0;
}
</style>
