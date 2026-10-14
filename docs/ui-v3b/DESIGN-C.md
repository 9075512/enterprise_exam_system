# 方向 C · 精密蓝 — 设计规范与落地清单

> 原型：`index.html#c/*`（登录 / 仪表盘 / 考试管理 / 组卷编辑 / 考生答题，截图 `_shot/c-*.png`）
> 定稿时间：2026-10-14。本文取代 v3.0「卷面」方向稿（docs/ui-v3/，仅存档）。

---

## 1. 设计主张

**精密蓝：让界面像一台校准过的仪器。**

管理端的核心劳动是「看表、填表、比对数字」。C 方向的一切决策都为信息效率服务：

- **发丝线代替阴影做层次**——卡片边界用 1px 发丝线，零投影。阴影让界面「飘」，线条让界面「稳」。
- **高密度但不拥挤**——表格行高 38px，页面内距 22px，一屏多看 20% 的行。
- **电光蓝只做「可点」的表达**——主色 `#0B5BFF` 出现即意味着「这里可以操作」，状态表达全部交给语义色三件套。
- **石墨侧栏**——`#0B0F19` 比纯黑柔和、比藏蓝中性，让内容区成为唯一的视觉主角。

与被否掉的 v3.0「卷面」对照：无纸墨质感、无衬线、无直角；与 v2.2「冷静蓝」对照：更密、更冷、更克制。

---

## 2. Token 全表（实测对比度）

### 2.1 色彩

| Token | 值 | 用途 | 对比度 |
| --- | --- | --- | --- |
| `--primary` | `#0B5BFF` | 主按钮 / 链接 / 选中 / 批量条 | 白字 5.31:1 ✅ 作文字 5.31:1 ✅ |
| `--primary-h` | `#0949CC` | 主按钮 hover（= EP dark-2） | 白字 6.9:1 |
| `--primary-soft` | `#EDF3FF` | 选中底 / 信息块底 | — |
| `--primary-line` | `#BFD4FF` | 选中描边 / 图表浅柱 | — |
| `--app-bg` | `#F7F8FA` | 页面底 | — |
| `--surface` | `#FFFFFF` | 卡片 / 面板 | — |
| `--surface-2` | `#FAFBFC` | 表头底 / hover 行 | — |
| `--surface-3` | `#F1F3F6` | 进度条槽 / seg 底 | — |
| `--line` | `#E9ECF1` | 发丝线（行分隔、卡片边） | 仅图形 |
| `--line-strong` | `#D9DEE7` | 输入框边 / 表头分隔 | 仅图形 |
| `--text-1` | `#0D1220` | 标题 / 正文强调 | 18.7:1 ✅ |
| `--text-2` | `#3D4657` | 正文 | 9.5:1 ✅ |
| `--text-3` | `#5A6474` | 弱文字 / 表头 / 说明 | 6.0:1 ✅ |
| `--icon` | `#858F9E` | **仅图形**（图标 / 占位符） | 3.27:1（过 WCAG 非文字 3:1）|
| `--side-bg` | `#0B0F19` | 石墨侧栏 | — |
| `--side-text` | `#9AA5B8` | 侧栏文字 | 7.7:1 ✅ |
| `--side-active` | `rgba(11,91,255,.16)` | 选中项底 | 白字 19.2:1 |

语义色三件套（**沿 v2.2 铁律：原色只作图形，文字一律用 `-t` 档**）：

| 语义 | 原色（图形） | 浅底 | 描边 | 文字（≥4.5:1） |
| --- | --- | --- | --- | --- |
| success | `#12B76A` | `#ECFDF3` | `#A6F4C5` | `#027A48` 5.41:1 |
| warning | `#F79009` | `#FFFAEB` | `#FEDF89` | `#B54708` 5.43:1 |
| error | `#F04438` | `#FEF3F2` | `#FECDCA` | `#B42318` 6.57:1 |
| info | `#2E90FA` | `#EFF8FF` | `#B2DDFF` | `#175CD3` 5.99:1 |

> 与 v2.2 的差异仅在数值档位（绿 `#16A34A`→`#12B76A` 等），**三件套结构与使用规则不变**，护栏测试的断言逻辑可以原样沿用。

