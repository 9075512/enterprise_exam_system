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
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 16px;
}
</style>
