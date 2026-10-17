<script setup lang="ts">
import BasePracticeLoading from '@practice/components/common/PracticeLoading.vue';

withDefaults(defineProps<{ loading?: boolean; compact?: boolean; caption?: string }>(), {
  loading: false,
  compact: false,
  caption: '正在加载…',
});
</script>

<template>
  <BasePracticeLoading :loading="loading" :compact="compact" :caption="caption" />
</template>
