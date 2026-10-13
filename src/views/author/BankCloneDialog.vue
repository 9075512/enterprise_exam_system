<script setup lang="ts">
/**
 * 题库复制弹窗（v1.7④ S4）。
 *
 * - 名称默认「原名（副本）」；
 * - 可选是否连同试题一起复制（默认复制）；
 * - 管理员可重新指定新题库的授权出题人；出题人复制时默认继承源题库作者并自动含自己。
 */
import { computed, ref, watch } from 'vue';
import { ElMessage } from 'element-plus';
import * as banksApi from '@/api/banks';
import * as usersApi from '@/api/users';
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
const authorOptions = ref<Array<{ id: string; name: string }>>([]);

const form = ref({
  name: '',
  copyQuestions: true,
  authorIds: [] as string[],
});

const dialogVisible = computed({
  get: () => props.visible,
  set: (v: boolean) => emit('update:visible', v),
});

watch(
  () => props.visible,
  async (open) => {
    if (!open || !props.bank) return;
    form.value = {
      name: `${props.bank.name}（副本）`,
      copyQuestions: true,
      authorIds: [...(props.bank.authorIds ?? [])],
    };
    if (props.isAdmin && authorOptions.value.length === 0) {
      try {
        const list = await usersApi.list({ role: 'author' });
        authorOptions.value = list.map((u) => ({ id: u.id, name: u.name }));
      } catch {
        /* 已由拦截器提示 */
      }
    }
  },
);

async function handleSubmit(): Promise<void> {
  if (!props.bank) return;
  const name = form.value.name.trim();
  if (!name) {
    ElMessage.warning('请填写新题库名称');
    return;
  }
  submitting.value = true;
  try {
    const created = await banksApi.clone(props.bank.id, {
      name,
      copyQuestions: form.value.copyQuestions,
      ...(props.isAdmin ? { authorIds: form.value.authorIds } : {}),
    });
    ElMessage.success('题库已复制');
    emit('saved', created);
    dialogVisible.value = false;
  } catch {
    /* 已由拦截器提示 */
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <el-dialog v-model="dialogVisible" title="复制题库" width="520px" append-to-body>
    <el-form label-width="96px">
      <el-form-item label="源题库">
        <span class="bank-clone__source">{{ bank?.name ?? '' }}</span>
      </el-form-item>
      <el-form-item label="新题库名称" required>
        <el-input v-model="form.name" maxlength="100" show-word-limit placeholder="请输入新题库名称" />
      </el-form-item>
      <el-form-item label="复制试题">
        <el-switch v-model="form.copyQuestions" />
        <span class="bank-clone__hint">
          开启后将复制源题库全部试题（含题型/选项/答案/分值/知识点/评分细则），新题 id 独立，不影响原题库
        </span>
      </el-form-item>
      <el-form-item v-if="isAdmin" label="授权出题人">
        <el-select
          v-model="form.authorIds"
          class="bank-clone__full"
          multiple
          filterable
          collapse-tags
          collapse-tags-tooltip
          placeholder="默认继承源题库授权出题人"
        >
          <el-option v-for="a in authorOptions" :key="a.id" :label="a.name" :value="a.id" />
        </el-select>
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="dialogVisible = false">取消</el-button>
      <el-button type="primary" :loading="submitting" @click="handleSubmit">确认复制</el-button>
    </template>
  </el-dialog>
</template>

<style scoped lang="scss">
@use '@/styles/variables.scss' as *;

.bank-clone {
  &__source {
    color: $text-primary;
  }

  &__full {
    width: 100%;
  }

  &__hint {
    margin-left: 10px;
    font-size: 12px;
    line-height: 1.5;
    color: $text-secondary;
  }
}
</style>
