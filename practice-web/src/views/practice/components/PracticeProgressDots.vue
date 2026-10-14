<script setup lang="ts">
/**
 * 移动端练题进度点（轻量替代考试答题卡）。
 * 每个点表示一题：未答（中性）/ 答对（绿）/ 答错（红）；当前题高亮放大为胶囊。
 * 视觉：冷静蓝 · 商务风（去光晕，仅以实色区分状态）。
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

/** 归一化状态数组（补齐长度）。 */
const normalized = computed<Array<'unanswered' | 'correct' | 'wrong'>>(() => {
  const out: Array<'unanswered' | 'correct' | 'wrong'> = [];
  for (let i = 0; i < props.total; i += 1) out.push(props.marks[i] ?? 'unanswered');
  return out;
});
</script>

<template>
  <div
    class="progress-dots"
    :class="`progress-dots--${variant}`"
    role="progressbar"
    :aria-valuenow="current + 1"
    :aria-valuemin="1"
    :aria-valuemax="total"
  >
    <span
      v-for="(mark, i) in normalized"
      :key="i"
      class="progress-dots__dot"
      :class="[`progress-dots__dot--${mark}`, { 'is-current': i === current }]"
    />
  </div>
</template>

<style scoped lang="scss">
@use '@/styles/variables.scss' as *;

.progress-dots {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px;

  &__dot {
    flex: 0 0 auto;
    width: 22px;
    height: 4px;
    border-radius: 2px;
    transition: background-color $transition-fast;
  }
}

/* 浅色底（内容区）配色：中性 / 答对 / 答错 / 当前（设计图 .m-dots） */
.progress-dots--on-light .progress-dots__dot {
  background: $practice-surface-3;

  &--correct {
    background: $color-success;
  }

  &--wrong {
    background: $color-error;
  }

  &.is-current {
    background: $practice-primary;
  }

  &--correct.is-current {
    background: $color-success;
  }

  &--wrong.is-current {
    background: $color-error;
  }
}

/* 深色底（顶部栏）配色 */
.progress-dots--on-dark .progress-dots__dot {
  background: rgba(255, 255, 255, 0.4);

  &--correct {
    background: $color-success-bg;
  }

  &--wrong {
    background: $color-error-bg;
  }

  &.is-current {
    background: #fff;
  }
}
</style>
