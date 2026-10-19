<script setup lang="ts">
defineProps<{ name: string; disabled?: boolean }>();
defineEmits<{ (e: 'remove'): void }>();
</script>

<template>
  <div class="selected-import-file" role="group" aria-label="已选导入文件">
    <div class="selected-import-file__info"><span>已选文件</span><strong>{{ name }}</strong></div>
    <el-button class="selected-import-file__remove" :disabled="disabled" aria-label="移除已选文件" @click="$emit('remove')">移除</el-button>
  </div>
</template>

<style scoped lang="scss">
@use '@/styles/variables.scss' as *;
.selected-import-file { display: flex; align-items: flex-start; gap: 12px; width: 100%; min-width: 0; padding: 14px; border: 1px solid $border-color; border-radius: $radius-lg; background: $bg-page;
  &__info { flex: 1; min-width: 0; span { display: block; color: $text-secondary; font-size: 12px; } strong { display: block; margin-top: 4px; color: $text-primary; font-size: 13px; line-height: 1.7; font-weight: 500; overflow-wrap: anywhere; } }
  .el-button { flex-shrink: 0; margin: 0; }
}
@media (max-width: 900px) { .selected-import-file.selected-import-file .selected-import-file__remove.el-button.el-button { min-width: 44px; min-height: 44px; } }
</style>
