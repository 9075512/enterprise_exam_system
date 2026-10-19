<script setup lang="ts">
/**
 * 答题卡组件。题号网格：已答 / 未答 / 当前题三种态；点击题号 emit jump（传全局索引）。
 *
 * 2026-10-15 改（用户需求）：题号按**题型分类分段**展示（单选 / 多选 / 判断 / 填空 / 简答），
 * 每段小标题「单选题 · 20 题」+ 该段独立网格；题号仍为全卷连续编号，跳转语义不变。
 * 考生信息块由父级（作答页 aside）渲染在本组件上方。
 */
import { computed } from 'vue';
import { QUESTION_TYPE_LABELS } from '@/constants';
import type { QuestionType } from '@/types';
import { isAnswered } from '@/utils/answerState';

const props = defineProps<{
  questions: { id: string; type: QuestionType; blanks?: number }[];
  answers: Record<string, number[] | string[]>;
  currentIndex: number;
}>();

const emit = defineEmits<{ (e: 'jump', index: number): void }>();

/** 题型固定顺序（与后端组卷展示顺序一致） */
const TYPE_ORDER: QuestionType[] = ['single', 'multiple', 'judge', 'fill', 'short'];

/** 按题型分段的题号组（题号为全卷连续编号，跳转传全局索引） */
const groups = computed<Array<{ type: QuestionType; items: Array<{ id: string; index: number }> }>>(() => {
  const buckets = new Map<QuestionType, Array<{ id: string; index: number }>>();
  props.questions.forEach((q, index) => {
    const list = buckets.get(q.type) ?? [];
    list.push({ id: q.id, index });
    buckets.set(q.type, list);
  });
  return TYPE_ORDER.filter((t) => buckets.get(t)?.length).map((type) => ({ type, items: buckets.get(type)! }));
});

const answeredCount = computed<number>(
  () => props.questions.filter((q) => isAnswered(props.answers[q.id], q.type, q.blanks)).length,
);

const unansweredCount = computed<number>(() => props.questions.length - answeredCount.value);

function answered(id: string): boolean {
  const question = props.questions.find(q => q.id === id);
  return isAnswered(props.answers[id], question?.type, question?.blanks);
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
        <span class="answer-sheet__comp">共 {{ questions.length }} 题</span>
      </div>
      <span class="answer-sheet__tag">已答 {{ answeredCount }}</span>
    </div>

    <!-- 按题型分段（设计稿每段一组网格） -->
    <div v-for="group in groups" :key="group.type" class="answer-sheet__section">
      <div class="answer-sheet__sec-title">
        {{ QUESTION_TYPE_LABELS[group.type] }}
        <span class="answer-sheet__sec-count">{{ group.items.length }} 题</span>
      </div>
      <div class="answer-sheet__grid">
        <button
          v-for="item in group.items"
          :key="item.id"
          type="button"
          class="answer-sheet__cell"
          :class="{
            'answer-sheet__cell--answered': answered(item.id),
            'answer-sheet__cell--current': item.index === currentIndex,
          }"
          :title="cellTitle(item.index + 1, item.id)"
          :aria-label="cellTitle(item.index + 1, item.id)"
          :aria-current="item.index === currentIndex ? 'true' : undefined"
          @click="emit('jump', item.index)"
        >
          {{ item.index + 1 }}
        </button>
      </div>
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
    font-size: 12px;
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

  &__section {
    margin-top: 12px;
  }

  &__sec-title {
    font-size: 12px;
    font-weight: 600;
    color: $text-primary;
    margin-bottom: 6px;
  }

  &__sec-count {
    margin-left: 4px;
    font-size: 12px;
    font-weight: 500;
    color: $text-secondary;
  }

  &__tag {
    flex: 0 0 auto;
    display: inline-flex;
    align-items: center;
    height: 19px;
    padding: 0 6px;
    border-radius: $radius-xs;
    background: $color-neutral-bg;
    font-size: 12px;
    font-weight: 550;
    color: $text-secondary;
  }

  &__grid {
    display: grid;
    grid-template-columns: repeat(5, minmax(0, 1fr));
    gap: 6px;
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

@media (max-width: 900px) {
  .answer-sheet__grid { grid-template-columns: repeat(auto-fill, minmax(44px, 1fr)); gap: 8px; }
  .answer-sheet__cell { min-width: 44px; min-height: 44px; }
}
</style>
