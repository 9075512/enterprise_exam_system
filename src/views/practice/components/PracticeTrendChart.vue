<script setup lang="ts">
/**
 * 练题端 · 趋势图（纯 SVG 手写，**不引入任何图表库**，避免增大公网包体）。
 *
 * 双指标：柱 = 当日练题量；折线 + 圆点 = 当日正确率（0~100%）。
 * 配色走 v3.1 方向 C 单一主色系：柱=实色主色、折线=主色浅档虚线（靠线型而非第二色区分），
 * 网格为发丝线。不使用红绿涨跌色，也不借语义色当数据系列色（DESIGN-C §2.5）。
 */
import { computed } from 'vue';
import type { PracticeTrendPoint } from '@/types';

const props = defineProps<{ points: PracticeTrendPoint[] }>();

/* 画布几何（viewBox 坐标系） */
const W = 320;
const H = 148;
const PAD_TOP = 12;
const PAD_BOTTOM = 22;
const PAD_LEFT = 6;
const PAD_RIGHT = 6;

const plotW = W - PAD_LEFT - PAD_RIGHT;
const plotH = H - PAD_TOP - PAD_BOTTOM;

const maxDone = computed<number>(() => Math.max(1, ...props.points.map((p) => p.doneCount)));

/** 单根柱宽（留 35% 间隙；点数多时自动收窄） */
const barW = computed<number>(() => Math.max(2, (plotW / Math.max(1, props.points.length)) * 0.62));

interface Bar {
  x: number;
  y: number;
  w: number;
  h: number;
  point: PracticeTrendPoint;
}

/** 柱体几何 */
const bars = computed<Bar[]>(() => {
  const n = props.points.length;
  if (n === 0) return [];
  const step = plotW / n;
  return props.points.map((p, i) => {
    const h = p.doneCount === 0 ? 0 : Math.max(2, (p.doneCount / maxDone.value) * plotH);
    return {
      x: PAD_LEFT + step * i + (step - barW.value) / 2,
      y: PAD_TOP + plotH - h,
      w: barW.value,
      h,
      point: p,
    };
  });
});

/** 正确率折线（无作答的点不连线） */
const linePoints = computed<string>(() => {
  const n = props.points.length;
  if (n === 0) return '';
  const step = plotW / n;
  const segs: string[] = [];
  props.points.forEach((p, i) => {
    if (p.doneCount === 0) return;
    const cx = PAD_LEFT + step * i + step / 2;
    const cy = PAD_TOP + plotH - (p.accuracy / 100) * plotH;
    segs.push(`${cx.toFixed(1)},${cy.toFixed(1)}`);
  });
  return segs.join(' ');
});

interface Dot {
  cx: number;
  cy: number;
  key: string;
  accuracy: number;
}

/** 折线圆点 */
const dots = computed<Dot[]>(() => {
  const n = props.points.length;
  if (n === 0) return [];
  const step = plotW / n;
  return props.points
    .map((p, i) => ({
      cx: PAD_LEFT + step * i + step / 2,
      cy: PAD_TOP + plotH - (p.accuracy / 100) * plotH,
      key: p.date,
      accuracy: p.accuracy,
      doneCount: p.doneCount,
    }))
    .filter((d) => d.doneCount > 0);
});

/** 网格线 y（0% / 50% / 100%） */
const gridYs = computed<number[]>(() => [
  PAD_TOP,
  PAD_TOP + plotH / 2,
  PAD_TOP + plotH,
]);

/** x 轴标签：仅显示首 / 中 / 末，避免移动端拥挤 */
const xLabels = computed<Array<{ x: number; text: string }>>(() => {
  const n = props.points.length;
  if (n === 0) return [];
  const step = plotW / n;
  const idxs = n <= 2 ? props.points.map((_, i) => i) : [0, Math.floor((n - 1) / 2), n - 1];
  return [...new Set(idxs)].map((i) => ({
    x: PAD_LEFT + step * i + step / 2,
    text: props.points[i].date.slice(5),
  }));
});

const hasData = computed<boolean>(() => props.points.some((p) => p.doneCount > 0));
</script>

<template>
  <div class="trend">
    <svg class="trend__svg" :viewBox="`0 0 ${W} ${H}`" role="img" aria-label="近期练题量与正确率趋势">
      <!-- 网格 -->
      <line
        v-for="y in gridYs"
        :key="`g-${y}`"
        :x1="PAD_LEFT"
        :x2="W - PAD_RIGHT"
        :y1="y"
        :y2="y"
        class="trend__grid"
        stroke-width="1"
      />

      <!-- 柱：当日练题量 -->
      <rect
        v-for="bar in bars"
        :key="`b-${bar.point.date}`"
        :x="bar.x"
        :y="bar.y"
        :width="bar.w"
        :height="bar.h"
        rx="1.5"
        class="trend__bar"
      />

      <!-- 折线：当日正确率 -->
      <polyline
        v-if="linePoints"
        :points="linePoints"
        class="trend__line"
        stroke-width="1.6"
        stroke-linejoin="round"
        stroke-linecap="round"
      />

      <!-- 圆点 -->
      <circle
        v-for="dot in dots"
        :key="`d-${dot.key}`"
        :cx="dot.cx"
        :cy="dot.cy"
        r="2.4"
        class="trend__dot"
        stroke-width="1.4"
      />

      <!-- x 轴标签 -->
      <text
        v-for="label in xLabels"
        :key="`x-${label.text}`"
        :x="label.x"
        :y="H - 6"
        text-anchor="middle"
        font-size="9"
        class="trend__axis-label"
      >
        {{ label.text }}
      </text>
    </svg>

    <div class="trend__legend">
      <span class="trend__legend-item">
        <i class="trend__swatch trend__swatch--bar" aria-hidden="true" />
        练题量（最高 {{ maxDone }} 题）
      </span>
      <span class="trend__legend-item">
        <i class="trend__swatch trend__swatch--line" aria-hidden="true" />
        正确率
      </span>
    </div>

    <p v-if="!hasData" class="trend__empty">该区间暂无练题记录</p>
  </div>
</template>

<style scoped lang="scss">
@use '@/styles/variables.scss' as *;

.trend {
  &__svg {
    display: block;
    width: 100%;
    height: auto;
  }

  // SVG 上色走 CSS 类（模板属性无法引用 SCSS 变量）
  &__grid {
    stroke: $border-color;
  }

  /* 柱 = 练题量（主体，实色主色） */
  &__bar {
    fill: $practice-primary;
  }

  /* 折线 = 正确率（辅助，主色浅档 + 虚线；靠线型而非第二色区分，DESIGN-C §2.5） */
  &__line {
    fill: none;
    stroke: $practice-primary-light;
    stroke-dasharray: 4 3;
  }

  &__dot {
    fill: $bg-paper;
    stroke: $practice-primary-light;
  }

  &__axis-label {
    fill: $text-secondary;
  }

  &__legend {
    display: flex;
    flex-wrap: wrap;
    gap: 14px;
    margin-top: 8px;
    font-size: 12px;
    color: $text-secondary;
  }

  &__legend-item {
    display: inline-flex;
    align-items: center;
    gap: 5px;
  }

  &__swatch {
    display: inline-block;
    width: 10px;
    height: 10px;
    border-radius: 2px;

    &--bar {
      background: $practice-primary;
    }

    &--line {
      height: 2px;
      border-radius: 1px;
      background: $practice-primary-light;
    }
  }

  &__empty {
    margin: 6px 0 0;
    font-size: 12px;
    color: $text-secondary;
  }
}
</style>
