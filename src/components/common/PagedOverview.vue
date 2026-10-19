<script setup lang="ts" generic="T">
import ResponsivePagination from '@/components/common/ResponsivePagination.vue';
import { computed, ref, watch } from 'vue';

/** Overview lists stay short; the complete ordered list is browsed in a paged dialog. */
const props = withDefaults(defineProps<{
  items: readonly T[];
  title: string;
  limit?: number;
  pageSize?: number;
}>(), { limit: 5, pageSize: 10 });

const visible = ref(false);
const page = ref(1);
const preview = computed(() => props.items.slice(0, props.limit));
const offset = computed(() => (page.value - 1) * props.pageSize);
const paged = computed(() => props.items.slice(offset.value, offset.value + props.pageSize));
watch(() => props.items.length, () => {
  page.value = Math.min(page.value, Math.max(1, Math.ceil(props.items.length / props.pageSize)));
});
function open(): void {
  page.value = 1;
  visible.value = true;
}
</script>

<template>
  <div class="paged-overview">
    <div class="paged-overview__preview">
      <slot :items="preview" :offset="0" />
    </div>
    <div v-if="items.length > limit" class="paged-overview__more">
      <el-button link type="primary" :aria-label="`查看更多${title}`" @click="open">
        查看更多（共 {{ items.length }} 条）
      </el-button>
    </div>
    <el-dialog v-model="visible" :title="title" width="760px" append-to-body destroy-on-close>
      <div class="paged-overview__all">
        <slot :items="paged" :offset="offset" />
      </div>
      <template #footer>
        <ResponsivePagination
          v-model:current-page="page"
          :total="items.length"
          :page-size="pageSize"
          :pager-count="5"
          layout="total, prev, pager, next"
          aria-label="列表分页"
        />
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.paged-overview {
  min-width: 0;
}
.paged-overview__more {
  display: flex;
  justify-content: center;
  padding: 10px 0;
}
.el-pagination {
  justify-content: center;
  flex-wrap: wrap;
  gap: 8px;
}
@media (max-width: 600px) {
  .el-pagination {
    flex-wrap: nowrap;
    gap: 4px;
  }
  :deep(.el-pagination__total) {
    display: none;
  }
}
</style>
