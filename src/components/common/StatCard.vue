<script setup lang="ts">
/**
 * 统计卡（v3.1 方向 C，设计稿 `.stat`）—— 左缘 2px 主色条 + 26px 图标块 + 大数字。
 *
 * 考生考试端 4 处复用（首页 / 我的成绩 / 我的补考 / 消息中心）；
 * 管理端 DashboardPage 为同视觉的内联实现（同一套 token，改一处需同改另一处）。
 *
 * `tone` 支持业务分类色与独立状态色；数字与文案使用文本 token，
 * 分类色用于浅底、左缘条及图标，不替代成功、警告、异常语义。
 */
import type { Component } from 'vue';

withDefaults(
  defineProps<{
    label: string;
    value: string | number;
    /** 数字后缀单位（场 / 分 / 项 …），12→13px 弱色 */
    unit?: string;
    icon?: Component;
    /** 状态色或业务分类色；默认 primary */
    tone?: 'primary' | 'success' | 'warning' | 'error' | 'blue' | 'teal' | 'violet' | 'amber';
    /** 页面空间紧张时使用紧凑版，不影响默认统计卡尺寸 */
    density?: 'default' | 'compact';
  }>(),
  { unit: '', icon: undefined, tone: 'primary', density: 'default' },
);
</script>

<template>
  <el-card class="stat-card" :class="[`stat-card--${tone}`, `stat-card--${density}`]" shadow="never">
    <span class="stat-card__rule" aria-hidden="true" />
    <div class="stat-card__top">
      <span v-if="icon" class="stat-card__icon">
        <el-icon><component :is="icon" /></el-icon>
      </span>
      <span class="stat-card__label">{{ label }}</span>
    </div>
    <div class="stat-card__value">
      {{ value }}<span v-if="unit" class="stat-card__unit">{{ unit }}</span>
    </div>
    <div v-if="$slots.foot" class="stat-card__foot">
      <slot name="foot" />
    </div>
  </el-card>
</template>

<style scoped lang="scss">
@use '@/styles/variables.scss' as *;

.stat-card {
  position: relative;
  overflow: hidden;
  border-radius: $radius-base;

  &__rule {
    position: absolute;
    inset: 0 auto 0 0;
    width: 2px;
    background: $color-primary;
  }

  &__top {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  &__icon {
    display: grid;
    place-items: center;
    flex: 0 0 26px;
    width: 26px;
    height: 26px;
    border-radius: $radius-xs;
    background: $color-primary-soft;
    color: $color-primary;
    font-size: 15px;
  }

  &__label {
    font-size: 12px;
    font-weight: 600;
    color: $text-secondary;
  }

  &__value {
    overflow-wrap: anywhere;
    margin-top: 8px;
    font-size: 28px;
    font-weight: 700;
    line-height: 1.3;
    letter-spacing: -0.02em;
    color: $text-primary;
    font-variant-numeric: tabular-nums;
  }

  &__unit {
    margin-left: 3px;
    font-size: 13px;
    font-weight: 600;
    color: $text-secondary;
  }

  &__foot {
    margin-top: 7px;
    font-size: 12px;
    color: $text-secondary;

    a {
      color: $color-primary;
    }
  }

  /* 状态色调：左缘条与图标块同步换色（文字色保持文本档） */
  &--warning {
    .stat-card__rule {
      background: $color-warning;
    }

    .stat-card__icon {
      background: $color-warning-bg;
      color: $color-warning-text;
    }
  }

  &--success {
    .stat-card__rule {
      background: $color-success;
    }

    .stat-card__icon {
      background: $color-success-bg;
      color: $color-success-text;
    }
  }

  &--error {
    .stat-card__rule {
      background: $color-error;
    }

    .stat-card__icon {
      background: $color-error-bg;
      color: $color-error-text;
    }
  }
}

/* 比全局视觉层多一级选择器，确保仅显式 compact 的页面能够可靠收紧尺寸。 */
.stat-card.stat-card.stat-card--compact {
  min-height: 88px;

  :deep(.el-card__body) {
    padding: 10px 14px;
  }

  .stat-card__top { gap: 9px; }
  .stat-card__icon { flex-basis: 32px; width: 32px; height: 32px; font-size: 18px; }
  .stat-card__value { margin-top: 5px; font-size: 26px; line-height: 1.2; }
  .stat-card__label { font-size: 12.5px; }
  .stat-card__foot { margin-top: 4px; font-size: 11px; line-height: 1.4; }
}
</style>
