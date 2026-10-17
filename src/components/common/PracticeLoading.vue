<script setup lang="ts">
import { toRef } from 'vue';
import { useDelayedLoading } from '@/composables/useDelayedLoading';

const props = withDefaults(defineProps<{
  loading: boolean;
  caption?: string;
  rows?: number;
  compact?: boolean;
}>(), { caption: '正在加载…', rows: 3, compact: false });
const visible = useDelayedLoading(toRef(props, 'loading'), { delay: 150, minDuration: 0 });
</script>

<template>
  <div
    v-if="loading"
    class="practice-loading"
    :class="{ 'is-compact': compact }"
    role="status"
    aria-live="polite"
    :aria-label="caption"
    aria-busy="true"
  >
    <template v-if="visible">
      <el-skeleton v-if="!compact" :rows="rows" animated />
      <p class="practice-loading__caption">{{ caption }}</p>
    </template>
  </div>
</template>

<style scoped lang="scss">
@use '@/styles/variables.scss' as *;

.practice-loading {
  min-height: 150px;
  padding: 20px 16px;
  border-radius: $practice-radius;
  background: $bg-paper;

  &.is-compact {
    min-height: 24px;
    padding: 4px 0;
    background: transparent;
  }

  &__caption {
    margin: 12px 0 0;
    font-size: 12px;
    color: $text-secondary;
  }

  &.is-compact &__caption { margin: 0; }
}
</style>