### 2.2 几何

| Token | 值 | 说明 |
| --- | --- | --- |
| 圆角·卡片 | `8px` | 上限。禁止再出现 14/20px 大圆角 |
| 圆角·控件 | `6px` | 按钮 / 输入 / 下拉 |
| 圆角·小件 | `4px` | checkbox / tag / 进度条 |
| 行高（表格） | `38px` | ≈ EP `--table-cell-padding-y: 7px` |
| 控件高 | `32px` | 按钮 / 输入（EP small 偏大，需覆盖） |
| 页面内距 | `22px` | 现为 24~28px |
| 侧栏宽 | `216px` | 现 232px |
| 顶栏高 | `52px` | 现 60px |
| 投影 | **无** | 仅浮层（弹窗 / 下拉）保留 `0 10px 24px -8px rgba(13,18,32,.16)` |

### 2.3 字体

界面文字无衬线（`-apple-system / PingFang SC / Microsoft YaHei`），**数字 tabular-nums 无衬线**（v3.0 的衬线数字废弃）。标题 `-0.01em` 字距，语义标签用 `10.5px / 600 / .11em / 大写`（表头、分组标签）。

---

## 3. 层次手法（三条铁律）

1. **线条优先**：卡片 = 白底 + 1px `--line`，无投影。需要强调层次时加深线条（`--line-strong`），不许加阴影。
2. **左缘蓝条做行级焦点**：表格行 hover / 当前选中记录 → `inset 2px 0 0 var(--primary)`。这是 C 的签名动作，替代背景色变化，扫读时更精准。
3. **蓝色只表达「可操作」**：链接、按钮、选中态、批量条。状态一律语义色，分类色（题型）仍走 §2.5 分类色例外，不外溢。

---

## 4. 落地清单（管理端 `src/`）

> 目标：改 3 个文件全站换肤，再补护栏断言。**不新建文件、不动业务组件结构。**

### 4.1 `src/styles/variables.scss`（约 15 处值替换）

```scss
// 主色
$color-primary: #0B5BFF;
$color-primary-light: #548CFF;      // = EP light-3
$color-primary-dark: #0949CC;       // = EP dark-2
$color-primary-50: #E7EFFF;         // light-9
$color-primary-soft: #EDF3FF;
$color-primary-border: #BFD4FF;

// 背景
$bg-page: #F7F8FA;
$bg-paper: #FFFFFF;

// 文本
$text-primary: #0D1220;
$text-secondary: #5A6474;           // 弱文字档（原 #64748B）
$text-disabled: #858F9E;            // 图形档，禁止承载正文

// 边框 / 圆角 / 阴影
$border-color: #E9ECF1;
$radius-base: 8px;
$radius-sm: 6px;
$shadow-card: none;                 // C 方向卡片零投影
$shadow-sm: none;
$shadow-md: 0 4px 10px -4px rgba(13,18,32,.10);
$shadow-lg: 0 10px 24px -8px rgba(13,18,32,.16);   // 仅浮层
$radius-lg: 10px;
$radius-xl: 12px;

// 表格
$color-table-head: #FAFBFC;         // 发丝线表头，去灰底块
$color-table-hover: #FAFBFD;

// 品牌渐变（登录页品牌区保留）
$gradient-brand: linear-gradient(135deg, #0b5bff 0%, #0949cc 100%);

// 深色侧栏 → 石墨
$sidebar-bg: #0B0F19;
$sidebar-text: #9AA5B8;
$sidebar-text-hover: #F4F7FB;
$sidebar-text-active: #ffffff;
$sidebar-hover-bg: rgba(255,255,255,.05);
$sidebar-active-bg: rgba(11,91,255,.16);
$sidebar-border: rgba(255,255,255,.06);
$sidebar-width: 216px;
$sidebar-width-collapsed: 60px;
```

不变：语义色三件套变量名、`$color-secondary` 分类色（题型）、`$header-height` 可暂留 60px（顶栏高度涉及布局，第二批再动）。

### 4.2 `src/styles/element/index.scss`（3 处）

