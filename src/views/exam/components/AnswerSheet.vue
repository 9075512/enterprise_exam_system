<script setup lang="ts">
/**
 * 答题卡（W3-T1）。按题型（单选 → 多选 → 判断）分组展示题号网格：
 * 已答/未答/当前题三种态；点击题号 emit jump（传全局索引）。
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

/** 分组固定顺序（与后端组卷展示顺序一致） */
const TYPE_ORDER: QuestionType[] = ['single', 'multiple', 'judge', 'fill', 'short'];

interface GroupItem {
  /** 全局题号（原始索引 + 1），始终按原顺序编号 */
  no: number;
  /** 全局索引，用于 answered 判定与 jump */
  index: number;
  id: string;
}

interface QuestionGroup {
  type: QuestionType;
  label: string;
  answeredCount: number;
  /** 当前题是否落在该分组内（用于高亮分组） */
  active: boolean;
  items: GroupItem[];
}

const answeredCount = computed<number>(
  () => props.questions.filter((q) => (props.answers[q.id]?.length ?? 0) > 0).length,
);

const unansweredCount = computed<number>(() => props.questions.length - answeredCount.value);

/** 完成度百分比（无题目时按 100 处理，避免进度条出现 0/0） */
const progress = computed<number>(() => {
  if (props.questions.length === 0) return 100;
  return Math.round((answeredCount.value / props.questions.length) * 100);
});

const groups = computed<QuestionGroup[]>(() => {
  const buckets = new Map<QuestionType, GroupItem[]>();
  props.questions.forEach((q, index) => {
    const list = buckets.get(q.type) ?? [];
    list.push({ no: index + 1, index, id: q.id });
    buckets.set(q.type, list);
  });
  return TYPE_ORDER.filter((type) => (buckets.get(type)?.length ?? 0) > 0).map((type) => {
    const items = buckets.get(type) ?? [];
    const answered = items.filter((item) => (props.answers[item.id]?.length ?? 0) > 0).length;
    return {
      type,
      label: QUESTION_TYPE_LABELS[type],
      answeredCount: answered,
      active: items.some((item) => item.index === props.currentIndex),
      items,
    };
  });
});

function answered(id: string): boolean {
  return (props.answers[id]?.length ?? 0) > 0;
}

function cellTitle(no: number, id: string): string {
  return `第 ${no} 题（${answered(id) ? '已答' : '未答'}）`;
}

function onJump(index: number): void {
  emit('jump', index);
}
</script>

<template>
  <div class="answer-sheet">
    <!-- 总进度 -->
    <div class="answer-sheet__head">
      <div class="answer-sheet__stat">
        <span>已答 <b class="num">{{ answeredCount }}</b> / 共 {{ questions.length }}</span>
        <span class="answer-sheet__stat-left">未答 {{ unansweredCount }}</span>
      </div>
      <el-progress
        class="answer-sheet__progress"
        :percentage="progress"
        :stroke-width="6"
        :show-text="false"
        :color="progress === 100 ? '#16A34A' : '#2563EB'"
      />
    </div>

    <div class="answer-sheet__body">
      <div
        v-for="group in groups"
        :key="group.type"
        class="answer-sheet__group"
        :class="{ 'answer-sheet__group--active': group.active }"
      >
        <div class="answer-sheet__group-title">
          <span class="answer-sheet__group-name">
            <i class="answer-sheet__dot" :class="`answer-sheet__dot--${group.type}`" />
            {{ group.label }}
          </span>
          <span class="answer-sheet__group-count num">
            {{ group.answeredCount }}/{{ group.items.length }}
          </span>
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
            :title="cellTitle(item.no, item.id)"
            :aria-label="cellTitle(item.no, item.id)"
            :aria-current="item.index === currentIndex ? 'true' : undefined"
            @click="onJump(item.index)"
          >
            {{ item.no }}
          </button>
        </div>
      </div>
    </div>

    <!-- 图例 -->
    <div class="answer-sheet__legend">
      <span class="answer-sheet__legend-item">
        <i class="answer-sheet__swatch answer-sheet__swatch--answered" />已答
      </span>
      <span class="answer-sheet__legend-item">
        <i class="answer-sheet__swatch answer-sheet__swatch--empty" />未答
      </span>
      <span class="answer-sheet__legend-item">
        <i class="answer-sheet__swatch answer-sheet__swatch--current" />当前
      </span>
    </div>
  </div>
</template>

<style scoped lang="scss">
@use '@/styles/variables.scss' as *;

.answer-sheet {
  display: flex;
  flex-direction: column;
  max-height: calc(100vh - 220px);

  &__head {
    flex: 0 0 auto;
  }

  &__stat {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 8px;
    font-size: 13px;
    color: $text-secondary;

    b {
      font-size: 15px;
      color: $text-primary;
    }
  }

  &__stat-left {
    font-size: 12px;
    color: $text-disabled;
  }

  &__progress {
    margin-bottom: 12px;
  }

  &__body {
    flex: 1 1 auto;
    min-height: 0;
    overflow-y: auto;
    padding-right: 4px;
  }

  &__group {
    padding: 10px;
    border: 1px solid transparent;
    border-radius: $radius-sm;
    transition: background-color $transition-fast, border-color $transition-fast;

    & + & {
      margin-top: 8px;
    }

    &--active {
      background: $color-primary-soft;
      border-color: rgba(37, 99, 235, 0.24);
    }
  }

  &__group-title {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 8px;
    font-size: 13px;
  }

  &__group-name {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-weight: 600;
    color: $text-secondary;
  }

  &__dot {
    display: inline-block;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: $color-primary;

    &--single {
      background: $color-primary;
    }

    &--multiple {
      background: $color-secondary;
    }

    &--judge {
      background: $color-warning;
    }

    &--fill {
      background: $color-success;
    }

    &--short {
      background: $text-disabled;
    }
  }

  &__group-count {
    font-size: 12px;
    color: $text-disabled;
  }

  &__grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(40px, 1fr));
    gap: 8px;
  }

  &__cell {
    height: 36px;
    border: 1px solid $border-color;
    border-radius: $radius-sm;
    background: $bg-paper;
    color: $text-primary;
    font-size: 13px;
    font-variant-numeric: tabular-nums;
    cursor: pointer;
    transition: background-color $transition-fast, border-color $transition-fast, color $transition-fast,
      box-shadow $transition-fast;

    &:hover {
      border-color: $color-primary;
      background: $color-primary-soft;
    }

    &--answered {
      background: $color-primary;
      border-color: $color-primary;
      color: $bg-paper;
      font-weight: 600;

      &:hover {
        background: $color-primary-dark;
        border-color: $color-primary-dark;
      }
    }

    &--current {
      border-color: $color-primary;
      border-width: 2px;
      font-weight: 700;
      box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.18);
    }
  }

  &__legend {
    flex: 0 0 auto;
    display: flex;
    align-items: center;
    gap: 14px;
    margin-top: 12px;
    padding-top: 10px;
    border-top: 1px solid $border-color;
    font-size: 12px;
    color: $text-secondary;
  }

  &__legend-item {
    display: inline-flex;
    align-items: center;
    gap: 5px;
  }

  &__swatch {
    display: inline-block;
    width: 12px;
    height: 12px;
    border-radius: 3px;
    border: 1px solid $border-color;

    &--answered {
      background: $color-primary;
      border-color: $color-primary;
    }

    &--empty {
      background: $bg-paper;
    }

    &--current {
      background: $bg-paper;
      border-color: $color-primary;
      box-shadow: 0 0 0 2px rgba(37, 99, 235, 0.18);
    }
  }
}
</style>
