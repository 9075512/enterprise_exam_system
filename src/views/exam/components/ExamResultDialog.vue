<script setup lang="ts">
import { computed } from 'vue';
import { formatScore } from '@/utils/format';
import type { ExamRecord } from '@/types';

const visible = defineModel<boolean>({ default: false });
const props = defineProps<{
  result: ExamRecord | null;
  examName: string;
  passScore?: number;
}>();
defineEmits<{ back: []; detail: [] }>();

const pending = computed(() => props.result?.status === 'pending_review');
const passed = computed(() => !pending.value && props.result && props.passScore !== undefined
  ? props.result.score >= props.passScore : null);
const status = computed(() => pending.value ? '待阅卷' : passed.value === null ? '已交卷' : passed.value ? '及格' : '未及格');
const tone = computed(() => pending.value ? 'warning' : passed.value === null ? 'info' : passed.value ? 'success' : 'danger');
</script>

<template>
  <el-dialog v-model="visible" title="考试结果" width="480px" align-center append-to-body
    :close-on-click-modal="false" class="exam-result">
    <div v-if="result" class="exam-result__content" aria-live="polite">
      <p class="exam-result__name">{{ examName }}</p>
      <el-tag :type="tone" effect="light" round>{{ status }}</el-tag>
      <p class="exam-result__label">{{ pending ? '当前已判分' : '考试得分' }}</p>
      <div class="exam-result__score" :class="`is-${tone}`">
        <strong>{{ formatScore(result.score) }}</strong>
        <span>/ {{ formatScore(result.paperSnapshot.totalScore) }} 分</span>
      </div>
      <p v-if="passScore !== undefined" class="exam-result__threshold">及格线 {{ formatScore(passScore) }} 分</p>
      <div class="exam-result__notice">
        <strong>{{ result.autoSubmitted ? '系统已自动交卷' : '交卷成功' }}</strong>
        <p>{{ pending ? '本卷含待阅主观题，当前分数不是最终成绩。阅卷完成后可在「我的成绩」查看结果。' : '答卷已提交，可查看成绩明细及逐题解析。' }}</p>
      </div>
    </div>
    <template #footer>
      <el-button @click="$emit('back')">返回我的考试</el-button>
      <el-button type="primary" @click="$emit('detail')">查看成绩明细</el-button>
    </template>
  </el-dialog>
</template>

<style scoped lang="scss">
@use '@/styles/variables.scss' as *;
.exam-result {
  &__content { text-align: center; }
  &__name { margin: 0 0 12px; color: $text-primary; font-size: 15px; font-weight: 600; overflow-wrap: anywhere; }
  &__label { margin: 20px 0 8px; color: $text-secondary; font-size: 13px; }
  &__score {
    display: flex; align-items: baseline; justify-content: center; flex-wrap: wrap; gap: 8px;
    strong { font-size: 48px; line-height: 1.1; font-variant-numeric: tabular-nums; color: $color-primary; }
    span { color: $text-secondary; }
    &.is-success strong { color: $color-success-text; }
    &.is-danger strong { color: $color-error-text; }
    &.is-warning strong { color: $color-warning-text; }
  }
  &__threshold { margin: 10px 0 20px; font-size: 13px; color: $text-secondary; }
  &__notice {
    margin-top: 20px; padding: 12px 16px; text-align: left; border-radius: $radius-sm; background: $bg-page;
    strong { font-size: 13px; color: $text-primary; }
    p { margin: 6px 0 0; font-size: 13px; line-height: 1.7; color: $text-secondary; }
  }
}
@media (max-width: 480px) {
  :global(.exam-result .el-dialog__footer .el-button) { flex: 1 1 140px; }
}
</style>
