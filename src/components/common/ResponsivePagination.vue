<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { ElPagination } from 'element-plus';

defineOptions({ inheritAttrs: false });
const props = withDefaults(defineProps<{
  currentPage?: number;
  pageSize?: number;
  total?: number;
  layout?: string;
  pagerCount?: number;
  disabled?: boolean;
}>(), { currentPage: 1, pageSize: 10, total: 0, layout: 'prev, pager, next', pagerCount: 7, disabled: false });
const emit = defineEmits<{
  'update:currentPage': [value: number];
  'current-change': [value: number];
}>();
const mobile = ref(false);
const pages = computed(() => Math.max(1, Math.ceil(props.total / Math.max(1, props.pageSize))));
let query: MediaQueryList | undefined;
function syncViewport(): void { mobile.value = query?.matches ?? false; }
onMounted(() => {
  if (!window.matchMedia) return;
  query = window.matchMedia('(max-width: 900px)');
  syncViewport();
  query.addEventListener('change', syncViewport);
});
onBeforeUnmount(() => query?.removeEventListener('change', syncViewport));

function jump(event: Event): void {
  if (props.disabled) return;
  const input = event.target as HTMLInputElement;
  const value = input.valueAsNumber;
  const page = Number.isFinite(value) ? Math.min(pages.value, Math.max(1, Math.trunc(value))) : props.currentPage;
  input.value = String(page);
  if (page === props.currentPage) return;
  emit('update:currentPage', page);
  emit('current-change', page);
}
</script>

<template>
  <ElPagination
    v-bind="$attrs"
    class="responsive-pagination"
    :class="{ 'is-mobile': mobile }"
    :current-page="currentPage"
    :page-size="pageSize"
    :total="total"
    :pager-count="pagerCount"
    :disabled="disabled"
    :layout="mobile ? 'prev, slot, next' : layout"
    @update:current-page="emit('update:currentPage', $event)"
    @current-change="emit('current-change', $event)"
  >
    <span v-if="mobile" class="responsive-pagination__position">
      <input type="number" inputmode="numeric" aria-label="跳转页码" :value="currentPage" :min="1" :max="pages" :disabled="disabled" @change="jump" @keydown.enter.prevent="jump">
      <span aria-live="polite">/ {{ pages }} 页</span>
    </span>
  </ElPagination>
</template>

<style lang="scss">
// 显式导入的分页组件需要携带样式，避免只使用分页的页面漏载样式。
@use 'element-plus/theme-chalk/src/pagination.scss';
</style>

<style scoped lang="scss">
@use '@/styles/variables.scss' as *;
.responsive-pagination.is-mobile {
  --el-pagination-button-height: 44px;
  --el-pagination-button-width: 44px;
  gap: 8px;
  :deep(.btn-prev), :deep(.btn-next) { flex: 0 0 44px; min-width: 44px; height: 44px; }
}
.responsive-pagination__position {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  white-space: nowrap;
  color: $text-secondary;
  input { width: 64px; height: 44px; border: 1px solid $line-strong; border-radius: $radius-base; background: $bg-paper; color: $text-primary; font: inherit; text-align: center; font-variant-numeric: tabular-nums; appearance: textfield; }
  input::-webkit-inner-spin-button, input::-webkit-outer-spin-button { appearance: none; margin: 0; }
}
</style>
