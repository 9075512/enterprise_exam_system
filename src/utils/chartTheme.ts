/**
 * ECharts 通用主题片段（v3.1 方向 C「精密蓝」，DESIGN-C §2 / §3）。
 *
 * 为什么要有这个文件：
 * ECharts 的默认主题是「灰网格 + 深灰字 + 白底圆角提示框 + 阴影」，与方向 C 的
 * 「发丝线、零投影、克制的单色图表」冲突。此前各页面只给 series 换颜色，
 * 轴/网格/提示框仍是默认样式，导致图表看着像「贴上去的第三方控件」。
 *
 * 约定：
 * - 所有色值只能来自 `constants/theme.ts`（与 variables.scss 同源），禁止就地写 hex；
 * - 色值分两类用途：①「区分并列数据系列」只能用主色系（CHART_ACCENT / CHART_SOFT，
 *   或主色浅档），禁止借语义色当系列色——绿=success 的语义会被误读成"第二条线"；
 *   ②「表达状态 / 警示」的图形（如错题率告警柱）才可用语义色。
 *   文字类（轴标签、轴名、提示框文字）必须用达 AA 的文本档。
 * - 用法：把片段展开进 option，例如
 *     tooltip: { trigger: 'axis', ...CHART_TOOLTIP }
 *     xAxis: { type: 'category', data, axisLabel: { ...CHART_AXIS_LABEL } }
 */
import { THEME } from '@/constants/theme';

/** 轴刻度标签（弱文字档 #5A6474，对白底 6.0:1） */
export const CHART_AXIS_LABEL = {
  color: THEME.textSecondary,
  fontSize: 11,
} as const;

/** 轴名（如「及格率」「人数」） */
export const CHART_AXIS_NAME = {
  color: THEME.textSecondary,
  fontSize: 11,
} as const;

/** 网格分割线：发丝线，弱到只做定位参考 */
export const CHART_SPLIT_LINE = {
  lineStyle: { color: THEME.border },
} as const;

/** 轴线（x 轴基线）：比分割线明确一档 */
export const CHART_AXIS_LINE = {
  lineStyle: { color: THEME.lineStrong },
} as const;

/** 图例：圆点 + 弱文字档（设计稿的图例标记是圆点，非 ECharts 默认的方形/菱形块） */
export const CHART_LEGEND = {
  icon: 'circle',
  textStyle: { color: THEME.textSecondary, fontSize: 11.5 },
  itemWidth: 10,
  itemHeight: 10,
  itemGap: 14,
} as const;

/**
 * 提示框：白底 + 发丝线描边 + 浮层投影。
 * 投影只在这里出现（与弹窗/下拉同档），图表本体与卡片保持零投影。
 */
export const CHART_TOOLTIP = {
  backgroundColor: THEME.surface,
  borderColor: THEME.border,
  borderWidth: 1,
  padding: [8, 10],
  textStyle: { color: THEME.textPrimary, fontSize: 12 },
  extraCssText: 'border-radius:8px;box-shadow:0 10px 24px -8px rgba(13,18,32,.16);',
} as const;

/** 聚焦柱 / 折线用主色 */
export const CHART_ACCENT = THEME.primary;
/** 非聚焦柱：浅主色（设计稿 CSS 变量 `--primary-line`，与 $color-primary-border 同值） */
export const CHART_SOFT = THEME.primaryBorder;

/** 取最大值首次出现的下标（空数组返回 -1） */
export function peakIndex(values: number[]): number {
  if (values.length === 0) return -1;
  return values.indexOf(Math.max(...values));
}

/**
 * 柱状数据「浅柱 + 聚焦柱」着色：默认全部浅主色，仅高亮项用主色。
 *
 * 对应设计稿的 `.ch-bar` / `.ch-bar--on`——一眼定位峰值，
 * 而不是一片同色柱子让读者自己找最大值（DESIGN-C §3 铁律 2 的柱状版表达）。
 */
export function softBars(values: number[], highlightIndex: number) {
  return values.map((value, index) => ({
    value,
    itemStyle: { color: index === highlightIndex ? CHART_ACCENT : CHART_SOFT },
  }));
}
