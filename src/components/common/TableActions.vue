<script setup lang="ts">
/** 列表行操作：常用操作直接展示，次要操作由具名插槽放入菜单。 */
import { ArrowDown } from '@element-plus/icons-vue';

withDefaults(defineProps<{ loading?: boolean }>(), { loading: false });
</script>

<template>
  <div class="table-actions">
    <slot />
    <el-dropdown v-if="$slots.more" trigger="click" placement="bottom-end" :disabled="loading">
      <el-button link :loading="loading" aria-label="更多操作">
        更多<el-icon><ArrowDown /></el-icon>
      </el-button>
      <template #dropdown>
        <el-dropdown-menu class="table-actions-menu">
          <slot name="more" />
        </el-dropdown-menu>
      </template>
    </el-dropdown>
  </div>
</template>
