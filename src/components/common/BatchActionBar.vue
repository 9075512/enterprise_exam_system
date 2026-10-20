<script setup lang="ts">
/**
 * 批量操作条（设计规范 §8.3 / §9.2）。
 *
 * 表格勾选后从工具条下方滑出：blue-50 底 + blue-200 边，
 * 左「已选 N 项」、中批量动作（默认插槽）、右「取消选择」。
 *
 * 用法：
 * ```vue
 * <BatchActionBar :count="selection.length" noun="条公告" @clear="clearSelection">
 *   <el-button @click="run('enable')">批量上线</el-button>
 *   <el-button type="danger" plain @click="run('delete')">批量删除</el-button>
 * </BatchActionBar>
 * ```
 * `count` 为 0 时不渲染（内部自带 transition，父级无需再判断）。
 */
withDefaults(
  defineProps<{
    /** 已选数量；为 0 时不渲染 */
    count: number;
    /** 量词，如「条公告」「道试题」 */
    noun?: string;
    disabled?: boolean;
  }>(),
  { noun: '项' },
);

const emit = defineEmits<{ clear: [] }>();
</script>

<template>
  <transition name="batch-bar">
    <div v-if="count > 0" class="batch-bar" role="region" aria-label="批量操作">
      <span class="batch-bar__count" aria-live="polite">
        已选 <strong class="batch-bar__num">{{ count }}</strong> {{ noun }}
      </span>
      <div class="batch-bar__actions">
        <slot />
      </div>
      <el-button class="batch-bar__clear" link :disabled="disabled" @click="emit('clear')">取消选择</el-button>
    </div>
  </transition>
</template>

<style scoped lang="scss">
@use '@/styles/variables.scss' as *;

.batch-bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
  min-height: 44px;
  margin-bottom: 12px;
  padding: 9px 14px;
  border: 1px solid $color-primary-border;
  border-radius: $radius-base;
  background-color: $color-primary-soft;
}

.batch-bar__count {
  flex: none;
  font-size: 13px;
  color: $text-primary;
}

.batch-bar__num {
  font-weight: 600;
  color: $color-primary-dark;
  font-variant-numeric: tabular-nums;
}

.batch-bar__actions {
  display: flex;
  flex: 1 1 240px;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.batch-bar__clear {
  flex: none;
  margin-left: auto;
  color: $text-secondary;
}

/* 滑出：高度 + 位移 + 淡入（规范 §9.2「勾选后滑出」） */
.batch-bar-enter-active,
.batch-bar-leave-active {
  overflow: hidden;
  transition:
    opacity $transition-base,
    transform $transition-base,
    max-height $transition-base,
    margin-bottom $transition-base;
}

.batch-bar-enter-from,
.batch-bar-leave-to {
  max-height: 0;
  margin-bottom: 0;
  opacity: 0;
  transform: translateY(-6px);
}

.batch-bar-enter-to,
.batch-bar-leave-from {
  max-height: 96px;
  margin-bottom: 12px;
  opacity: 1;
  transform: translateY(0);
}
</style>
