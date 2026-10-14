<script setup lang="ts">
/**
 * 练题反馈区（提交单题后即时展示）：正误标识 + 正确答案 + 用户作答 + 解析。
 * 由作答页在 `QuestionCard` 下方渲染（**不改动 QuestionCard 内部**）。
 * 视觉：v3.1 方向 C —— 语义浅底 + 深字（三件套），去左缘强调条与浮层阴影。
 */
import { computed } from 'vue';
import type { PracticeCheckResult } from '@/types';

const props = defineProps<{
  /** 后端判分结果 */
  result: PracticeCheckResult;
  /** 用户本次作答（选项索引数组） */
  selected: number[];
}>();

/** 选项索引 → 字母 */
function lettersOf(indexes: number[]): string {
  return [...indexes]
    .sort((a, b) => a - b)
    .map((i) => String.fromCharCode(65 + i))
    .join('、');
}

const correctLetters = computed<string>(() => lettersOf(props.result.correctAnswer));
const selectedLetters = computed<string>(() => (props.selected.length ? lettersOf(props.selected) : '（未作答）'));

/** 答案 / 解析可见性（v1.9⑤：后台可关闭；旧响应无该字段时按可见处理） */
const answerVisible = computed<boolean>(() => props.result.answerVisible !== false);
const analysisVisible = computed<boolean>(() => props.result.analysisVisible !== false);
</script>

<template>
  <div class="feedback" :class="result.correct ? 'feedback--ok' : 'feedback--err'">
    <div class="feedback__head">
      <span class="feedback__icon">{{ result.correct ? '✓' : '✕' }}</span>
      <span class="feedback__title">{{ result.correct ? '回答正确' : '回答错误' }}</span>
      <span class="feedback__badge">已判分</span>
    </div>

    <div class="feedback__rows">
      <div v-if="answerVisible" class="feedback__row">
        <span class="feedback__label">正确答案</span>
        <span class="feedback__value feedback__value--answer">{{ correctLetters }}</span>
      </div>
      <div v-else class="feedback__row">
        <span class="feedback__label">正确答案</span>
        <span class="feedback__value feedback__value--muted">已隐藏（后台关闭了答案展示）</span>
      </div>

      <div class="feedback__row">
        <span class="feedback__label">你的作答</span>
        <span class="feedback__value">{{ selectedLetters }}</span>
      </div>
    </div>

    <div v-if="analysisVisible" class="feedback__analysis">
      <div class="feedback__analysis-head">解析</div>
      <p class="feedback__analysis-text">{{ result.analysis || '暂无解析' }}</p>
    </div>
    <div v-else class="feedback__analysis feedback__analysis--muted">
      <div class="feedback__analysis-head">解析</div>
      <p class="feedback__analysis-text">已隐藏（后台关闭了解析展示）</p>
    </div>
  </div>
</template>

<style scoped lang="scss">
@use '@/styles/variables.scss' as *;

.feedback {
  margin-top: 12px;
  padding: 12px 13px;
  border-radius: $radius-sm;
  border: 1px solid transparent;
  background: $bg-paper;
  animation: feedback-in 0.2s ease-out;

  /* 语义浅底 + 描边（原色仅作图形，文字一律用 -text 档） */
  &--ok {
    background: $color-success-bg;
    border-color: $color-success-border;
  }

  &--err {
    background: $color-error-bg;
    border-color: $color-error-border;
  }

  &__head {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 11px;
  }

  &__icon {
    flex: 0 0 auto;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 20px;
    height: 20px;
    border-radius: 50%;
    color: #fff;
    font-size: 12px;
    font-weight: 700;
    line-height: 1;
  }

  &--ok &__icon {
    background: $color-success;
  }

  &--err &__icon {
    background: $color-error;
  }

  &__title {
    font-size: 13px;
    font-weight: 640;
  }

  &--ok &__title {
    color: $color-success-text;
  }

  &--err &__title {
    color: $color-error-text;
  }

  &__badge {
    margin-left: auto;
    font-size: 11px;
    color: $text-disabled;
  }

  &__rows {
    display: flex;
    flex-direction: column;
    gap: 7px;
  }

  &__row {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  &__label {
    flex: 0 0 auto;
    font-size: 12px;
    color: $text-secondary;
  }

  &__value {
    font-size: 13.5px;
    font-weight: 640;
    color: $text-primary;
    letter-spacing: 0.5px;

    &--answer {
      color: $color-success-text;
      letter-spacing: 1.5px;
    }

    &--muted {
      font-weight: 400;
      color: $text-secondary;
    }
  }

  /* 解析：虚线分隔代替灰块，随卡片语义色走 */
  &__analysis {
    margin-top: 11px;
    padding-top: 11px;
    border-top: 1px dashed;
  }

  &--ok &__analysis {
    border-top-color: $color-success-border;
  }

  &--err &__analysis {
    border-top-color: $color-error-border;
  }

  &__analysis-head {
    margin-bottom: 5px;
    font-size: 12px;
    font-weight: 640;
    color: $text-secondary;
  }

  &__analysis-text {
    margin: 0;
    font-size: 13px;
    line-height: 1.75;
    color: $text-primary;
    word-break: break-word;
  }

  &__analysis--muted {
    border-top-color: $border-color;

    .feedback__analysis-text {
      color: $text-secondary;
    }
  }
}

@keyframes feedback-in {
  from {
    opacity: 0;
    transform: translateY(4px);
  }

  to {
    opacity: 1;
    transform: translateY(0);
  }
}
</style>
