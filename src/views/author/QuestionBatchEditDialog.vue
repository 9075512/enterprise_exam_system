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
  set: (value) => emit('update:visible', value),
});

const form = reactive({
  /** 是否修改题目难度（v3.2；'' = 清除难度） */
  changeDifficulty: false,
  difficulty: '' as QuestionDifficulty | '',
});

const submitting = ref(false);

/** 每次打开重置表单 */
watch(
  () => props.visible,
  (visible) => {
    if (!visible) return;
    form.changeDifficulty = false;
    form.difficulty = '';
  },
);

/** 未勾选任何字段时提交按钮禁用 */
const canSubmit = computed<boolean>(
  () => form.changeDifficulty,
);

async function handleSubmit(): Promise<void> {
  if (!canSubmit.value) {
    ElMessage.warning('请至少选择一个要修改的字段');
    return;
  }
  const payload: QuestionBatchEditInput = { ids: [...props.questionIds] };
  if (form.changeDifficulty) payload.difficulty = form.difficulty || null;

  submitting.value = true;
  try {
    const { updated } = await questionsApi.batchEdit(payload);
    ElMessage.success(`已批量更新 ${updated} 道试题`);
    emit('saved');
    dialogVisible.value = false;
  } catch {
    // 错误提示已由 http.ts 响应拦截器统一弹出
  } finally {
    submitting.value = false;
  }
}

function handleCancel(): void {
  dialogVisible.value = false;
}
</script>

<template>
  <el-dialog
    v-model="dialogVisible"
    title="批量编辑试题"
    width="560px"
    top="8vh"
    append-to-body
    destroy-on-close
  >
    <p class="batch-tip">
      已选择 <strong>{{ questionIds.length }}</strong> 道试题；仅勾选的字段会被修改，其余字段保持原值。
    </p>

    <el-form label-position="top">
      <el-form-item>
        <el-checkbox v-model="form.changeDifficulty">修改难度</el-checkbox>
        <el-select
          v-model="form.difficulty"
          clearable
          :disabled="!form.changeDifficulty"
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
      </el-form-item>
    </el-form>

    <template #footer>
      <el-button @click="handleCancel">取消</el-button>
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

.batch-select {
  width: 100%;
}

</style>
