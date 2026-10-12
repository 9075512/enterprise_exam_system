<script setup lang="ts">
/** 空态（内部 el-empty） */
withDefaults(defineProps<{ text?: string; description?: string }>(), {
  text: '暂无数据',
  description: '',
});
</script>

<template>
  <el-empty :description="description || text" />
</template>
