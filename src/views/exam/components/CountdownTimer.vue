<script setup lang="ts">
/**
 * 倒计时展示组件（W3-T1）。仅负责呈现，计时由父组件 setInterval 驱动。
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
  <span class="countdown" :class="{ 'countdown--warning': warning }">
    <el-icon class="countdown__icon"><Clock /></el-icon>
    <span class="countdown__label">{{ warning ? '仅剩' : '剩余' }}</span>
    <span class="countdown__text num">{{ text }}</span>
  </span>
</template>

<style scoped lang="scss">
@use '@/styles/variables.scss' as *;

.countdown {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  height: 38px;
  padding: 0 16px;
  border: 1px solid rgba($color-primary, 0.18);
  border-radius: 999px;
  background: $color-primary-soft;
  font-size: 16px;
  font-weight: 600;
  color: $color-primary;
  transition: background-color $transition-fast, color $transition-fast, border-color $transition-fast;

  &__icon {
    font-size: 16px;
  }

  &__label {
    font-size: 12px;
    font-weight: 500;
    color: $text-secondary;
  }

  &__text {
    font-family: 'SFMono-Regular', Consolas, monospace;
    font-variant-numeric: tabular-nums;
    letter-spacing: 0.5px;
  }

  &--warning {
    background: rgba($color-error, 0.08);
    border-color: rgba($color-error, 0.3);
    color: $color-error;
    animation: countdown-pulse 1s ease-in-out infinite;

    .countdown__label {
      color: rgba($color-error, 0.75);
    }
  }
}

@keyframes countdown-pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.45;
  }
}
</style>
