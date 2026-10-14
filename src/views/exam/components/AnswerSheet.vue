<script setup lang="ts">
/**
 * 答题卡（W3-T1）。题号网格：已答 / 未答 / 当前题三种态；点击题号 emit jump（传全局索引）。
 *
 * v3.1 方向 C（设计稿 p-exam-taking aside）：
 * 头部改为「答题卡」微标签 + 题型构成汇总 + 已答计数标签，不再按题型分组渲染多段网格
 * （设计稿是一张平铺网格，题号顺序即试卷顺序，跳转语义不变）；
 * 单元格改为 4px 圆角方片（已答=主色实底白字 / 当前=主色 2px 描边 / 未答=发丝线），
 * 图例沿用设计稿的色块行。进度条已上移到作答页顶栏，此处不再重复。
 */
import { computed } from 'vue';
import { QUESTION_TYPE_LABELS } from '@/constants';
import type { QuestionType } from '@/types';

const props = defineProps<{
  questions: { id: string; type: QuestionType }[];
  answers: Record<string, number[] | string[]>;
  currentIndex: number;
}>();

const emit = defineEmits<{ (e: 'jump', index: number): void }>();

/** 题型固定顺序（与后端组卷展示顺序一致），仅用于汇总行文案 */
const TYPE_ORDER: QuestionType[] = ['single', 'multiple', 'judge', 'fill', 'short'];

const answeredCount = computed<number>(
  () => props.questions.filter((q) => (props.answers[q.id]?.length ?? 0) > 0).length,
);

const unansweredCount = computed<number>(() => props.questions.length - answeredCount.value);

/** 题型构成汇总（如「单选 20 · 多选 10 · 判断 10」），空卷返回空串 */
const composition = computed<string>(() => {
  const buckets = new Map<QuestionType, number>();
  props.questions.forEach((q) => buckets.set(q.type, (buckets.get(q.type) ?? 0) + 1));
  return TYPE_ORDER.filter((t) => buckets.get(t))
    .map((t) => `${QUESTION_TYPE_LABELS[t]} ${buckets.get(t)}`)
    .join(' · ');
});

function answered(id: string): boolean {
  return (props.answers[id]?.length ?? 0) > 0;
}

function cellTitle(no: number, id: string): string {
  return `第 ${no} 题（${answered(id) ? '已答' : '未答'}）`;
}
</script>

<template>
  <div class="answer-sheet">
    <div class="answer-sheet__head">
      <div class="answer-sheet__title">
        <span class="answer-sheet__kicker">答题卡</span>
        <span v-if="composition" class="answer-sheet__comp">{{ composition }}</span>
      </div>
      <span class="answer-sheet__tag">已答 {{ answeredCount }}</span>
    </div>

    <div class="answer-sheet__grid">
      <button
        v-for="(item, index) in questions"
        :key="item.id"
        type="button"
        class="answer-sheet__cell"
        :class="{
          'answer-sheet__cell--answered': answered(item.id),
          'answer-sheet__cell--current': index === currentIndex,
        }"
        :title="cellTitle(index + 1, item.id)"
        :aria-label="cellTitle(index + 1, item.id)"
        :aria-current="index === currentIndex ? 'true' : undefined"
        @click="emit('jump', index)"
      >
        {{ index + 1 }}
      </button>
    </div>

    <!-- 图例（设计稿 .lg） -->
    <div class="answer-sheet__legend">
      <span class="answer-sheet__legend-item">
        <i class="answer-sheet__swatch answer-sheet__swatch--answered" />已作答（{{ answeredCount }}）
      </span>
      <span class="answer-sheet__legend-item">
        <i class="answer-sheet__swatch answer-sheet__swatch--current" />当前题目
      </span>
      <span class="answer-sheet__legend-item">
        <i class="answer-sheet__swatch" />未作答（{{ unansweredCount }}）
      </span>
    </div>
  </div>
</template>

<style scoped lang="scss">
@use '@/styles/variables.scss' as *;

.answer-sheet {
  display: flex;
  flex-direction: column;

  &__head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 10px;
    margin-bottom: 12px;
  }

  &__title {
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-width: 0;
  }

  /* 微标签：10.5px / 大写 / 加字距（DESIGN-C §2.3） */
  &__kicker {
    font-size: 10.5px;
    font-weight: 600;
    letter-spacing: 0.11em;
    text-transform: uppercase;
    color: $text-secondary;
  }

  &__comp {
    font-size: 12.5px;
    font-weight: 600;
    color: $text-primary;
  }

  &__tag {
    flex: 0 0 auto;
    display: inline-flex;
    align-items: center;
    height: 19px;
    padding: 0 6px;
    border-radius: $radius-xs;
    background: $color-neutral-bg;
    font-size: 11px;
    font-weight: 550;
    color: $text-secondary;
  }

  &__grid {
    display: grid;
    grid-template-columns: repeat(5, minmax(0, 1fr));
    gap: 6px;
    max-height: calc(100vh - 300px);
    overflow-y: auto;
  }

  &__cell {
    aspect-ratio: 1;
    display: grid;
    place-items: center;
    padding: 0;
    border: 1px solid $line-strong;
    border-radius: $radius-xs;
    background: $bg-paper;
    font-size: 12px;
    font-weight: 580;
    color: $text-secondary;
    font-variant-numeric: tabular-nums;
    cursor: pointer;
    transition: background-color $transition-fast, border-color $transition-fast, color $transition-fast;

    &:hover {
      border-color: $color-primary;
      color: $color-primary;
    }

    &--answered {
      background: $color-primary;
      border-color: $color-primary;
      color: #fff;

      &:hover {
        background: $color-primary-dark;
        border-color: $color-primary-dark;
        color: #fff;
      }
    }

    &--current {
      border-color: $color-primary;
      border-width: 2px;
      color: $color-primary;
      font-weight: 680;

      /* 已答 + 当前：主色实底上必须保持白字（主色字压主色底读不出来） */
      &.answer-sheet__cell--answered {
        color: #fff;
      }
    }
  }

  &__legend {
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin-top: 12px;
    padding-top: 12px;
    border-top: 1px solid $border-color;
  }

  &__legend-item {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 12px;
    color: $text-secondary;
  }

  &__swatch {
    flex: 0 0 12px;
    width: 12px;
    height: 12px;
    border: 1px solid $line-strong;
    border-radius: 3px;

    &--answered {
      background: $color-primary;
      border-color: $color-primary;
    }

    &--current {
      background: $bg-paper;
      border-color: $color-primary;
      border-width: 2px;
    }
  }
}
</style>
