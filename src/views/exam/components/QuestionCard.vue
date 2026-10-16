<script setup lang="ts">
/**
 * 单题作答卡片（W3-T1）。考试中不显示正确答案。
 * 单选/判断 → 单选；多选 → 复选（提交前升序）。
 * 填空 → 逐空文本输入（空数由题干 ___ 推断，回退参考答案长度）；简答 → 富文本编辑器（v1.7③，支持图片）。
 *
 * v3.1 方向 C（设计稿 p-exam-taking `.opt`）：
 * 题号改为 22px 主色实底方块（不再用「第 N 题」胶囊），题型与分值并作一行弱色小字；
 * 选项行改「21px 圆形字母 + 发丝线描边」，选中态用主色浅底 + 主色描边表达，
 * 不再有上浮/投影/光圈；题型着色一律取消（分类色不外溢到作答区）。
 * 原生控件视觉隐藏但保留可点击与键盘可达性。
 */
import { computed } from 'vue';
import { QUESTION_TYPE_LABELS } from '@/constants';
import { useSettingsStore } from '@/stores/settings';
import RichTextEditor from '@/components/common/RichTextEditor.vue';
import type { Question } from '@/types';

const props = defineProps<{
  /** 从 0 开始的题号 */
  index: number;
  question: Question;
  score: number;
  modelValue: number[] | string[];
}>();

const emit = defineEmits<{ (e: 'update:modelValue', value: number[] | string[]): void }>();

const settingsStore = useSettingsStore();

/** 图片作答上限（与后端设置一致，服务端仍会二次校验，v1.8④ U4） */
const maxImages = computed<number>(() => settingsStore.settings.richTextImageMaxCount);
const maxImageBytes = computed<number>(() => settingsStore.settings.richTextImageMaxMb * 1024 * 1024);

const isMultiple = computed<boolean>(() => props.question.type === 'multiple');
const isFill = computed<boolean>(() => props.question.type === 'fill');
const isShort = computed<boolean>(() => props.question.type === 'short');

function letter(i: number): string {
  return String.fromCharCode(65 + i);
}

/** 填空空数：优先数题干中的 ___，回退到参考答案长度。 */
const fillBlankCount = computed<number>(() => {
  const matches = props.question.stem.match(/_{3,}/g);
  const fromStem = matches ? matches.length : 0;
  return fromStem > 0 ? fromStem : (props.question.answer as string[]).length;
});

const radioValue = computed<number | undefined>({
  get: () => props.modelValue[0] as number | undefined,
  set: (value) => emit('update:modelValue', value === undefined ? [] : [value]),
});

const checkboxValue = computed<number[]>({
  get: () => props.modelValue as number[],
  set: (value) => emit('update:modelValue', [...value].sort((a, b) => a - b)),
});

/** 填空逐空文本（长度对齐空数） */
const fillValue = computed<string[]>({
  get: () => {
    const arr = Array.isArray(props.modelValue) ? (props.modelValue as string[]) : [];
    return Array.from({ length: fillBlankCount.value }, (_, i) => arr[i] ?? '');
  },
  set: (value) => emit('update:modelValue', value),
});

/** 简答单行文本（存储为长度 1 的数组） */
const shortValue = computed<string>({
  get: () => (Array.isArray(props.modelValue) ? ((props.modelValue[0] as string) ?? '') : ''),
  set: (value) => emit('update:modelValue', [value]),
});
</script>

