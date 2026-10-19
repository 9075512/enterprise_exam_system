<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import { ElMessage, type FormInstance, type FormRules } from 'element-plus';
import { useAuthStore } from '@/stores/auth';
import { useSettingsStore } from '@/stores/settings';

const props = defineProps<{ modelValue: boolean }>();
const emit = defineEmits<{ 'update:modelValue': [value: boolean] }>();

const auth = useAuthStore();
const settingsStore = useSettingsStore();
const formRef = ref<FormInstance>();
const loading = ref(false);
const form = reactive({ oldPassword: '', newPassword: '', confirmPassword: '' });

const visible = computed({
  get: () => props.modelValue,
  set: (value: boolean) => { if (!loading.value) emit('update:modelValue', value); },
});

const rules = computed<FormRules>(() => ({
  oldPassword: [{ required: true, message: '请输入旧密码', trigger: 'blur' }],
  newPassword: [
    { required: true, message: '请输入新密码', trigger: 'blur' },
    {
      min: settingsStore.settings.minPasswordLength,
      message: `新密码长度不能少于 ${settingsStore.settings.minPasswordLength} 位`,
      trigger: 'blur',
    },
  ],
  confirmPassword: [{ required: true, message: '请再次输入新密码', trigger: 'blur' }],
}));

watch(visible, (open) => {
  if (open) return;
  form.oldPassword = '';
  form.newPassword = '';
  form.confirmPassword = '';
  formRef.value?.clearValidate();
});

async function submit(): Promise<void> {
  if (!formRef.value || loading.value) return;
  const valid = await formRef.value.validate().catch(() => false);
  if (!valid || loading.value) return;
  if (form.newPassword !== form.confirmPassword) {
    ElMessage.error('两次输入的密码不一致');
    return;
  }
  loading.value = true;
  try {
    await auth.changePassword(form.oldPassword, form.newPassword);
    ElMessage.success('密码修改成功');
    emit('update:modelValue', false);
  } catch {
    // 请求错误由全局拦截器统一提示。
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <el-dialog v-model="visible" title="修改密码" width="480px" append-to-body :close-on-click-modal="!loading" :close-on-press-escape="!loading" :show-close="!loading">
    <p class="admin-hint">新密码至少 {{ settingsStore.settings.minPasswordLength }} 位，修改后按现有账号安全规则生效。</p>
    <el-form ref="formRef" :model="form" :rules="rules" label-position="top" :disabled="loading" @submit.prevent="submit">
      <el-form-item label="旧密码" prop="oldPassword">
        <el-input v-model="form.oldPassword" type="password" show-password autocomplete="current-password" />
      </el-form-item>
      <el-form-item label="新密码" prop="newPassword">
        <el-input v-model="form.newPassword" type="password" show-password autocomplete="new-password" />
      </el-form-item>
      <el-form-item label="确认新密码" prop="confirmPassword">
        <el-input v-model="form.confirmPassword" type="password" show-password autocomplete="new-password" />
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button :disabled="loading" @click="visible = false">取消</el-button>
      <el-button type="primary" :loading="loading" @click="submit">确定</el-button>
    </template>
  </el-dialog>
</template>
