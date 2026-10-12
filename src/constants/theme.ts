/**
 * 主题色板常量（与 src/styles/variables.scss 同源）。
 *
 * 用途：JS/TS 中需要色值的场景（ECharts 配置、内联 style、状态映射表等），
 * 避免在脚本里硬编码 hex，做到「SCSS token 与 JS 常量」双份但同源。
 *
 * 约定：任何新增色值必须同时补到 variables.scss 与本文件，保持两边一致。
 */

export const THEME = {
  /** 主色 */
  primary: '#2563EB',
  primaryLight: '#60A5FA',
  primaryDark: '#1D4ED8',
  /** 主色 50 号浅底（选中/渐变背景） */
  primary50: '#EEF2FF',
  /** 辅助色 */
  secondary: '#7C3AED',

  /** 语义色 */
  success: '#16A34A',
  warning: '#F59E0B',
  error: '#DC2626',
  info: '#0EA5E9',
  /** 信息色 50 号浅底 */
  info50: '#F0F9FF',

  /** 文本 */
  textPrimary: '#0F172A',
  textSecondary: '#64748B',
  /** 禁用/已结束等弱化文本 */
  textDisabled: '#94A3B8',
} as const;

/** 色板键类型 */
export type ThemeColor = keyof typeof THEME;
