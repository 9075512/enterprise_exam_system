<script setup lang="ts">
/**
 * 选练题方式弹层：顺序/随机 · 题量 · 题型。
 * 打开时按题库重置为默认值（顺序 + 全部题 + 全选题型）。
 * 视觉：冷静蓝 · 商务风（小圆角、细边框、实色主按钮、无渐变）。
 */
import { computed, ref, watch } from 'vue';
import type { PracticeBank, PracticeConfig, PracticeMode, PracticeSessionInput, QuestionType } from '@/types';

const props = defineProps<{
  visible: boolean;
  bank: PracticeBank;
  /** 练题端公开配置（v1.9⑤）：默认模式与单次题量范围 */
  config: PracticeConfig;
}>();

const emit = defineEmits<{
  (e: 'update:visible', value: boolean): void;
  (e: 'start', payload: PracticeSessionInput): void;
}>();

const innerVisible = computed<boolean>({
  get: () => props.visible,
  set: (value) => emit('update:visible', value),
});

/** 练题方式（默认取后台配置） */
const mode = ref<PracticeMode>('sequence');
/** 题量：'all' 或具体数字 */
const countMode = ref<'all' | number>('all');
/** 题型（默认全选） */
const types = ref<QuestionType[]>(['single', 'multiple', 'judge']);

/** 每次打开重置默认值（练题方式取后台默认，题量取「全部」） */
watch(
  () => props.visible,
  (visible) => {
    if (!visible) return;
    mode.value = props.config.defaultPracticeMode;
    countMode.value = 'all';
    types.value = ['single', 'multiple', 'judge'];
  },
);

/** 该题库是否有题可练 */
const hasQuestions = computed<boolean>(() => props.bank.questionCount > 0);

/** 「全部」实际可练题量（受后台单次题量上限约束） */
const allCount = computed<number>(() =>
  Math.min(props.bank.questionCount, Math.max(1, props.config.sessionMaxCount)),
);

/** 快捷题量选项：落在 [下限, 上限] 且小于题库总题量（避免与「全部」重复） */
const countOptions = computed<number[]>(() =>
  [10, 20, 50, 100].filter(
    (v) => v >= props.config.sessionMinCount && v <= props.config.sessionMaxCount && v < props.bank.questionCount,
  ),
);

/** 开始练习：组装入参并通知父组件 */
function confirm(): void {
  if (!hasQuestions.value || types.value.length === 0) return;
  emit('start', {
    bankId: props.bank.id,
    mode: mode.value,
    count: countMode.value === 'all' ? allCount.value : countMode.value,
    types: [...types.value],
  });
  innerVisible.value = false;
}
</script>

<template>
  <el-dialog
    v-model="innerVisible"
    :title="`${bank.name} · 开始练习`"
    width="560px"
    align-center
    append-to-body
    class="opt-dialog"
  >
    <div class="opt">
      <div class="opt__group">
        <div class="opt__label">练题方式</div>
        <el-radio-group v-model="mode" class="opt__choices">
          <el-radio value="sequence">顺序</el-radio>
          <el-radio value="random">随机</el-radio>
        </el-radio-group>
      </div>

      <div class="opt__group">
        <div class="opt__label">题量</div>
        <el-radio-group v-model="countMode" class="opt__choices">
          <el-radio value="all">全部（{{ allCount }} 题）</el-radio>
          <el-radio v-for="n in countOptions" :key="n" :value="n">{{ n }} 题</el-radio>
        </el-radio-group>
        <p v-if="countOptions.length === 0" class="opt__tip">
          该题库题量未超过单次上限，默认一次练完（上限 {{ config.sessionMaxCount }} 题）
        </p>
      </div>

      <div class="opt__group">
        <div class="opt__label">题型</div>
        <el-checkbox-group v-model="types" class="opt__choices">
          <el-checkbox value="single">单选</el-checkbox>
          <el-checkbox value="multiple">多选</el-checkbox>
          <el-checkbox value="judge">判断</el-checkbox>
        </el-checkbox-group>
      </div>

      <p v-if="!hasQuestions" class="opt__empty">该题库暂无试题，无法开始练习</p>
    </div>

    <template #footer>
      <el-button @click="innerVisible = false">取消</el-button>
      <el-button type="primary" :disabled="!hasQuestions || types.length === 0" @click="confirm">开始</el-button>
    </template>
  </el-dialog>
</template>

<style scoped lang="scss">
@use '@/styles/variables.scss' as *;

/* 弹层外观（移动端小圆角 + 分区细边框） */
:deep(.el-dialog) {
  border-radius: $practice-radius;
  overflow: hidden;
}

:deep(.el-dialog__header) {
  margin-right: 0;
  padding: 16px 18px 12px;
  border-bottom: 1px solid $border-color;
}

:deep(.el-dialog__title) {
  font-size: 15px;
  font-weight: 700;
  color: $text-primary;
}

:deep(.el-dialog__body) {
  padding: 16px 18px 6px;
}

:deep(.el-dialog__footer) {
  padding: 14px 18px 16px;
  border-top: 1px solid $border-color;

  .el-button {
    min-height: 40px;
    padding: 0 22px;
    font-weight: 600;
    border-radius: $practice-radius-sm;
  }

  .el-button--primary {
    border: none;
    background: $practice-primary;

    &:hover,
    &:active {
      background: $practice-primary-dark;
    }
  }
}

.opt {
  &__group {
    margin-bottom: 20px;

    &:last-child {
      margin-bottom: 0;
    }
  }

  &__label {
    margin-bottom: 12px;
    font-size: 13.5px;
    font-weight: 640;
    color: $text-primary;
  }

  &__choices {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
  }

  &__empty {
    margin: 0;
    font-size: 13px;
    // v2.2：原为 $color-warning（对白底 2.15:1，不达 AA），改 700 档文本色
    color: $color-warning-text;
  }

  &__tip {
    margin: 8px 0 0;
    font-size: 12px;
    line-height: 1.5;
    color: $text-secondary;
  }

  /* 选项做成可点选卡片（移动端触控区 ≥42px） */
  :deep(.el-radio),
  :deep(.el-checkbox) {
    display: inline-flex;
    align-items: center;
    height: auto;
    min-height: 42px;
    margin: 0;
    padding: 0 14px;
    border: 1px solid $line-strong;
    border-radius: $practice-radius-sm;
    background: $bg-paper;
    transition: border-color $transition-fast, background-color $transition-fast;
  }

  :deep(.el-radio.is-checked),
  :deep(.el-checkbox.is-checked) {
    border-color: $practice-primary;
    background: $practice-soft;
  }

  :deep(.el-radio__label),
  :deep(.el-checkbox__label) {
    padding-left: 7px;
    font-size: 14px;
    color: $text-primary;
  }
}
</style>
