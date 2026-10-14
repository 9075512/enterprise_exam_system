<script setup lang="ts">
/**
 * 单题作答卡片（W3-T1）。考试中不显示正确答案。
 * 单选/判断 → 单选；多选 → 复选（提交前升序）。
 * 选项行样式化为「可选卡片」：左侧圆形（单选）/圆角方形（多选）字母徽标表示选项，
 * 原生控件视觉隐藏但保留可点击与键盘可达性。
 */
import { computed } from 'vue';
import { QUESTION_TYPE_LABELS } from '@/constants';
import type { Question } from '@/types';

const props = defineProps<{
  /** 从 0 开始的题号 */
  index: number;
  question: Question;
  score: number;
  modelValue: number[];
}>();

const emit = defineEmits<{ (e: 'update:modelValue', value: number[]): void }>();

const isMultiple = computed<boolean>(() => props.question.type === 'multiple');

function letter(i: number): string {
  return String.fromCharCode(65 + i);
}

const radioValue = computed<number | undefined>({
  get: () => props.modelValue[0],
  set: (value) => emit('update:modelValue', value === undefined ? [] : [value]),
});

const checkboxValue = computed<number[]>({
  get: () => props.modelValue,
  set: (value) => emit('update:modelValue', [...value].sort((a, b) => a - b)),
});
</script>

<template>
  <div class="question-card">
    <div class="question-card__head">
      <span class="question-card__index num">第 {{ index + 1 }} 题</span>
      <span class="question-card__type" :class="`question-card__type--${question.type}`">
        {{ QUESTION_TYPE_LABELS[question.type] }}
      </span>
      <span class="question-card__score num">{{ score }} 分</span>
    </div>

    <p class="question-card__stem">{{ question.stem }}</p>

    <el-radio-group v-if="!isMultiple" v-model="radioValue" class="question-card__options">
      <el-radio v-for="(option, i) in question.options" :key="i" :value="i" class="question-card__option">
        <span class="question-card__letter">{{ letter(i) }}</span>
        <span class="question-card__text">{{ option }}</span>
      </el-radio>
    </el-radio-group>

    <el-checkbox-group v-else v-model="checkboxValue" class="question-card__options">
      <el-checkbox v-for="(option, i) in question.options" :key="i" :value="i" class="question-card__option">
        <span class="question-card__letter question-card__letter--multi">{{ letter(i) }}</span>
        <span class="question-card__text">{{ option }}</span>
      </el-checkbox>
    </el-checkbox-group>
  </div>
</template>

<style scoped lang="scss">
@use '@/styles/variables.scss' as *;

.question-card {
  padding: 22px 26px;
  background: $bg-paper;
  border: 1px solid $border-color;
  border-radius: $radius-lg;
  box-shadow: $shadow-sm;

  &__head {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 16px;
  }

  &__index {
    display: inline-flex;
    align-items: center;
    height: 28px;
    padding: 0 14px;
    border-radius: 999px;
    background: $practice-soft;
    font-size: 13px;
    font-weight: 700;
    color: $practice-primary;
    letter-spacing: 0.4px;
  }

  /* 题型徽标配色（单选蓝 / 多选青 / 判断橙）——分类色，只表题型不表状态 */
  &__type {
    display: inline-flex;
    align-items: center;
    height: 24px;
    padding: 0 11px;
    border-radius: 999px;
    font-size: 12px;
    font-weight: 600;

    &--single {
      color: $practice-primary;
      background: $practice-soft;
    }

    &--multiple {
      color: $type-multiple-text;
      background: $type-multiple-soft;
    }

    &--judge {
      color: $color-warning-text;
      background: $color-warning-bg;
    }
  }

  &__score {
    margin-left: auto;
    font-size: 13px;
    font-weight: 600;
    color: $text-disabled;
  }

  &__stem {
    position: relative;
    margin: 0 0 18px;
    padding-left: 14px;
    font-size: 16px;
    line-height: 1.8;
    letter-spacing: 0.2px;
    color: $text-primary;

    /* 克制的题干锚点：首行前的小竖条 */
    &::before {
      content: '';
      position: absolute;
      top: 0.45em;
      left: 0;
      width: 3px;
      height: 1em;
      border-radius: 3px;
      background: linear-gradient(180deg, $practice-primary, $practice-primary-light);
    }
  }

  &__options {
    display: flex;
    flex-direction: column;
    align-items: stretch;
    gap: 12px;
  }

  &__option {
    position: relative;
    display: flex;
    align-items: flex-start;
    height: auto;
    margin-right: 0;
    padding: 13px 16px;
    border: 1px solid $border-color;
    border-radius: $radius-base;
    background: $bg-paper;
    white-space: normal;
    cursor: pointer;
    transition: border-color $transition-fast, background-color $transition-fast,
      box-shadow $transition-fast, transform $transition-fast;

    &:hover {
      border-color: rgba($practice-primary, 0.4);
      background: $practice-soft;
      box-shadow: $shadow-sm;
      transform: translateY(-1px);
    }

    &:focus-within {
      border-color: rgba($practice-primary, 0.55);
      box-shadow: 0 0 0 3px rgba($practice-primary, 0.12);
    }

    &.is-checked {
      border-color: $practice-primary;
      background: $practice-soft;
      box-shadow: 0 0 0 3px rgba($practice-primary, 0.1), 0 2px 8px -2px rgba($practice-primary, 0.28);
    }

    /* 原生控件视觉隐藏（保留在 DOM 中以维持点击与键盘可达性） */
    :deep(.el-radio__input),
    :deep(.el-checkbox__input) {
      position: absolute;
      width: 0;
      height: 0;
      margin: 0;
      opacity: 0;
      pointer-events: none;
    }

    :deep(.el-radio__label),
    :deep(.el-checkbox__label) {
      display: flex;
      align-items: flex-start;
      gap: 12px;
      padding: 0;
      margin: 0;
      width: 100%;
      font-size: 15px;
      line-height: 1.7;
      color: $text-primary;
      white-space: normal;
    }

    &.is-checked :deep(.el-radio__label),
    &.is-checked :deep(.el-checkbox__label) {
      color: $practice-primary-dark;
      font-weight: 500;
    }
  }

  &__letter {
    flex-shrink: 0;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 26px;
    height: 26px;
    border: 1px solid $border-color;
    border-radius: 50%;
    background: $color-table-head;
    font-size: 13px;
    font-weight: 700;
    color: $text-secondary;
    transition: background-color $transition-fast, border-color $transition-fast,
      color $transition-fast, box-shadow $transition-fast;

    &--multi {
      border-radius: 8px;
    }
  }

  &__option.is-checked .question-card__letter {
    border-color: $practice-primary;
    background: $practice-primary;
    color: #fff;
    box-shadow: 0 0 0 3px rgba($practice-primary, 0.16);
  }

  &__text {
    flex: 1;
    min-width: 0;
    word-break: break-word;
  }
}
</style>
