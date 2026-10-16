<script setup lang="ts">
/**
 * 特殊考试安排弹窗（v1.7①，管理员）。
 * 为指定考生设置「加时 / 额外答题次数 / 免考」；按 考试×考生 upsert。
 */
import { computed, ref, watch } from 'vue';
import { ElMessage } from 'element-plus';
import * as examsApi from '@/api/exams';
import * as usersApi from '@/api/users';
import { useConfirm } from '@/composables/useConfirm';
import EmptyState from '@/components/common/EmptyState.vue';
import type { Exam, ExamException, User } from '@/types';

const props = defineProps<{ modelValue: boolean; exam: Exam | null }>();
const emit = defineEmits<{ (e: 'update:modelValue', v: boolean): void }>();

const { confirm } = useConfirm();

const visible = computed({
  get: () => props.modelValue,
  set: (v: boolean) => emit('update:modelValue', v),
});

const loading = ref(false);
const saving = ref(false);
const list = ref<ExamException[]>([]);
const examinees = ref<User[]>([]);

/** 编辑目标考生（空 = 新增） */
const targetUserId = ref('');
const extraMinutes = ref(0);
const extraAttempts = ref(0);
const exempt = ref(false);
const note = ref('');

/** 尚未配置特殊安排的考生（新增时可选） */
const configurableUsers = computed(() => {
  const configured = new Set(list.value.map((x) => x.userId));
  return examinees.value.filter((u) => !configured.has(u.id) || u.id === targetUserId.value);
});

async function load(): Promise<void> {
  if (!props.exam) return;
  loading.value = true;
  try {
    const [exceptions, users] = await Promise.all([
      examsApi.listExceptions(props.exam.id),
      usersApi.list({ role: 'examinee' }),
    ]);
    list.value = exceptions;
    examinees.value = users;
  } catch {
    list.value = [];
  } finally {
    loading.value = false;
  }
}

watch(
  () => props.modelValue,
  (open) => {
    if (!open) return;
    resetForm();
    void load();
  },
);

function resetForm(): void {
  targetUserId.value = '';
  extraMinutes.value = 0;
  extraAttempts.value = 0;
  exempt.value = false;
  note.value = '';
}

function startEdit(row: ExamException): void {
  targetUserId.value = row.userId;
  extraMinutes.value = row.extraMinutes;
  extraAttempts.value = row.extraAttempts;
  exempt.value = row.exempt;
  note.value = row.note;
}

async function handleSave(): Promise<void> {
  if (!props.exam) return;
  if (!targetUserId.value) {
    ElMessage.warning('请选择考生');
    return;
  }
  saving.value = true;
  try {
    await examsApi.saveException(props.exam.id, targetUserId.value, {
      extraMinutes: extraMinutes.value,
      extraAttempts: extraAttempts.value,
      exempt: exempt.value,
      note: note.value.trim(),
    });
    ElMessage.success('特殊安排已保存');
    resetForm();
    void load();
  } catch {
    // 错误已由拦截器提示
  } finally {
    saving.value = false;
  }
}

async function handleRemove(row: ExamException): Promise<void> {
  if (!props.exam) return;
  const ok = await confirm(`确定删除「${row.userName}」在这场的特殊安排吗？`, {
    title: '删除特殊安排',
    confirmButtonText: '确认删除',
    type: 'warning',
  });
  if (!ok) return;
  try {
    await examsApi.removeException(props.exam.id, row.userId);
    ElMessage.success('已删除');
    if (targetUserId.value === row.userId) resetForm();
    void load();
  } catch {
    // 错误已由拦截器提示
  }
}
</script>

<template>
  <el-dialog v-model="visible" title="特殊考试安排" width="720px" append-to-body destroy-on-close>
    <el-alert
      class="exam-exception__alert"
      type="info"
      :closable="false"
      show-icon
      :title="exam ? exam.name : ''"
      description="加时仅影响该考生本人的答题倒计时；额外次数叠加在考试答题次数上限之上；免考考生不可进入答题。"
    />

    <el-form class="exam-exception__form" inline label-width="72px">
      <el-form-item label="考生">
        <el-select v-model="targetUserId" class="exam-exception__select" placeholder="选择考生" filterable>
          <el-option
            v-for="u in configurableUsers"
            :key="u.id"
            :label="`${u.name}（${u.username}）`"
            :value="u.id"
          />
        </el-select>
      </el-form-item>
      <el-form-item label="加时">
        <el-input-number v-model="extraMinutes" :min="0" :max="600" :step="5" />
        <span class="exam-exception__unit">分钟</span>
      </el-form-item>
      <el-form-item label="额外次数">
        <el-input-number v-model="extraAttempts" :min="0" :max="10" />
      </el-form-item>
      <el-form-item label="免考">
        <el-switch v-model="exempt" />
      </el-form-item>
      <el-form-item label="备注">
        <el-input v-model="note" class="exam-exception__note" maxlength="255" placeholder="选填" />
      </el-form-item>
      <el-form-item>
        <el-button type="primary" :loading="saving" @click="handleSave">保存</el-button>
        <el-button @click="resetForm">清空</el-button>
      </el-form-item>
    </el-form>

    <el-table v-loading="loading" :data="list" row-key="id" stripe max-height="320">
      <el-table-column prop="userName" label="考生" width="110" show-overflow-tooltip />
      <el-table-column prop="username" label="登录账号" width="130" show-overflow-tooltip />
      <el-table-column prop="departmentName" label="科室" width="110" show-overflow-tooltip>
        <template #default="{ row }">{{ row.departmentName || '—' }}</template>
      </el-table-column>
      <el-table-column label="加时" width="90" align="center">
        <template #default="{ row }">{{ row.extraMinutes ? `${row.extraMinutes} 分` : '—' }}</template>
      </el-table-column>
      <el-table-column label="额外次数" width="90" align="center">
        <template #default="{ row }">{{ row.extraAttempts || '—' }}</template>
      </el-table-column>
      <el-table-column label="免考" width="80" align="center">
        <template #default="{ row }">
          <el-tag v-if="row.exempt" type="warning" size="small" effect="light">免考</el-tag>
          <span v-else>—</span>
        </template>
      </el-table-column>
      <el-table-column prop="note" label="备注" min-width="120" show-overflow-tooltip>
        <template #default="{ row }">{{ row.note || '—' }}</template>
      </el-table-column>
      <el-table-column label="操作" width="120" fixed="right">
        <template #default="{ row }">
          <el-button type="primary" link @click="startEdit(row as ExamException)">编辑</el-button>
          <el-button type="danger" link @click="handleRemove(row as ExamException)">删除</el-button>
        </template>
      </el-table-column>
      <template #empty>
        <EmptyState text="暂无特殊安排" />
      </template>
    </el-table>

    <template #footer>
      <el-button @click="visible = false">关闭</el-button>
    </template>
  </el-dialog>
</template>

<style scoped lang="scss">
@use '@/styles/variables.scss' as *;

.exam-exception {
  &__alert {
    margin-bottom: 16px;
  }

  &__form {
    margin-bottom: 8px;
  }

  &__select {
    width: 200px;
  }

  &__note {
    width: 180px;
  }

  &__unit {
    margin-left: 6px;
    font-size: 12px;
    color: $text-secondary;
  }
}
</style>
