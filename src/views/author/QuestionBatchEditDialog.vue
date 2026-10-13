<script setup lang="ts">
/**
 * 试题批量编辑弹窗（v1.7②）。
 * - 仅提交被勾选的字段（科目 / 知识点标签 / 默认分值），未勾选字段后端保持原值；
 * - 标签支持「追加」与「覆盖」两种模式；
 * - 标签候选来自当前题库已有标签，可自由输入创建。
 */
import { computed, reactive, ref, watch } from 'vue';
import { ElMessage } from 'element-plus';
import * as questionsApi from '@/api/questions';
import type { QuestionBatchEditInput } from '@/types';

const props = defineProps<{
  visible: boolean;
  /** 待编辑的题目 id 列表 */
  questionIds: string[];
  /** 当前题库 id（用于加载标签候选） */
  bankId: string;
}>();

const emit = defineEmits<{
  (e: 'update:visible', value: boolean): void;
  (e: 'saved'): void;
}>();

const dialogVisible = computed<boolean>({
  get: () => props.visible,
  set: (value) => emit('update:visible', value),
});

/** 知识点标签上限（与后端 MAX_TAGS 一致） */
const MAX_TAGS = 10;

const form = reactive({
  /** 是否修改科目 */
  changeSubject: false,
  subject: '',
  /** 是否修改知识点标签 */
  changeTags: false,
  tags: [] as string[],
  tagsMode: 'append' as 'append' | 'replace',
  /** 是否修改默认分值 */
  changeScore: false,
  defaultScore: 10,
});

const submitting = ref(false);
const tagOptions = ref<string[]>([]);

async function loadTagOptions(): Promise<void> {
  try {
    tagOptions.value = await questionsApi.tags(props.bankId ? [props.bankId] : undefined);
  } catch {
    tagOptions.value = [];
  }
}

/** 每次打开重置表单 */
watch(
  () => props.visible,
  (visible) => {
    if (!visible) return;
    form.changeSubject = false;
    form.subject = '';
    form.changeTags = false;
    form.tags = [];
    form.tagsMode = 'append';
    form.changeScore = false;
    form.defaultScore = 10;
    void loadTagOptions();
  },
);

/** 未勾选任何字段时提交按钮禁用 */
const canSubmit = computed<boolean>(
  () => form.changeSubject || form.changeTags || form.changeScore,
);

async function handleSubmit(): Promise<void> {
  if (!canSubmit.value) {
    ElMessage.warning('请至少选择一个要修改的字段');
    return;
  }
  if (form.changeTags && form.tags.filter((t) => t.trim()).length === 0) {
    ElMessage.warning('请填写至少一个知识点标签');
    return;
  }

  const payload: QuestionBatchEditInput = { ids: [...props.questionIds] };
  if (form.changeSubject) payload.subject = form.subject.trim();
  if (form.changeTags) {
    payload.tags = form.tags.map((t) => t.trim()).filter(Boolean).slice(0, MAX_TAGS);
    payload.tagsMode = form.tagsMode;
  }
  if (form.changeScore) payload.defaultScore = form.defaultScore;

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
        <el-checkbox v-model="form.changeSubject">修改科目</el-checkbox>
        <el-input
          v-model="form.subject"
          :disabled="!form.changeSubject"
          placeholder="留空将写入「未分类」"
        />
      </el-form-item>

      <el-form-item>
        <el-checkbox v-model="form.changeTags">修改知识点标签</el-checkbox>
        <el-select
          v-model="form.tags"
          multiple
          filterable
          allow-create
          default-first-option
          :multiple-limit="MAX_TAGS"
          :disabled="!form.changeTags"
          placeholder="选择或输入知识点标签（回车创建）"
          class="batch-select"
        >
          <el-option v-for="tag in tagOptions" :key="tag" :label="tag" :value="tag" />
        </el-select>
        <el-radio-group v-model="form.tagsMode" :disabled="!form.changeTags" class="batch-mode">
          <el-radio value="append">追加到原标签</el-radio>
          <el-radio value="replace">覆盖原标签</el-radio>
        </el-radio-group>
      </el-form-item>

      <el-form-item>
        <el-checkbox v-model="form.changeScore">修改默认分值</el-checkbox>
        <el-input-number
          v-model="form.defaultScore"
          :min="0.5"
          :max="100"
          :step="0.5"
          :disabled="!form.changeScore"
        />
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

.batch-mode {
  margin-top: 8px;
}
</style>
