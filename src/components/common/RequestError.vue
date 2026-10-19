<script setup lang="ts">
import { Refresh, Warning } from '@element-plus/icons-vue';
import EmptyState from './EmptyState.vue';

withDefaults(defineProps<{ text?: string }>(), { text: '加载失败，请重试' });
const emit = defineEmits<{ retry: [] }>();
</script>

<template>
  <div class="request-error" role="status">
    <EmptyState :text="text" :icon="Warning" action-text="重新加载" :action-icon="Refresh" @action="emit('retry')" />
  </div>
</template>