<template>
  <div class="question-card">
    <div class="question-card__head">
      <span class="question-card__no">{{ index + 1 }}</span>
      <span class="question-card__meta">
        {{ QUESTION_TYPE_LABELS[question.type] }}<template v-if="score"> · {{ score }} 分</template>
      </span>
    </div>

    <p class="question-card__stem">{{ question.stem }}</p>

    <!-- 单选 / 判断 -->
    <el-radio-group
      v-if="question.type === 'single' || question.type === 'judge'"
      v-model="radioValue"
      class="question-card__options"
    >
      <el-radio v-for="(option, i) in question.options" :key="i" :value="i" class="question-card__option">
        <span class="question-card__letter">{{ letter(i) }}</span>
        <span class="question-card__text">{{ option }}</span>
      </el-radio>
    </el-radio-group>

    <!-- 多选 -->
    <el-checkbox-group v-else-if="isMultiple" v-model="checkboxValue" class="question-card__options">
      <el-checkbox v-for="(option, i) in question.options" :key="i" :value="i" class="question-card__option">
        <span class="question-card__letter">{{ letter(i) }}</span>
        <span class="question-card__text">{{ option }}</span>
      </el-checkbox>
    </el-checkbox-group>

    <!-- 填空 -->
    <div v-else-if="isFill" class="question-card__fills">
      <div v-for="(_, i) in fillValue" :key="i" class="question-card__fill">
        <span class="question-card__fill-no">第 {{ i + 1 }} 空</span>
        <el-input v-model="fillValue[i]" placeholder="请输入答案" />
      </div>
    </div>

    <!-- 简答（v1.7③ S1：富文本 + 图片作答；v1.8④ U4：图片走服务端对象存储） -->
    <RichTextEditor
      v-else-if="isShort"
      v-model="shortValue"
      placeholder="请输入你的答案（支持加粗、列表与粘贴/插入图片）"
      :max-images="maxImages"
      :max-image-bytes="maxImageBytes"
    />
  </div>
</template>

<style scoped lang="scss">
@use '@/styles/variables.scss' as *;

.question-card {
  padding: 20px;
  background: $bg-paper;
  border: 1px solid $border-color;
  border-radius: $radius-base;

  &__head {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
    margin-bottom: 12px;
  }

  /* 题号：22px 主色实底方块（设计稿 p-exam-taking 的 b） */
  &__no {
    display: inline-grid;
    place-items: center;
    min-width: 22px;
    padding: 0 4px;
    flex-shrink: 0;
    height: 22px;
    border-radius: $radius-sm;
    background: $color-primary;
    font-size: 11.5px;
    font-weight: 700;
    color: #fff;
    font-variant-numeric: tabular-nums;
  }

  &__meta {
    font-size: 11px;
    font-weight: 600;
    color: $text-secondary;
  }

  &__stem {
    margin: 0 0 16px;
    font-size: 14.5px;
    font-weight: 520;
    line-height: 1.75;
    color: $text-primary;
  }

  &__options {
    display: flex;
    flex-direction: column;
    align-items: stretch;
    gap: 8px;
  }

  /* 选项行（设计稿 .opt）：发丝线描边 + 无投影，选中改浅底 + 主色描边 */
  &__option {
    position: relative;
    display: flex;
    align-items: flex-start;
    height: auto;
    margin-right: 0;
    padding: 12px 14px;
    border: 1px solid $line-strong;
    border-radius: $radius-sm;
    background: $bg-paper;
    white-space: normal;
    cursor: pointer;
    transition: border-color $transition-fast, background-color $transition-fast;

    &:hover {
      border-color: $color-primary-border;
      background: $color-primary-soft;
    }

    &.is-checked {
      border-color: $color-primary;
      background: $color-primary-soft;
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
      gap: 11px;
      padding: 0;
      margin: 0;
      width: 100%;
      font-size: 13px;
      line-height: 1.6;
      color: $text-secondary;
      white-space: normal;
    }

    &.is-checked :deep(.el-radio__label),
    &.is-checked :deep(.el-checkbox__label) {
      color: $text-primary;
      font-weight: 550;
    }
  }

  &__letter {
    flex-shrink: 0;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 21px;
    height: 21px;
    border: 1.5px solid $line-strong;
    border-radius: 50%;
    background: $bg-paper;
    font-size: 11px;
    font-weight: 700;
    color: $text-secondary;
    transition: background-color $transition-fast, border-color $transition-fast, color $transition-fast;
  }

  &__option.is-checked .question-card__letter {
    border-color: $color-primary;
    background: $color-primary;
    color: #fff;
  }

  &__text {
    flex: 1;
    min-width: 0;
    word-break: break-word;
  }

  &__fills {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  &__fill {
    display: flex;
    align-items: center;
    gap: 12px;

    .el-input {
      max-width: 360px;
    }
  }

  &__fill-no {
    flex: 0 0 52px;
    font-size: 13px;
    font-weight: 600;
    color: $text-secondary;
  }
}
</style>
