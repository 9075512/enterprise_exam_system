<script setup lang="ts">
/** 受控确认框（基于 el-dialog）：v-model 控制显隐，confirm/cancel 事件回调 */
import { computed } from 'vue';

const props = withDefaults(
  defineProps<{
    modelValue: boolean;
    title?: string;
    content?: string;
    confirmText?: string;
    cancelText?: string;
    danger?: boolean;
    loading?: boolean;
  }>(),
  {
    title: '确认操作',
    content: '',
    confirmText: '确定',
    cancelText: '取消',
    danger: false,
    loading: false,
  },
);

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void;
  (e: 'confirm'): void;
  (e: 'cancel'): void;
}>();

const visible = computed<boolean>({
  get: () => props.modelValue,
  set: (value) => emit('update:modelValue', value),
});

function onConfirm(): void {
  emit('confirm');
}

function onCancel(): void {
  emit('cancel');
  visible.value = false;
}
</script>

<template>
  <el-dialog v-model="visible" :title="title" width="420px" append-to-body>
    <span>{{ content }}</span>
    <template #footer>
      <el-button @click="onCancel">{{ cancelText }}</el-button>
      <el-button :type="danger ? 'danger' : 'primary'" :loading="loading" @click="onConfirm">
        {{ confirmText }}
      </el-button>
    </template>
  </el-dialog>
</template>
