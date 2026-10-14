<script setup lang="ts">
/** 页头：标题 + 描述 + 右侧操作插槽 */
defineProps<{ title: string; description?: string }>();
</script>

<template>
  <div class="page-header">
    <div class="page-header__text">
      <h2 class="page-header__title">{{ title }}</h2>
      <p v-if="description" class="page-header__desc">{{ description }}</p>
    </div>
    <div class="page-header__actions">
      <slot name="actions" />
    </div>
  </div>
</template>

<style scoped lang="scss">
@use '@/styles/variables.scss' as *;

.page-header {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 16px;

  &__title {
    margin: 0;
    font-size: 19px;
    font-weight: 600;
    letter-spacing: -0.01em;
    color: $text-primary;
  }

  &__desc {
    margin: 4px 0 0;
    font-size: 12.5px;
    color: $text-secondary;
  }

  &__actions {
    display: flex;
    align-items: center;
    gap: 8px;
  }
}
</style>
