<script setup lang="ts">
/**
 * 环形进度（Loading 方案 ④）—— 有确定进度 / 不确定脉冲的异步任务指示。
 * 无真实进度时端点圆环 + 呼吸动画示意「仍在推进」；拿到进度后传 value (0-100) 显示精确值并停用动画。
 */
import { computed } from 'vue';

const props = withDefaults(defineProps<{ caption?: string; value?: number | null }>(), {
  caption: '',
  value: null,
});

const RADIUS = 36;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

/** 有值 → 精确弧长；无值 → 呼吸脉冲 */
const dashOffset = computed(() =>
  props.value === null
    ? CIRCUMFERENCE * 0.3
    : CIRCUMFERENCE * (1 - Math.min(1, Math.max(0, props.value / 100))),
);
</script>

<template>
  <div class="ring-progress" role="status" :aria-label="caption || '处理中'">
    <div class="ring-progress__wrap">
      <svg width="88" height="88" viewBox="0 0 88 88">
        <circle class="ring-progress__track" cx="44" cy="44" :r="RADIUS" />
        <circle
          class="ring-progress__bar"
          :class="{ 'is-pulse': value === null }"
          cx="44"
          cy="44"
          :r="RADIUS"
          :stroke-dasharray="CIRCUMFERENCE"
          :stroke-dashoffset="dashOffset"
        />
      </svg>
      <span v-if="value !== null" class="ring-progress__num">{{ Math.round(value) }}%</span>
    </div>
    <span v-if="caption" class="ring-progress__caption">{{ caption }}</span>
  </div>
</template>

<style scoped lang="scss">
@use '@/styles/variables.scss' as *;

.ring-progress {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 18px;
}

.ring-progress__wrap {
  position: relative;
  width: 88px;
  height: 88px;
  display: grid;
  place-items: center;

  svg {
    position: absolute;
    inset: 0;
    transform: rotate(-90deg);
  }
}

.ring-progress__track {
  fill: none;
  stroke: $practice-soft;
  stroke-width: 7;
}

.ring-progress__bar {
  fill: none;
  stroke: $practice-primary;
  stroke-width: 7;
  stroke-linecap: round;
  transition: stroke-dashoffset 0.4s ease;

  &.is-pulse {
    animation: ring-pulse 2s ease-in-out infinite;
  }
}

@keyframes ring-pulse {
  0%,
  100% {
    stroke-dashoffset: 68;
  }
  50% {
    stroke-dashoffset: 90;
  }
}

.ring-progress__num {
  font-size: 19px;
  font-weight: 680;
  color: $practice-primary;
  font-variant-numeric: tabular-nums;
}

.ring-progress__caption {
  font-size: 12px;
  color: $text-secondary;
}
</style>
