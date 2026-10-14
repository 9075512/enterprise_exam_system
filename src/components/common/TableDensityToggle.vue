<script setup lang="ts">
/**
 * 表格密度切换（设计规范 §8.3 / §9.2）—— 放在列表页工具条右端。
 *
 * 两段式开关：舒适（行高 48）/ 紧凑（行高 40）。状态存 app store，
 * 跨会话记忆；实际生效点是 `styles/index.scss` 的 `html[data-density]` 作用域，
 * 只调表格行高节奏，不顺带改字号或主题。
 *
 * 为什么不用下拉：只有两个互斥选项，两段开关一步可达且状态常显，
 * 比「点开下拉 → 看当前值 → 选另一个」少一次交互。
 */
import { storeToRefs } from 'pinia';
import { useAppStore, type TableDensity } from '@/stores/app';

const appStore = useAppStore();
const { tableDensity } = storeToRefs(appStore);

const OPTIONS: ReadonlyArray<{ value: TableDensity; label: string; hint: string }> = [
  { value: 'default', label: '舒适', hint: '舒适：行高 48px' },
  { value: 'compact', label: '紧凑', hint: '紧凑：行高 40px，一屏多看几行' },
];
</script>

<template>
  <div class="density-toggle" role="group" aria-label="表格密度">
    <button
      v-for="opt in OPTIONS"
      :key="opt.value"
      type="button"
      class="density-toggle__item"
      :class="{ 'is-active': tableDensity === opt.value }"
      :aria-pressed="tableDensity === opt.value"
      :title="opt.hint"
      @click="appStore.setTableDensity(opt.value)"
    >
      {{ opt.label }}
    </button>
  </div>
</template>

<style scoped lang="scss">
@use '@/styles/variables.scss' as *;

// 总高 32，与工具条里的 el-button / el-select 齐平
.density-toggle {
  display: inline-flex;
  align-items: center;
  flex: none;
  padding: 1px;
  border: 1px solid $border-color;
  border-radius: $radius-sm;
  background-color: $bg-page;
}

.density-toggle__item {
  height: 28px;
  padding: 0 10px;
  border: none;
  border-radius: 6px;
  background-color: transparent;
  font-family: inherit;
  font-size: 12.5px;
  line-height: 1;
  color: $text-secondary;
  cursor: pointer;
  transition:
    color $transition-fast,
    background-color $transition-fast;

  &:hover {
    color: $text-primary;
  }

  &:focus-visible {
    outline: 2px solid $color-primary;
    outline-offset: 1px;
  }

  // 选中态用「白底 + 主色字 + 微阴影」，不靠纯色块表达，避免与主按钮抢视线
  &.is-active {
    background-color: $bg-paper;
    color: $color-primary-dark;
    font-weight: 500;
    box-shadow: $shadow-sm;
  }
}
</style>
