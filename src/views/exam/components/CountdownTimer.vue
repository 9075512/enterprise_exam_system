<script setup lang="ts">
/**
 * 倒计时展示组件（W3-T1）。仅负责呈现，计时由父组件 setInterval 驱动。
 *
 * v3.1 方向 C：改为设计稿 `.timer` 的琥珀色药丸（6px 圆角 + 14px 等宽数字）；
 * 进入警戒时长后升级为语义红并闪烁（琥珀 → 红是明确的「升级」表达，
 * 不再用蓝→红这种跨语义的跳变）。
 */
import { computed, onMounted } from 'vue';
import { Clock } from '@element-plus/icons-vue';
import { useSettingsStore } from '@/stores/settings';
import { formatClock } from '@/utils/format';

const props = defineProps<{ remainingSeconds: number }>();
defineEmits<{ (e: 'timeout'): void }>();

const settingsStore = useSettingsStore();

onMounted(() => {
  void settingsStore.load();
});

const warning = computed<boolean>(
  () => props.remainingSeconds <= settingsStore.settings.countdownWarningMinutes * 60,
);
const text = computed<string>(() => formatClock(props.remainingSeconds));
</script>

<template>
  <span
    class="countdown"
    :class="{ 'countdown--warning': warning }"
    role="timer"
    :aria-label="`剩余时间 ${text}`"
  >
    <el-icon class="countdown__icon"><Clock /></el-icon>
    <span class="countdown__text num">{{ text }}</span>
  </span>
</template>

<style scoped lang="scss">
@use '@/styles/variables.scss' as *;

.countdown {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  height: 34px;
  padding: 0 12px;
  border-radius: $radius-sm;
  background: $color-warning-bg;
  font-size: 14px;
  font-weight: 660;
  letter-spacing: 0.02em;
  color: $color-warning-text;
  transition: background-color $transition-fast, color $transition-fast;

  &__icon {
    font-size: 14px;
  }

  &__text {
    font-variant-numeric: tabular-nums;
  }

  &--warning {
    background: $color-error-bg;
    color: $color-error-text;
    animation: countdown-pulse 1s ease-in-out infinite;
  }
}

@keyframes countdown-pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.5;
  }
}
</style>
