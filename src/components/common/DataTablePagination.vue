<script setup lang="ts">
/** 表格分页（el-pagination 封装，每页条数默认取系统设置） */
import { computed, onMounted } from 'vue';
import { PAGE_SIZE_MAX } from '@/constants';
import { useSettingsStore } from '@/stores/settings';

const settingsStore = useSettingsStore();

const props = defineProps<{ total: number; page: number; pageSize: number; pageSizes?: number[]; disabled?: boolean }>();

onMounted(() => {
  void settingsStore.load();
});

/** 每页条数候选：由 [10, 设置默认值, 50, PAGE_SIZE_MAX] 去重并升序得到 */
const sizeOptions = computed<number[]>(() => {
  const base = props.pageSizes ?? [10, settingsStore.settings.defaultPageSize, 50, PAGE_SIZE_MAX];
  return [...new Set(base)].sort((a, b) => a - b);
});
const totalPages = computed<number>(() => Math.max(1, Math.ceil(props.total / props.pageSize)));

const emit = defineEmits<{
  (e: 'update:page', value: number): void;
  (e: 'update:pageSize', value: number): void;
}>();

function handleCurrentChange(value: number): void {
  if (!props.disabled) emit('update:page', value);
}

function handleSizeChange(value: number): void {
  if (!props.disabled) emit('update:pageSize', value);
}
</script>

<template>
  <div class="data-table-pagination">
    <el-pagination
      class="data-table-pagination__desktop"
      background
      :disabled="props.disabled"
      :pager-count="5"
      layout="total, sizes, prev, pager, next, jumper"
      :total="props.total"
      :current-page="props.page"
      :page-size="props.pageSize"
      :page-sizes="sizeOptions"
      @current-change="handleCurrentChange"
      @size-change="handleSizeChange"
    />
    <div class="data-table-pagination__mobile" aria-label="分页导航">
      <span class="data-table-pagination__summary">共 {{ props.total }} 条</span>
      <button
        type="button"
        class="data-table-pagination__button"
        :disabled="props.disabled || props.page <= 1"
        @click="handleCurrentChange(props.page - 1)"
      >
        上一页
      </button>
      <span class="data-table-pagination__current">{{ props.page }} / {{ totalPages }}</span>
      <button
        type="button"
        class="data-table-pagination__button"
        :disabled="props.disabled || props.page >= totalPages"
        @click="handleCurrentChange(props.page + 1)"
      >
        下一页
      </button>
    </div>
  </div>
</template>

<style scoped lang="scss">
@use '@/styles/variables.scss' as *;

.data-table-pagination {
  min-width: 0;
  max-width: 100%;
  display: flex;
  justify-content: flex-end;
  margin-top: 16px;

  &__mobile {
    display: none;
  }

  @media (max-width: 900px) {
    justify-content: stretch;
    margin-top: 12px;

    &__desktop {
      display: none;
    }

    &__mobile {
      display: flex;
      width: 100%;
      align-items: center;
      justify-content: flex-end;
      gap: 7px;
    }

    &__summary {
      margin-right: auto;
      font-size: 12px;
      color: $text-secondary;
      white-space: nowrap;
    }

    &__button {
      min-width: 58px;
      height: 44px;
      padding: 0 10px;
      border: 1px solid $line-strong;
      border-radius: $radius-xs;
      background: $bg-paper;
      color: $text-primary;
      font-size: 12px;
      cursor: pointer;
      touch-action: manipulation;

      &:disabled {
        border-color: $border-color;
        background: $color-neutral-bg;
        color: $text-disabled;
        cursor: not-allowed;
      }
    }

    &__current {
      min-width: 42px;
      text-align: center;
      font-size: 12px;
      font-weight: 600;
      color: $text-primary;
      font-variant-numeric: tabular-nums;
      white-space: nowrap;
    }
  }
}
</style>
