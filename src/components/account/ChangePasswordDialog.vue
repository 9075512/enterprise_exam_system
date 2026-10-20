<script setup lang="ts">
import { computed, nextTick, reactive, ref, watch } from 'vue';
import { ElMessage, type FormInstance } from 'element-plus';
import { useAuthStore } from '@/stores/auth';
import { useSettingsStore } from '@/stores/settings';

const props = defineProps<{ modelValue: boolean }>();
const emit = defineEmits<{ 'update:modelValue': [value: boolean] }>();

const auth = useAuthStore();
const settingsStore = useSettingsStore();
const formRef = ref<FormInstance>();
const loading = ref(false);
const submitError = ref('');
const errors = reactive({ oldPassword: '', newPassword: '', confirmPassword: '' });
const errorRef = ref<HTMLElement>();
const form = reactive({ oldPassword: '', newPassword: '', confirmPassword: '' });

const visible = computed({
  get: () => props.modelValue,
  set: (value: boolean) => { if (!loading.value) emit('update:modelValue', value); },
});


watch(visible, (open) => {
  if (open) return;
  submitError.value = '';
  Object.assign(errors, { oldPassword: '', newPassword: '', confirmPassword: '' });
  form.oldPassword = '';
  form.newPassword = '';
  form.confirmPassword = '';
  formRef.value?.clearValidate();
});

async function submit(): Promise<void> {
  if (!formRef.value || loading.value) return;
  errors.oldPassword = form.oldPassword ? '' : '请输入旧密码';
  errors.newPassword = !form.newPassword ? '请输入新密码' : form.newPassword.length < settingsStore.settings.minPasswordLength ? '新密码长度不能少于 ' + settingsStore.settings.minPasswordLength + ' 位' : '';
  errors.confirmPassword = !form.confirmPassword ? '请再次输入新密码' : form.confirmPassword !== form.newPassword ? '两次输入的密码不一致' : '';
  if (Object.values(errors).some(Boolean)) {
    await nextTick(); formRef.value.$el.querySelector('.is-error input')?.focus();
    return;
  }
  loading.value = true;
  submitError.value = '';
  try {
    await auth.changePassword(form.oldPassword, form.newPassword);
    ElMessage.success('密码修改成功');
    emit('update:modelValue', false);
  } catch {
    submitError.value = '密码修改失败，请检查输入后重试；本次输入已保留。';
    await nextTick();
    errorRef.value?.focus();
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <el-dialog class="account-dialog" v-model="visible" title="修改密码" width="480px" append-to-body :close-on-click-modal="!loading" :close-on-press-escape="!loading" :show-close="!loading">
    <p class="admin-hint">新密码至少 {{ settingsStore.settings.minPasswordLength }} 位，修改后按现有账号安全规则生效。</p>
    <div v-if="submitError" ref="errorRef" class="account-dialog__error" role="alert" tabindex="-1"><el-alert :title="submitError" type="error" :closable="false" show-icon /></div>
    <el-form ref="formRef" :model="form" label-position="top" :disabled="loading" @submit.prevent="submit">
      <el-form-item label="旧密码" prop="oldPassword" required :error="errors.oldPassword">
        <el-input v-model="form.oldPassword" @input="errors.oldPassword = ''" type="password" show-password autocomplete="current-password" />
      </el-form-item>
      <el-form-item label="新密码" prop="newPassword" required :error="errors.newPassword">
        <el-input v-model="form.newPassword" @input="errors.newPassword = ''; errors.confirmPassword = ''" type="password" show-password autocomplete="new-password" />
      </el-form-item>
      <el-form-item label="确认新密码" prop="confirmPassword" required :error="errors.confirmPassword">
        <el-input v-model="form.confirmPassword" @input="errors.confirmPassword = ''" type="password" show-password autocomplete="new-password" />
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button :disabled="loading" @click="visible = false">取消</el-button>
      <el-button type="primary" :loading="loading" @click="submit">确定</el-button>
    </template>
  </el-dialog>
</template>
