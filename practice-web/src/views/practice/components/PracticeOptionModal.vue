<script setup lang="ts">
/**
 * 选练题方式弹层：顺序/随机 · 题量 · 题型。
 * 打开时按题库重置为默认值（顺序 + 全部题 + 全选题型）。
 * 视觉：冷静蓝 · 商务风（小圆角、细边框、实色主按钮、无渐变）。
 */
import { computed, ref, watch } from 'vue';
import type { PracticeBank, PracticeMode, PracticeSessionInput, QuestionType } from '@/types';

const props = defineProps<{
  visible: boolean;
  bank: PracticeBank;
}>();

const emit = defineEmits<{
  (e: 'update:visible', value: boolean): void;
  (e: 'start', payload: PracticeSessionInput): void;
}>();

const innerVisible = computed<boolean>({
  get: () => props.visible,
  set: (value) => emit('update:visible', value),
});

/** 练题方式 */
const mode = ref<PracticeMode>('sequence');
/** 题量：'all' 或具体数字 */
const countMode = ref<'all' | number>('all');
/** 题型（默认全选） */
const types = ref<QuestionType[]>(['single', 'multiple', 'judge']);

/** 每次打开重置默认值 */
watch(
  () => props.visible,
  (visible) => {
    if (!visible) return;
    mode.value = 'sequence';
    countMode.value = 'all';
    types.value = ['single', 'multiple', 'judge'];
  },
);

/** 该题库是否有题可练 */
const hasQuestions = computed<boolean>(() => props.bank.questionCount > 0);

/** 开始练习：组装入参并通知父组件 */
function confirm(): void {
  if (!hasQuestions.value || types.value.length === 0) return;
  emit('start', {
    bankId: props.bank.id,
    mode: mode.value,
    count: countMode.value === 'all' ? undefined : countMode.value,
    types: [...types.value],
  });
  innerVisible.value = false;
}
</script>

<template>
  <el-dialog
    v-model="innerVisible"
    :title="`${bank.name} · 开始练习`"
    width="92%"
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
          <el-radio value="all">全部（{{ bank.questionCount }} 题）</el-radio>
          <el-radio :value="10">10 题</el-radio>
          <el-radio :value="20">20 题</el-radio>
          <el-radio :value="50">50 题</el-radio>
        </el-radio-group>
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
  border-bottom: 1px solid $border-soft;
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
  border-top: 1px solid $border-soft;

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
  }

  &__label {
    position: relative;
    margin-bottom: 12px;
    padding-left: 10px;
    font-size: 14px;
    font-weight: 700;
    color: $text-primary;

    &::before {
      content: '';
      position: absolute;
      top: 50%;
      left: 0;
      width: 3px;
      height: 13px;
      margin-top: -6.5px;
      border-radius: 2px;
      background: $practice-primary;
    }
  }

  &__choices {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
  }

  &__empty {
    margin: 0;
    font-size: 13px;
    color: $color-warning;
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
    border: 1px solid $practice-border;
    border-radius: $practice-radius-sm;
    background: #fff;
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
