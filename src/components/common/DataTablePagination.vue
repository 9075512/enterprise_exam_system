<script setup lang="ts">
/** 表格分页（el-pagination 封装，每页条数默认取系统设置） */
import { computed, onMounted } from 'vue';
import { PAGE_SIZE_MAX } from '@/constants';
import { useSettingsStore } from '@/stores/settings';

const settingsStore = useSettingsStore();

const props = defineProps<{ total: number; page: number; pageSize: number; pageSizes?: number[] }>();

onMounted(() => {
  void settingsStore.load();
});

/** 每页条数候选：由 [10, 设置默认值, 50, PAGE_SIZE_MAX] 去重并升序得到 */
const sizeOptions = computed<number[]>(() => {
  const base = props.pageSizes ?? [10, settingsStore.settings.defaultPageSize, 50, PAGE_SIZE_MAX];
  return [...new Set(base)].sort((a, b) => a - b);
});

const emit = defineEmits<{
  (e: 'update:page', value: number): void;
  (e: 'update:pageSize', value: number): void;
}>();

function handleCurrentChange(value: number): void {
  emit('update:page', value);
}

function handleSizeChange(value: number): void {
  emit('update:pageSize', value);
}
</script>

<template>
  <div class="data-table-pagination">
    <el-pagination
      background
      layout="total, sizes, prev, pager, next, jumper"
      :total="props.total"
      :current-page="props.page"
      :page-size="props.pageSize"
      :page-sizes="sizeOptions"
      @current-change="handleCurrentChange"
      @size-change="handleSizeChange"
    />
  </div>
</template>

<style scoped lang="scss">
.data-table-pagination {
  display: flex;
  justify-content: flex-end;
  margin-top: 16px;
}
</style>
