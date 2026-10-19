<script setup lang="ts">
/**
 * 空态（内部 el-empty），支持「清空筛选 + 主操作」双出路（设计规范 §9.2）。
 *
 * - 纯文案（既有页面，保持兼容）：`<EmptyState text="暂无数据" />`
 * - 筛选造成的空：`<EmptyState filtered text="没有匹配的用户" action-text="新建用户"
 *   @clear="onReset" @action="openCreate" />`
 *
 * 约定：`filtered` 为真时默认显示「清空筛选」；真·无数据时只给主操作（引导用户新建），
 * 避免对着一个空库点「清空筛选」。
 */
import { computed } from 'vue';
import type { Component } from 'vue';
import { Files, Plus, Refresh } from '@element-plus/icons-vue';

const props = withDefaults(
  defineProps<{
    text?: string;
    description?: string;
    /** 空态由筛选条件造成 —— 决定提示语口径与「清空筛选」的出现 */
    filtered?: boolean;
    /** 是否显示「清空筛选」；不传则跟随 filtered */
    showClear?: boolean;
    clearText?: string;
    /** 主操作文案；为空则不显示主按钮 */
    actionText?: string;
    actionIcon?: Component;
    /** 空态图形尺寸（v3.1 方向 C：默认 42px 圆形图标，见 DESIGN-C §2.3） */
    imageSize?: number;
    icon?: Component;
  }>(),
  {
    text: '暂无数据',
    description: '',
    filtered: false,
    showClear: undefined,
    clearText: '清空筛选',
    actionText: '',
    actionIcon: Plus,
    imageSize: 42,
    icon: Files,
  },
);

const emit = defineEmits<{ clear: []; action: [] }>();

/** showClear 未显式传入时跟随 filtered */
const showClearButton = computed(() => props.showClear ?? props.filtered);
</script>

<template>
  <el-empty class="empty-state" :description="description || text" :image-size="imageSize">
    <!-- v3.1 方向 C：以 42px 圆形图标取代 el-empty 默认插画（更轻、不抢视线） -->
    <template #image>
      <span class="empty-state__icon" aria-hidden="true">
        <el-icon><component :is="icon" /></el-icon>
      </span>
    </template>
    <div v-if="showClearButton || actionText || $slots.default" class="empty-state__actions">
      <el-button v-if="showClearButton" :icon="Refresh" @click="emit('clear')">
        {{ clearText }}
      </el-button>
      <slot>
        <el-button v-if="actionText" type="primary" :icon="actionIcon" @click="emit('action')">
          {{ actionText }}
        </el-button>
      </slot>
    </div>
  </el-empty>
</template>

<style scoped lang="scss">
@use '@/styles/variables.scss' as *;

.empty-state {
  &__icon {
    display: grid;
    place-items: center;
    width: 42px;
    height: 42px;
    border-radius: 50%;
    background: $color-neutral-bg;
    color: $text-disabled;
    font-size: 19px;
  }

  &__actions {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 8px;
    margin-top: 4px;
  }

  /* 文案收细：设计稿用 12.5px 弱色，el-empty 默认 14px 偏重 */
  :deep(.el-empty__description) {
    margin-top: 6px;

    p {
      font-size: 12.5px;
      color: $text-secondary;
    }
  }
}
</style>
