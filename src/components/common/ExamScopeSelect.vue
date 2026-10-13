<script setup lang="ts">
/**
 * 考试范围选择器（v1.9④）。
 *
 * 供补考管理 / 成绩复核 / 人工阅卷等「考务队列」页按考试收窄范围，
 * 使这些队列真正「对应到每一场考试」。选中值与路由 `?examId=` 绑定（见 `useExamScope`）。
 *
 * 降级：`GET /api/exams` 仅 admin 可用；author 打开人工阅卷时列表拉取失败，
 * 此时选择器置灰但**不隐藏**——URL 上已带的 `examId` 仍然生效（后端按考试过滤）。
 */
import { computed, onMounted, ref } from 'vue';
import { list as listExams } from '@/api/exams';
import type { Exam } from '@/types';

const props = defineProps<{
  /** 当前选中的考试 id（空串 = 全部考试） */
  modelValue: string;
  /** 左侧标签文案 */
  label?: string;
}>();

const emit = defineEmits<{ 'update:modelValue': [value: string] }>();

const exams = ref<Exam[]>([]);
const loading = ref(false);
/** 拉取失败（如 author 无权限）→ 置灰 */
const unavailable = ref(false);

const inner = computed<string>({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v ?? ''),
});

onMounted(async () => {
  loading.value = true;
  try {
    exams.value = await listExams();
  } catch {
    exams.value = [];
    unavailable.value = true;
  } finally {
    loading.value = false;
  }
});
</script>

<template>
  <div class="exam-scope">
    <span class="exam-scope__label">{{ label ?? '考试范围' }}</span>
    <el-select
      v-model="inner"
      class="exam-scope__select"
      filterable
      clearable
      :loading="loading"
      :disabled="unavailable"
      :placeholder="unavailable ? '需管理员权限' : '全部考试'"
    >
      <el-option v-for="e in exams" :key="e.id" :label="e.name" :value="e.id" />
    </el-select>
  </div>
</template>

<style scoped lang="scss">
@use '@/styles/variables.scss' as *;

.exam-scope {
  display: inline-flex;
  align-items: center;
  gap: 8px;

  &__label {
    font-size: 13px;
    font-weight: 600;
    color: $text-secondary;
  }

  &__select {
    width: 240px;
  }
}
</style>
