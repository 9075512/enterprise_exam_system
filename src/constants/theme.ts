/**
 * 主题色板常量（与 src/styles/variables.scss 同源）。
 *
 * 用途：JS/TS 中需要色值的场景（ECharts 配置、内联 style、状态映射表等），
 * 避免在脚本里硬编码 hex，做到「SCSS token 与 JS 常量」双份但同源。
 *
 * 约定：任何新增色值必须同时补到 variables.scss 与本文件，保持两边一致。
 *      护栏见 src/constants/theme.test.ts（逐值比对）。
 */

export const THEME = {
  /** 业务分类与多指标图表配色，和状态色保持独立。 */
  categoryBlue: '#2563EB', categoryBlueSoft: '#EFF5FF',
  categoryTeal: '#00AAB5', categoryTealSoft: '#EFFBFC',
  categoryViolet: '#773CFF', categoryVioletSoft: '#F5F1FF',
  categoryAmber: '#F29309', categoryAmberSoft: '#FFF8EF',
  /** 管理端主色：蓝色操作 */
  primary: '#2563EB',
  primaryLight: '#6692F1',
  primaryDark: '#1D4ED8',
  /** Element Plus light-9 浅底 */
  primary50: '#E9EFFD',
  /** 主色浅底（选中/标签/信息块，等价 $color-primary-soft） */
  primarySoft: '#EFF5FF',
  /** 主色描边（浅底配套） */
  primaryBorder: '#BFD1F8',
  /** 分类色 —— 仅用于题型编码（考试作答页题型徽标 / 答题卡分组点），不参与状态表达 */
  secondary: '#7C3AED',
  /** 分类色浅底（替代 rgba(...) 硬编码透明度） */
  secondarySoft: '#F5F3FF',

  /**
   * 语义色（三件套：底 / 描边 / 文本）。
   * ⚠️ 原色（success/warning/error/info）仅用于「图形」——进度条、圆点、图标、表意符号；
   *    任何「文字」必须用 -Text 档（700 档，对白底 ≥ 4.5:1 达 WCAG AA 正文）。
   */
  success: '#12B76A', // 2.24:1 仅图形
  successBg: '#ECFDF3',
  successBorder: '#A6F4C5',
  successText: '#027A48', // 5.41:1 ✅
  warning: '#F79009', // 2.03:1 仅图形
  warningBg: '#FFFAEB',
  warningBorder: '#FEDF89',
  warningText: '#B54708', // 5.43:1 ✅
  error: '#F04438', // 3.44:1 仅图形
  errorBg: '#FEF3F2',
  errorBorder: '#FECDCA',
  errorText: '#B42318', // 6.57:1 ✅
  info: '#2E90FA', // 3.29:1 仅图形
  infoBg: '#EFF8FF',
  infoBorder: '#B2DDFF',
  infoText: '#175CD3', // 5.99:1 ✅
  /** 信息色 50 号浅底（等价 infoBg，保留旧名） */
  info50: '#EFF8FF',

  /** 文本 */
  textPrimary: '#172338',
  /** 设计稿 text-2 档：表格正文 / 表单标签 / 次按钮字色（$text-body 同源） */
  textBody: '#39485E',
  textSecondary: '#66758A',
  /** 禁用/已结束等弱化文本（图形档，禁止承载正文） */
  textDisabled: '#858F9E',
  /** 全局描边（$border-color 同源） */
  border: '#E7EBF2',
  /** 强发丝线：输入框边 / 表头分隔（$line-strong 同源） */
  lineStrong: '#DFE5EE',
  /** 承载面（$bg-paper 同源）—— JS 侧需要白底时用它，如图表提示框 */
  surface: '#FFFFFF',
  /** 行 hover 底（$color-table-hover 同源） */
  tableHover: '#F6F9FF',
  /** 中性浅底（中性标签底 / 中性块，$color-neutral-bg 同源） */
  neutralBg: '#F1F3F6',
} as const;

/** 色板键类型 */
export type ThemeColor = keyof typeof THEME;
