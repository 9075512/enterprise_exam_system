<script setup lang="ts">
/**
 * 题库复制弹窗（v1.7④ S4）。
 *
 * - 名称默认「原名（副本）」；
 * - 可选是否连同试题一起复制（默认复制）；
 * - 管理员可重新指定新题库的授权出题人；出题人复制时默认继承源题库作者并自动含自己。
 */
import { computed, ref, watch } from 'vue';
import { ElMessage, type FormInstance } from 'element-plus';
import * as banksApi from '@/api/banks';
import * as usersApi from '@/api/users';
import { focusFirstFormError } from '@/composables/useFormFocus';
import { useRequest } from '@/composables/useRequest';
import RequestError from '@/components/common/RequestError.vue';
import type { QuestionBank } from '@/types';

const props = defineProps<{
  visible: boolean;
  bank: QuestionBank | null;
  /** 是否管理员（决定能否指定授权出题人） */
  isAdmin?: boolean;
}>();

const emit = defineEmits<{
  (e: 'update:visible', value: boolean): void;
  (e: 'saved', bank: QuestionBank): void;
}>();

const submitting = ref(false);
const formRef = ref<FormInstance>();
const submitError = ref('');
const nameError = ref('');
const { data: authorOptions, loading: authorsLoading, error: authorsError, refresh: loadAuthors } = useRequest(
  async () => (await usersApi.list({ role: 'author' })).map(user => ({ id: user.id, name: user.name })),
  [], { immediate: false, keepPreviousData: false },
);

const form = ref({
  name: '',
  copyQuestions: true,
  authorIds: [] as string[],
});

const selectedAuthors = computed(() => form.value.authorIds.map(id => authorOptions.value?.find(a => a.id === id)?.name || id));

const dialogVisible = computed({
  get: () => props.visible,
  set: (v: boolean) => { if (!v && submitting.value) return; emit('update:visible', v); },
});

watch(
  () => props.visible,
  (open) => {
    if (!open || !props.bank) return;
    submitError.value = '';
    nameError.value = '';
    formRef.value?.clearValidate();
    form.value = {
      name: `${props.bank.name}（副本）`,
      copyQuestions: true,
      authorIds: [...(props.bank.authorIds ?? [])],
    };
    if (props.isAdmin) void loadAuthors();
  },
  { immediate: true },
);

async function handleSubmit(): Promise<void> {
  if (!props.bank || submitting.value || (props.isAdmin && (authorsLoading.value || authorsError.value))) return;
  const name = form.value.name.trim();
  nameError.value = !name ? '请填写新题库名称' : name.length > 100 ? '名称不能超过 100 字' : '';
  if (nameError.value) {
    await focusFirstFormError(formRef.value?.$el);
    return;
  }
  submitError.value = '';
  submitting.value = true;
  try {
    const result = await banksApi.clone(props.bank.id, {
      name,
      copyQuestions: form.value.copyQuestions,
      ...(props.isAdmin ? { authorIds: form.value.authorIds } : {}),
    });
    // v1.8⑤ U5：内容去重式复用 —— 同内容题目只新建一行，如实反馈
    ElMessage.success(
      result.reused > 0
        ? `题库已复制（新建题目 ${result.copied} 道，内容重复复用 ${result.reused} 道）`
        : '题库已复制',
    );
    emit('saved', result.bank);
    emit('update:visible', false);
  } catch {
    submitError.value = '复制失败，已保留名称、试题与授权设置，请重试。';
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <el-dialog class="bank-workflow-dialog" v-model="dialogVisible" title="复制题库" width="560px" append-to-body destroy-on-close :close-on-click-modal="!submitting" :close-on-press-escape="!submitting" :show-close="!submitting">
    <div class="admin-detail-block bank-clone__source"><strong>源题库 · {{ bank?.name ?? '' }}</strong><p>新题库独立维护，复制结果会显示新建与内容复用的实际题数。</p></div>
    <RequestError v-if="isAdmin && authorsError" text="授权出题人加载失败，请重试后复制" @retry="loadAuthors" />
    <el-alert v-if="submitError" :title="submitError" type="error" show-icon :closable="false" class="bank-clone__error" />
    <el-form ref="formRef" :model="form" label-position="top" :disabled="submitting">
      <el-form-item label="新题库名称" prop="name" required :error="nameError">
        <el-input v-model="form.name" maxlength="100" show-word-limit placeholder="请输入新题库名称" @input="nameError = ''" />
      </el-form-item>
      <el-form-item label="复制试题">
        <el-switch v-model="form.copyQuestions" />
        <span class="bank-clone__hint">
          开启后将复制源题库全部试题（含题型/选项/答案/分值/知识点/评分细则），新题 id 独立，不影响原题库；
          内容完全相同的题目会自动去重复用，只保留一行
        </span>
      </el-form-item>
      <el-form-item v-if="isAdmin" label="授权出题人">
        <el-select
          v-model="form.authorIds"
          :loading="authorsLoading"
          :disabled="submitting || Boolean(authorsError) || authorsLoading"
          popper-class="organization-choice-popper"
          class="bank-clone__full"
          multiple
          filterable
          collapse-tags
          collapse-tags-tooltip
          placeholder="默认继承源题库授权出题人"
        >
          <el-option v-for="a in authorOptions ?? []" :key="a.id" :label="a.name" :value="a.id" />
        </el-select>
        <p class="bank-clone__hint">{{ selectedAuthors.length ? `已选出题人：${selectedAuthors.join('、')}` : '未选择时继承源题库授权出题人' }}</p>
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button :disabled="submitting" @click="dialogVisible = false">取消</el-button>
      <el-button type="primary" :loading="submitting" :disabled="Boolean(isAdmin && (authorsLoading || authorsError))" @click="handleSubmit">确认复制</el-button>
    </template>
  </el-dialog>
</template>

<style scoped lang="scss">
@use '@/styles/variables.scss' as *;

.bank-clone__error { margin: 12px 0; overflow-wrap: anywhere; }
.bank-clone {
  &__source {
    color: $text-primary;
    overflow-wrap: anywhere;
  }

  &__full {
    width: 100%;
  }

  &__hint {
    display: block;
    width: 100%;
    margin-top: 8px;
    font-size: 12px;
    line-height: 1.7;
    overflow-wrap: anywhere;
    color: $text-secondary;
  }
}
</style>
