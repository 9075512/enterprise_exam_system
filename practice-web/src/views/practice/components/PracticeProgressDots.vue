<script setup lang="ts">
/**
 * 练题进度条（轻量替代考试答题卡）。
 * PC 与移动端统一展示连续进度，题量再多也不会换行或撑高工具栏。
 */
import { computed } from 'vue';

const props = withDefaults(
  defineProps<{
    /** 题目总数 */
    total: number;
    /** 当前题索引（从 0 开始） */
    current: number;
    /** 每题状态：unanswered / correct / wrong（长度应为 total，缺省按未答处理） */
    marks: Array<'unanswered' | 'correct' | 'wrong'>;
    /** 配色变体：深色底（顶栏）/ 浅色底（内容区） */
    variant?: 'on-dark' | 'on-light';
  }>(),
  { variant: 'on-light' },
);

/** 仅统计题目总数范围内已经判分的题目。 */
const answered = computed<number>(() => {
  let count = 0;
  for (let i = 0; i < props.total; i += 1) {
    const mark = props.marks[i] ?? 'unanswered';
    if (mark !== 'unanswered') count += 1;
  }
  return count;
});
const percent = computed<number>(() => (
  props.total > 0 ? Math.min(100, Math.round((answered.value / props.total) * 100)) : 0
));
</script>

<template>
  <div
    class="progress-dots"
    :class="`progress-dots--${variant}`"
    role="progressbar"
    :aria-valuenow="answered"
    :aria-valuemin="0"
    :aria-valuemax="total"
  >
    <span class="progress-dots__track" aria-hidden="true">
      <span class="progress-dots__fill" :style="{ width: `${percent}%` }" />
    </span>
    <span class="progress-dots__label">已完成 {{ answered }} / {{ total }}</span>
  </div>
</template>

<style scoped lang="scss">
@use '@/styles/variables.scss' as *;

.progress-dots {
  display: flex;
  align-items: center;
  gap: 10px;
  overflow: hidden;

  &__track {
    position: relative;
    flex: 1;
    min-width: 0;
    height: 6px;
    overflow: hidden;
    border-radius: 3px;
    background: $practice-surface-3;
  }

  &__fill {
    display: block;
    height: 100%;
    border-radius: inherit;
    background: $practice-primary;
    transition: width $transition-base;
  }

  &__label {
    flex: 0 0 auto;
    font-size: 11px;
    color: $text-secondary;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }
}

.progress-dots--on-dark {
  .progress-dots__track {
    background: rgba(255, 255, 255, 0.35);
  }

  .progress-dots__fill {
    background: #fff;
  }

  .progress-dots__label {
    color: rgba(255, 255, 255, 0.82);
  }
}
</style>
