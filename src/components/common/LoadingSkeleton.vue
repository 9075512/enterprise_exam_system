<script setup lang="ts">
/** 加载骨架（el-skeleton 封装） */
withDefaults(defineProps<{ rows?: number; animated?: boolean }>(), {
  rows: 6,
  animated: true,
});
</script>

<template>
  <div class="loading-skeleton">
    <el-skeleton :rows="rows" :animated="animated" />
  </div>
</template>

<style scoped lang="scss">
.loading-skeleton {
  padding: 16px 0;
}
</style>
