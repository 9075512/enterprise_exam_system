<script setup lang="ts">
/** 响应式卡片网格：默认插槽放置卡片 */
</script>

<template>
  <div class="card-grid">
    <slot />
  </div>
</template>

<style scoped lang="scss">
.card-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(260px, 100%), 1fr));
  gap: 16px;

  > :deep(*) {
    min-width: 0;
  }
}
</style>
