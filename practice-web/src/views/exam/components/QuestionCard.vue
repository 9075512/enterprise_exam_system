<script setup lang="ts">
/**
 * 单题作答卡片（W3-T1）。考试中不显示正确答案。
 * 单选/判断 → 单选；多选 → 复选（提交前升序）。
 * 选项行样式化为「可选卡片」：左侧圆形（单选）/圆角方形（多选）字母徽标表示选项，
 * 原生控件视觉隐藏但保留可点击与键盘可达性。
 * 视觉：v3.1 方向 C —— 移动端刻度（卡 16px 内距 / 题干 14.5px / 选项 13px），零投影。
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
      <span class="question-card__index num">{{ index + 1 }}</span>
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
  padding: 16px;
  background: $bg-paper;
  border: 1px solid $border-color;
  border-radius: $radius-base;

  &__head {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 10px;
  }

  /* 题号方块（设计图 .m-q__no b）：主色实底白字 */
  &__index {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 22px;
    height: 22px;
    border-radius: $radius-xs;
    background: $practice-primary;
    font-size: 11.5px;
    font-weight: 700;
    color: #fff;
    line-height: 1;
  }

  /* 题型徽标配色（单选蓝 / 多选青 / 判断橙）——分类色，只表题型不表状态 */
  &__type {
    display: inline-flex;
    align-items: center;
    height: 19px;
    padding: 0 6px;
    border-radius: $radius-xs;
    font-size: 10.5px;
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
    font-size: 11.5px;
    font-weight: 550;
    color: $text-secondary;
  }

  &__stem {
    margin: 0 0 14px;
    font-size: 14.5px;
    line-height: 1.75;
    font-weight: 520;
    color: $text-primary;
  }

  &__options {
    display: flex;
    flex-direction: column;
    align-items: stretch;
    gap: 8px;
  }

  &__option {
    position: relative;
    display: flex;
    align-items: flex-start;
    height: auto;
    margin-right: 0;
    padding: 11px 12px;
    border: 1px solid $line-strong;
    border-radius: $radius-sm;
    background: $bg-paper;
    white-space: normal;
    cursor: pointer;
    transition: border-color $transition-fast, background-color $transition-fast;

    &:hover {
      border-color: rgba($practice-primary, 0.45);
    }

    &:focus-within {
      border-color: rgba($practice-primary, 0.55);
      box-shadow: 0 0 0 3px rgba($practice-primary, 0.12);
    }

    &.is-checked {
      border-color: $practice-primary;
      background: $practice-soft;
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
      gap: 10px;
      padding: 0;
      margin: 0;
      width: 100%;
      font-size: 13px;
      line-height: 1.55;
      color: $text-secondary;
      white-space: normal;
    }

    &.is-checked :deep(.el-radio__label),
    &.is-checked :deep(.el-checkbox__label) {
      color: $text-primary;
      font-weight: 500;
    }
  }

  &__letter {
    flex-shrink: 0;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 20px;
    height: 20px;
    border: 1.5px solid $line-strong;
    border-radius: 50%;
    background: transparent;
    font-size: 11px;
    font-weight: 640;
    color: $text-secondary;
    transition: background-color $transition-fast, border-color $transition-fast, color $transition-fast;

    &--multi {
      border-radius: $radius-xs;
    }
  }

  &__option.is-checked .question-card__letter {
    border-color: $practice-primary;
    background: $practice-primary;
    color: #fff;
  }

  &__text {
    flex: 1;
    min-width: 0;
    word-break: break-word;
  }
}
</style>
