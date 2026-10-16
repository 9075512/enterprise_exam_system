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
  flex-wrap: wrap;
  align-items: flex-end;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 20px;

  &__text {
    flex: 1 1 240px;
    min-width: 0;
    overflow-wrap: anywhere;
  }

  &__title {
    margin: 0;
    font-size: 22px;
    font-weight: 700;
    letter-spacing: -0.01em;
    color: $text-primary;
  }

  &__desc {
    margin: 4px 0 0;
    font-size: 12px;
    color: $text-secondary;
  }

  &__actions {
    display: flex;
    flex-wrap: wrap;
    max-width: 100%;
    margin-left: auto;
    align-items: center;
    gap: 8px;
  }
}
</style>
