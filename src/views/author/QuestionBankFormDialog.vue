<script setup lang="ts">
/**
 * 题库新建 / 编辑弹窗（W3-T3）。
 * - v-model:visible 控制显隐；bank 有值 = 编辑，无值 = 新建。
 * - 校验：name 必填 ≤120、category 必填（默认「未分类」）、description 选填 ≤255。
 * - 错误提示统一由 http.ts 响应拦截器弹出，本组件仅 try/catch 阻止后续流程。
 */
import { computed, reactive, ref, watch } from 'vue';
import { ElMessage, type FormInstance, type FormRules } from 'element-plus';
import * as banksApi from '@/api/banks';
import { BANK_CATEGORY_DEFAULT } from '@/constants';
import type { QuestionBank } from '@/types';

const props = defineProps<{
  visible: boolean;
  /** 传入即为编辑模式 */
  bank?: QuestionBank | null;
}>();

const emit = defineEmits<{
  (e: 'update:visible', value: boolean): void;
  (e: 'saved'): void;
}>();

const dialogVisible = computed<boolean>({
  get: () => props.visible,
  set: (value) => emit('update:visible', value),
});

const isEdit = computed<boolean>(() => Boolean(props.bank?.id));

const formRef = ref<FormInstance>();
const submitting = ref(false);

const form = reactive({
  name: '',
  category: BANK_CATEGORY_DEFAULT,
  description: '',
  allowPractice: false,
});

const rules: FormRules = {
  name: [
    { required: true, message: '请输入题库名称', trigger: 'blur' },
    { max: 120, message: '题库名称不能超过 120 字', trigger: 'blur' },
  ],
  category: [{ required: true, message: '请输入题库分类', trigger: 'blur' }],
  description: [{ max: 255, message: '描述不能超过 255 字', trigger: 'blur' }],
};

/** 每次打开按 bank 重置表单内容与校验态 */
watch(
  () => props.visible,
  (visible) => {
    if (!visible) return;
    form.name = props.bank?.name ?? '';
    form.category = props.bank?.category || BANK_CATEGORY_DEFAULT;
    form.description = props.bank?.description ?? '';
    form.allowPractice = props.bank?.allowPractice ?? false;
    formRef.value?.clearValidate();
  },
);

/** 提交（新建 / 编辑自动分流） */
async function handleSubmit(): Promise<void> {
  if (!formRef.value) return;
  const valid = await formRef.value.validate().catch(() => false);
  if (!valid) return;

  submitting.value = true;
  try {
    const payload = {
      name: form.name.trim(),
      category: form.category.trim() || BANK_CATEGORY_DEFAULT,
      description: form.description.trim(),
      allowPractice: form.allowPractice,
    };
    if (isEdit.value && props.bank) {
      await banksApi.update(props.bank.id, payload);
      ElMessage.success('题库已更新');
    } else {
      await banksApi.create(payload);
      ElMessage.success('题库已创建');
    }
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
    :title="isEdit ? '编辑题库' : '新建题库'"
    width="520px"
    append-to-body
    destroy-on-close
  >
    <el-form ref="formRef" :model="form" :rules="rules" label-position="top">
      <el-form-item label="题库名称" prop="name">
        <el-input v-model="form.name" maxlength="120" show-word-limit placeholder="如：安全知识题库" />
      </el-form-item>
      <el-form-item label="题库分类" prop="category">
        <el-input v-model="form.category" maxlength="60" placeholder="如：安全知识 / 企业文化" />
      </el-form-item>
      <el-form-item label="描述" prop="description">
        <el-input
          v-model="form.description"
          type="textarea"
          :rows="3"
          maxlength="255"
          show-word-limit
          placeholder="选填，简要说明题库用途"
        />
      </el-form-item>
      <el-form-item label="对外开放练题" prop="allowPractice">
        <el-switch v-model="form.allowPractice" active-text="开" inactive-text="关" />
        <span class="practice-hint">
          开启后该题库的题目将出现在公网练题入口（题目与答案会被公网用户看到，请勿开放涉密/考试在用题库）
        </span>
      </el-form-item>
    </el-form>

    <template #footer>
      <el-button @click="handleCancel">取消</el-button>
      <el-button type="primary" :loading="submitting" @click="handleSubmit">
        {{ isEdit ? '保存' : '创建' }}
      </el-button>
    </template>
  </el-dialog>
</template>

<style scoped lang="scss">
.practice-hint {
  display: block;
  margin-top: 6px;
  margin-left: 12px;
  font-size: 12px;
  line-height: 1.6;
  color: #94a3b8;
}
</style>