```scss
$colors: (
  'primary': ('base': #0b5bff),      // ← 必须同步，否则两个主色并存（v2.2 踩过）
  'success': ('base': #027a48),
  'warning': ('base': #b45309),
  'danger':  ('base': #b42318),
  'error':   ('base': #b42318),
  'info':    ('base': #175cd3),
),
$border-radius: (
  'base': 8px,      // ← 10px → 8px
  'small': 6px,     // ← 8px → 6px
  'round': 20px, 'circle': 100%,
),
```

### 4.3 `src/styles/index.scss` `:root` 区块（全量重算主色阶梯）

```scss
--el-color-primary: #0b5bff;
--el-color-primary-light-3: #548cff;
--el-color-primary-light-5: #85adff;
--el-color-primary-light-7: #b6ceff;
--el-color-primary-light-8: #cedeff;
--el-color-primary-light-9: #e7efff;
--el-color-primary-dark-2: #0949cc;
--el-bg-color-page: #f7f8fa;
--el-fill-color-light: #f1f3f6;
--el-text-color-primary: #0d1220;
--el-text-color-regular: #5a6474;
--el-border-color: #e9ecf1;
--table-cell-padding-y: 7px;   // 舒适 ≈ 38px 行高（原 8px≈40）；紧凑档仍 4px
```

另需三处小改：`.el-card` 去 `box-shadow`（若全局有）只留 `border-color: $border-color`；表格 hover 行加 `box-shadow: inset 2px 0 0 var(--el-color-primary)`（注意用 `td.el-table__cell` 高优先级写法）；滚动条 thumb `#858F9E`。

### 4.4 `src/styles/globalStyle.test.ts` 新增护栏断言（4 条）

1. **主色唯一**：业务层与样式层不得再出现 `#2563eb|#1d4ed8|rgba(37,99,235`（styles/ 是 token 源除外，沿用既有豁免规则）。
2. **卡片零投影**：`$shadow-card` / `$shadow-sm` 必须为 `none`（防回退成 v2.2 阴影）。
3. **圆角上限**：`$radius-lg ≤ 10px`、`$radius-xl ≤ 12px`，业务层不得出现 `border-radius: 1[4-9]px|2[0-9]px`。
4. **icon 档禁作文字**：`#858F9E` 只允许出现在 color-scheme 图形上下文（对 `color:` 属性做反查，豁免 `border-*` 与 svg fill）。

### 4.5 顺序与验收

1. 4.1 → 4.3 一次性提交，`npm run dev` 全站肉眼过一遍重点页（登录 / 仪表盘 / 考试列表 / 设置）。
2. **EP 内部样式必须 CDP 实测计算值**（v2.1 教训）：主按钮圆角 8px、表格行高 38、hover 左蓝条。
3. 跑 `vitest` 全量护栏；跑 `npx vite build --outDir dist-verify --emptyOutDir false`（本机 `dist/` 批量删除保护坑）。
4. 验收红线：全站无第二个主色；卡片无阴影；语义色文字全部 `-t` 档；数字 tabular-nums。

### 4.6 不在本次范围

- **练题端 `practice-web/`**：独立 token 体系（`$practice-primary #1d4ed8`）。C 是否跟进另评估——若跟进，同源改 `$practice-primary → #0B5BFF` 并同步 `element/index.scss`，工期约 1 天。
- 顶栏高度 52px、侧栏折叠宽 60px：涉及布局组件尺寸，建议第二批与「表头大写字距标签」一起做。
- 图表配色（趋势图浅柱 = `--primary-line`）：涉及 ECharts 主题文件，单独一版。

---

## 5. 风险与回退

| 风险 | 缓解 |
| --- | --- |
| EP 阶梯手算错档 | 已按 `mix(white, base, 30/50/70/80/90%)` 与 dark-2 `mix(black, base, 20%)` 精确计算（见 §4.3），与 `@forward` 编译结果一致 |
| 行高 38px 触发密度护栏断言 | `--table-cell-padding-y` 是唯一调节点，护栏按变量驱动校验，改值不破坏断言 |
| 40+ 页面中存在硬编码 v2.2 色值 | 4.4-1 的反查断言会全部暴露；预计集中在 charts/与少量 inline 样式 |
| 回退 | 三文件均为纯值替换，`git revert` 单提交即可整体回滚 |
