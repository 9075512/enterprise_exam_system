<script setup lang="ts">
/**
 * 试题批量编辑弹窗。
 * 题库管理不再维护知识点与默认分值，这里仅保留难度批量调整。
 */
import { computed, reactive, ref, watch } from 'vue';
import { ElMessage } from 'element-plus';
import * as questionsApi from '@/api/questions';
import { QUESTION_DIFFICULTY_OPTIONS } from '@/constants';
import type { QuestionBatchEditInput, QuestionDifficulty } from '@/types';

const props = defineProps<{
  visible: boolean;
  /** 待编辑的题目 id 列表 */
  questionIds: string[];
}>();

const emit = defineEmits<{
  (e: 'update:visible', value: boolean): void;
  (e: 'saved'): void;
}>();

const dialogVisible = computed<boolean>({
  get: () => props.visible,
  set: (value) => { if (!value && submitting.value) return; emit('update:visible', value); },
});

const form = reactive({
  /** 是否修改题目难度（v3.2；'' = 清除难度） */
  changeDifficulty: false,
  difficulty: '' as QuestionDifficulty | '',
});

const submitting = ref(false);
const submitError = ref('');

/** 每次打开重置表单 */
watch(
  () => props.visible,
  (visible) => {
    if (!visible) return;
    submitError.value = '';
    form.changeDifficulty = false;
    form.difficulty = '';
  },
  { immediate: true },
);

/** 未勾选任何字段时提交按钮禁用 */
const canSubmit = computed<boolean>(
  () => form.changeDifficulty && props.questionIds.length > 0,
);

async function handleSubmit(): Promise<void> {
  if (submitting.value) return;
  if (!canSubmit.value) {
    ElMessage.warning('请至少选择一个要修改的字段');
    return;
  }
  const payload: QuestionBatchEditInput = { ids: [...props.questionIds] };
  if (form.changeDifficulty) payload.difficulty = form.difficulty || null;

  submitError.value = '';
  submitting.value = true;
  try {
    const { updated } = await questionsApi.batchEdit(payload);
    ElMessage.success(`已批量更新 ${updated} 道试题`);
    emit('saved');
    emit('update:visible', false);
  } catch {
    submitError.value = '批量修改失败，已保留所选题目和难度设置，请重试。';
  } finally {
    submitting.value = false;
  }
}

function handleCancel(): void {
  dialogVisible.value = false;
}
</script>

<template>
  <el-dialog class="bank-workflow-dialog"
    v-model="dialogVisible"
    title="批量编辑试题"
    width="560px"
    top="8vh"
    append-to-body
    destroy-on-close
    :close-on-click-modal="!submitting"
    :close-on-press-escape="!submitting"
    :show-close="!submitting"
  >
    <p class="batch-tip">
      已选择 <strong>{{ questionIds.length }}</strong> 道试题；仅勾选的字段会被修改，其余字段保持原值。
    </p>

    <el-alert v-if="submitError" :title="submitError" type="error" show-icon :closable="false" class="batch-error" />
    <el-form label-position="top" :disabled="submitting">
      <el-form-item>
        <el-checkbox v-model="form.changeDifficulty">修改难度</el-checkbox>
        <el-select
          v-model="form.difficulty"
          aria-label="试题难度"
          clearable
          :disabled="submitting || !form.changeDifficulty"
          placeholder="不设置（清空难度）"
          class="batch-select"
        >
          <el-option
            v-for="opt in QUESTION_DIFFICULTY_OPTIONS"
            :key="opt.value"
            :label="opt.label"
            :value="opt.value"
          />
        </el-select>
        <p v-if="form.changeDifficulty && !form.difficulty" class="batch-clear">确认后将清除所选 {{ questionIds.length }} 道试题的难度设置。</p>
      </el-form-item>
    </el-form>

    <template #footer>
      <el-button :disabled="submitting" @click="handleCancel">取消</el-button>
      <el-button type="primary" :loading="submitting" :disabled="!canSubmit" @click="handleSubmit">
        确认修改
      </el-button>
    </template>
  </el-dialog>
</template>

<style scoped lang="scss">
@use '@/styles/variables.scss' as *;

.batch-tip {
  margin: 0 0 12px;
  font-size: 13px;
  color: $text-secondary;
}

.batch-error { margin-bottom: 16px; overflow-wrap: anywhere; }
.batch-clear { margin: 8px 0 0; color: $text-secondary; font-size: 13px; line-height: 1.7; }
.batch-select {
  width: 100%;
}

</style>
