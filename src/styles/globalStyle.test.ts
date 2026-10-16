/**
 * 全局样式护栏测试（对应 docs/ui-v2.1/管理端设计规范-v2.1.md §3 / §8.3 / §12）
 *
 * 目的：把「数字统一 tabular-nums」从一句规范落成可执行断言。
 * 数字承载组件（表格 / 分页 / 进度 / 统计 / 数字输入 / 日期选择 / 徽标）
 * 一旦有人删掉这条全局规则，这里立即失败——避免分数、条数、页码
 * 在刷新/翻页时因字形宽度变化而整行跳动。
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// 注：jsdom 环境下 import.meta.url 非 file 协议，按项目根（vitest cwd）解析。
const STYLE_PATH = resolve(process.cwd(), 'src/styles/index.scss');
const rawScss = readFileSync(STYLE_PATH, 'utf8');

// 归一化：去掉注释与 SCSS 插值 `#{...}`，
// 否则 `#{$var}` 里的花括号会破坏朴素的规则块解析。
const scss = rawScss
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/\/\/[^\n]*/g, '')
  .replace(/#\{[^}]*\}/g, '0');

/**
 * 断言某个选择器所在的规则块（支持逗号分组）启用了 tabular-nums。
 * 用括号配对定位规则块，避免被嵌套规则干扰。
 */
function usesTabularNums(selector: string): boolean {
  let idx = 0;
  while ((idx = scss.indexOf(selector, idx)) !== -1) {
    // 选择器必须是独立的（前一字符是空白/逗号/行首/}）
    const before = scss[idx - 1];
    const isBoundary = idx === 0 || /[\s,}]/.test(before ?? '');
    if (!isBoundary) {
      idx += selector.length;
      continue;
    }
    const braceOpen = scss.indexOf('{', idx);
    if (braceOpen === -1) break;
    // 选择器列表区间内不得越过其它 `{`（即中间不能夹别的规则）
    const between = scss.slice(idx, braceOpen);
    if (between.includes('}') || between.length > 400) {
      idx += selector.length;
      continue;
    }
    // 括号配对取规则体
    let depth = 0;
    let end = -1;
    for (let i = braceOpen; i < scss.length; i += 1) {
      if (scss[i] === '{') depth += 1;
      else if (scss[i] === '}') {
        depth -= 1;
        if (depth === 0) {
          end = i;
          break;
        }
      }
    }
    if (end === -1) break;
    const body = scss.slice(braceOpen + 1, end);
    if (/font-variant-numeric\s*:\s*tabular-nums/.test(body)) return true;
    idx = end;
  }
  return false;
}

describe('全局样式 · 数字等宽（tabular-nums）护栏', () => {
  // 必须在全局规则里统一覆盖的数字承载组件
  const NUMERIC_COMPONENTS = [
    '.el-table',
    '.el-pagination',
    '.el-progress__text',
    '.el-statistic__number',
    '.el-input-number',
    '.el-date-editor',
    '.el-badge__content',
  ];

  it.each(NUMERIC_COMPONENTS)('%s 启用 tabular-nums', (sel) => {
    expect(usesTabularNums(sel)).toBe(true);
  });

  it('业务数字工具类 .num 启用 tabular-nums', () => {
    expect(usesTabularNums('.num')).toBe(true);
  });
});

describe('全局样式 · 无障碍护栏', () => {
  it('提供 prefers-reduced-motion 降级（设计规范 §10 验收项）', () => {
    expect(scss).toMatch(/@media\s*\(prefers-reduced-motion:\s*reduce\)/);
  });

  it('降级规则用非零时长，保留 transitionend/animationend 事件', () => {
    // 用 0.001ms 而非 0：既视觉上取消动效，又不让依赖过渡结束的逻辑失效
    expect(scss).toMatch(/transition-duration:\s*0\.001ms/);
    expect(scss).toMatch(/animation-duration:\s*0\.001ms/);
  });
});

/**
 * 批量操作条视觉护栏（设计规范 §8.3：blue-50 底 + blue-200 边、勾选后滑出）。
 * 把「必须用主色浅底 token、禁止硬编码与渐变」落成断言——有人改回十六进制或渐变即失败。
 */
describe('组件样式 · 批量操作条护栏', () => {
  const batchBarSource = readFileSync(
    resolve(process.cwd(), 'src/components/common/BatchActionBar.vue'),
    'utf8',
  )
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\n]*/g, '');

  it('底色与描边走主色浅底 token', () => {
    expect(batchBarSource).toMatch(/background-color:\s*\$color-primary-soft/);
    expect(batchBarSource).toMatch(/border:\s*1px\s+solid\s+\$color-primary-border/);
  });

  it('不硬编码十六进制色值、不使用渐变（v2.1 起去渐变改实色）', () => {
    expect(batchBarSource).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(batchBarSource).not.toMatch(/linear-gradient/);
  });

  it('勾选后滑出：保留 max-height 过渡与 reduce-motion 兼容的 transition 写法', () => {
    expect(batchBarSource).toMatch(/\.batch-bar-enter-from/);
    expect(batchBarSource).toMatch(/max-height:\s*0/);
    expect(batchBarSource).toMatch(/\$transition-base/);
  });

  it('数量数字用 tabular-nums，翻页/勾选变化时不跳字宽', () => {
    expect(batchBarSource).toMatch(/font-variant-numeric:\s*tabular-nums/);
  });
});

/**
 * 表格密度护栏（设计规范 §8.3：行高 40 舒适 / 32 紧凑，CDP 实测值见迁移清单进度）。
 * 两条关键约束：
 * 1) 密度只通过一个 CSS 变量调节行高节奏，不得顺带改字号或颜色（否则像换了主题）；
 * 2) 该变量必须落成 `td/th.el-table__cell` 高优先级选择器——只写 `.el-table .el-table__cell`
 *    会与 Element Plus 自带规则同优先级，按注入顺序被覆盖，表现为「点了紧凑没反应」。
 */
describe('全局样式 · 表格密度护栏', () => {
  const densityBlockBody = /html\[data-density=['"]compact['"]\]\s*\{([^}]*)\}/.exec(scss)?.[1] ?? '';

  it('行高由 --table-cell-padding-y 变量驱动，而非写死 padding', () => {
    expect(scss).toMatch(/--table-cell-padding-y:\s*7px/);
    expect(scss).toMatch(/padding:\s*var\(--table-cell-padding-y,\s*7px\)\s*0/);
  });

  it('内距规则用 td/th.el-table__cell，优先级压过 Element Plus 原生规则', () => {
    expect(scss).toMatch(
      /td\.el-table__cell,\s*th\.el-table__cell\s*\{[^}]*var\(--table-cell-padding-y/,
    );
  });

  it('紧凑作用域挂在 html[data-density="compact"] 上', () => {
    expect(densityBlockBody).not.toBe('');
  });

  it('紧凑态只调行高变量，不碰字号与颜色', () => {
    expect(densityBlockBody).toMatch(/--table-cell-padding-y:\s*4px/);
    expect(densityBlockBody).not.toMatch(/font-size|color\s*:/);
  });
});

/**
 * 全站色值合规护栏（设计规范 §2.1 单一主色 / §2.5 分类色边界）。
 *
 * v2.2 合规审计发现的三类「规范外」实现，这里全部落成断言：
 * 1) 品牌渐变曾混入 indigo-600 / violet-600（蓝紫），与「冷静蓝」冲突；
 * 2) #EEF2FF 属 indigo-50，不在规范 10 档之内；
 * 3) 视图层散落硬编码主色 rgba(37, 99, 235, …)，绕过 token 会失去统一改色能力。
 * 注意：`.test.ts` 自身要写这些字面量做反例，故扫描时排除测试文件。
 */
describe('全站色值 · 合规护栏', () => {
  const ROOT = resolve(process.cwd(), 'src');
  const stripComments = (s: string) =>
    s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

  function collect(dir: string, out: string[] = []): string[] {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        collect(full, out);
      } else if (/\.(vue|scss)$/.test(entry.name) || (entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts'))) {
        out.push(full);
      }
    }
    return out;
  }
  const files = collect(ROOT);

  it('品牌渐变是同色系蓝，不含 indigo / violet 混色', () => {
    const vars = stripComments(readFileSync(resolve(ROOT, 'styles/variables.scss'), 'utf8'));
    const gradient = /\$gradient-brand\s*:\s*([^;]+);/.exec(vars)?.[1] ?? '';
    expect(gradient).not.toBe('');
    expect(gradient).not.toMatch(/#4f46e5|#7c3aed/i);
    // v3.1 方向 C：渐收取 主色 #0B5BFF → dark-2 #0949CC
    expect(gradient).toMatch(/#0b5bff/i);
    expect(gradient).toMatch(/#0949cc/i);
  });

  it('规范外色值 #EEF2FF（indigo-50）不出现在任何样式文件', () => {
    const offenders = files.filter((f) => /#EEF2FF/i.test(stripComments(readFileSync(f, 'utf8'))));
    expect(offenders).toEqual([]);
  });

  it('视图层不硬编码主色 rgba(37, 99, 235, …)，一律走 rgba($color-primary, …)', () => {
    const offenders = files.filter((f) =>
      /rgba\(\s*37\s*,\s*99\s*,\s*235/.test(stripComments(readFileSync(f, 'utf8'))),
    );
    expect(offenders).toEqual([]);
  });
});

/**
 * v3.1 方向 C「精密蓝」换肤护栏（DESIGN-C §4.4）。
 *
 * 锁住 C 的视觉契约，防止后续被悄悄改回 v2.2：
 * 1) 主色唯一 —— v2.2 的 #2563eb / #1d4ed8 / rgba(37,99,235) 不得再出现在业务层；
 * 2) 卡片零投影 —— $shadow-card / $shadow-sm 必须为 none（层次交给发丝线）；
 * 3) 圆角上限 —— $radius-lg ≤ 10px、$radius-xl ≤ 12px，业务层不得出现 14px+ 圆角；
 * 4) icon 图形档 #858F9E 不得承载文字。
 * 注：styles/ 是 token 源与 EP 覆盖层，豁免「业务层硬编码 hex」类检查。
 */
describe('全站样式 · v3.1 方向 C 护栏', () => {
  const ROOT = resolve(process.cwd(), 'src');
  const stripComments = (s: string) =>
    s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

  function collect(dir: string, out: string[] = []): string[] {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        collect(full, out);
      } else if (/\.(vue|scss)$/.test(entry.name) || (entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts'))) {
        out.push(full);
      }
    }
    return out;
  }

  const files = collect(ROOT);
  /** 业务层 = 排除 styles/ 的源码（styles/ 是 token 源，允许出现 token 字面量） */
  const businessFiles = files.filter((f) => !/[\\/]styles[\\/]/.test(f));
  const vars = stripComments(readFileSync(resolve(ROOT, 'styles/variables.scss'), 'utf8'));

  it('主色唯一：业务层不再出现 v2.2 主色 #2563eb / #1d4ed8 / rgba(37, 99, 235)', () => {
    const offenders = businessFiles.filter((f) =>
      /#2563eb|#1d4ed8|rgba\(\s*37\s*,\s*99\s*,\s*235/i.test(stripComments(readFileSync(f, 'utf8'))),
    );
    expect(offenders).toEqual([]);
  });

  it('卡片零投影：$shadow-card 与 $shadow-sm 必须为 none', () => {
    expect(vars).toMatch(/\$shadow-card\s*:\s*none/);
    expect(vars).toMatch(/\$shadow-sm\s*:\s*none/);
  });

  it('圆角有上限：$radius-lg ≤ 8px、$radius-xl ≤ 12px（卡片 8px、控件 6px）', () => {
    const px = (name: string) => {
      const m = new RegExp(`\\$${name}\\s*:\\s*(\\d+)px`).exec(vars);
      expect(m, `variables.scss 缺少 $${name}`).not.toBeNull();
      return Number(m?.[1]);
    };
    expect(px('radius-base')).toBeLessThanOrEqual(8);
    expect(px('radius-sm')).toBeLessThanOrEqual(6);
    // v3.1 方向 C §2.4：卡片圆角上限 8px，$radius-lg 不再是 10px 这一档
    expect(px('radius-lg')).toBeLessThanOrEqual(8);
    expect(px('radius-xl')).toBeLessThanOrEqual(12);
  });

  it('业务层不出现 14px 及以上大圆角（v2.2 的 $radius-lg: 14px 回归即失败；行内 radius-exception 标记豁免）', () => {
    const offenders = businessFiles.filter((f) =>
      readFileSync(f, 'utf8')
        .split('\n')
        .some(
          // 行级判定：剥行内注释后匹配，但含 radius-exception 标记的行豁免
          // （与练题端 styleGuard 同语义；品牌徽标等 logo 圆角语言走标记豁免）
          (line) =>
            !line.includes('radius-exception') &&
            /border-radius\s*:\s*(1[4-9]|[2-9]\d)px/.test(line.replace(/\/\/.*$/, '')),
        ),
    );
    expect(offenders).toEqual([]);
  });

  it('icon 图形档 #858F9E 不得作为文字色（负向后顾排除 border-color 等复合属性）', () => {
    const offenders = businessFiles.filter((f) =>
      /(?<![-\w])color\s*:[^;{}]*#858F9E/i.test(stripComments(readFileSync(f, 'utf8'))),
    );
    expect(offenders).toEqual([]);
  });
});

/**
 * v3.1 方向 C 第二批：布局尺寸 + 表头标签化护栏（DESIGN-C §2.2 / §2.3）。
 *
 * 第一批只换了色彩 token，第二批动的是「骨架尺寸」与「表头形态」——
 * 这两类改动一旦被回退，视觉上不报错、只是「变得不像设计稿」，很难被发现，
 * 所以同样落成断言：
 * 1) 骨架尺寸走 token（顶栏 52 / 侧栏折叠 60 / 页面内距 22），不许在布局组件里写死 px；
 * 2) 表头是「小号 + 加字距 + 大写 + 弱文字色 + 强发丝线分隔」，不是加重底色块；
 * 3) EP 覆盖必须抬优先级（双写类名），否则会被懒加载分包的 EP 样式按注入顺序吃掉。
 */
describe('全站样式 · v3.1 方向 C 布局与表头护栏', () => {
  const varsSource = readFileSync(resolve(process.cwd(), 'src/styles/variables.scss'), 'utf8');
  const layoutSource = readFileSync(resolve(process.cwd(), 'src/layouts/AppLayout.vue'), 'utf8');

  const VARS: Array<[string, number]> = [
    ['header-height', 56],
    ['sidebar-width', 216],
    ['sidebar-width-collapsed', 60],
    ['page-padding', 24],
  ];

  it.each(VARS)('骨架尺寸 $%s 取设计稿值 %spx', (name, px) => {
    expect(varsSource).toMatch(new RegExp(`\\$${name}\\s*:\\s*${px}px`));
  });

  it('布局组件用 token 而非硬编码 px 表达骨架尺寸', () => {
    expect(layoutSource).toMatch(/height:\s*\$header-height/);
    expect(layoutSource).toMatch(/padding:\s*\$page-padding/);
    // 顶栏与内容区左内距同源，保证面包屑与页面标题落在同一条竖轴上
    expect(layoutSource).toMatch(/padding:\s*0\s*\$page-padding/);
  });

  it('表头「标签化」：小号 + 加字距 + 大写 + 弱文字色 + 强发丝线分隔', () => {
    const header = /\.el-table\.el-table th\.el-table__cell[^{]*\{([^}]*)\}/.exec(scss)?.[1] ?? '';
    expect(header).not.toBe('');
    expect(header).toMatch(/font-size:\s*12px/);
    expect(header).toMatch(/letter-spacing:\s*0?\.0[3-9]em/);
    expect(header).toMatch(/text-transform:\s*uppercase/);
    expect(header).toMatch(/color:\s*\$text-secondary/);
    expect(header).toMatch(/border-bottom:\s*1px solid \$line-strong/);
  });

  it('覆盖 EP 内部样式一律双写类名抬优先级（防注入顺序翻车）', () => {
    expect(scss).toMatch(/\.el-table\.el-table th\.el-table__cell/);
    expect(scss).toMatch(/\.el-card\.el-card/);
    expect(scss).toMatch(/\.el-button\.el-button/);
  });
});

/**
 * v3.1 方向 C 第三批：页面结构级对齐护栏（DESIGN-C §2.1 / §2.3 / §2.4）。
 *
 * 前两批锁的是 token 值与骨架尺寸；第三批动的是「业务页面的表达方式」——
 * 这类改动最容易被后续开发按旧习惯写回去，因此同样落成断言：
 * 1) 统计卡统一主色（四色图标是 v2.2 旧语言，分类色不得外溢到统计卡）；
 * 2) 科室对比用「表格 + 内联进度条」而非双轴柱状图（一屏即可横向比较）；
 * 3) 空态用 42px 圆形图标 + 弱色文案，不回到 el-empty 默认大插画。
 */
describe('全站样式 · v3.1 方向 C 页面结构护栏', () => {
  const readSrc = (rel: string) => readFileSync(resolve(process.cwd(), 'src', rel), 'utf8');

  const dashboard = readSrc('views/admin/DashboardPage.vue');
  const report = readSrc('views/admin/ScoreReportPage.vue');
  const emptyState = readSrc('components/common/EmptyState.vue');
  const batchBar = readSrc('components/common/BatchActionBar.vue');

  it('统计卡统一主色：图标不得内联四色，且保留左缘主色条', () => {
    expect(dashboard).not.toMatch(/color:\s*card\.color/);
    expect(dashboard).not.toMatch(/backgroundColor:\s*`\$\{card\.color\}/);
    expect(dashboard).toMatch(/class="stat-card__rule"/);
    const icon = /&__icon\s*\{([^}]*)\}/.exec(dashboard)?.[1] ?? '';
    expect(icon).toMatch(/background:\s*\$color-primary-soft/);
    expect(icon).toMatch(/color:\s*\$color-primary/);
  });

  it('科室对比是「表格 + 内联进度条」，不再有双轴柱状图 option', () => {
    expect(report).not.toMatch(/departmentOption/);
    expect(report).not.toMatch(/departmentChartRef/);
    expect(report).toMatch(/class="report-page__rate"/);
    expect(report).toMatch(/class="report-page__rate-bar"/);
  });

  it('空态是 42px 圆形图标 + 弱色文案（不回到 el-empty 默认插画）', () => {
    expect(emptyState).toMatch(/imageSize:\s*42/);
    expect(emptyState).toMatch(/empty-state__icon/);
    const icon = /&__icon\s*\{([^}]*)\}/.exec(emptyState)?.[1] ?? '';
    expect(icon).toMatch(/background:\s*\$color-neutral-bg/);
    expect(icon).toMatch(/color:\s*\$text-disabled/);
  });

  it('批量操作条圆角取卡片档 8px（与设计稿 .batch 一致）', () => {
    const bar = /\.batch-bar\s*\{([^}]*)\}/.exec(batchBar)?.[1] ?? '';
    expect(bar).toMatch(/border-radius:\s*\$radius-base/);
    expect(bar).toMatch(/padding:\s*9px 14px/);
  });
});

/**
 * v3.1 方向 C 收尾：图表配色护栏（DESIGN-C §2.5 单一主色）。
 *
 * 图表最容易「顺手引入第二个颜色」——因为 ECharts 的 series 各写各的 color，
 * 没有 token 约束，一条绿线看着也"挺清楚"。但语义绿（success）一旦当系列色，
 * 就会把「绿色 = 正常/达标」的状态语义泄漏到「第二条数据」上，读者会误读。
 * 这里把两条铁律落成断言：
 * 1) 并列数据系列只用主色系（主色 / 主色浅档）+ 线型区分，禁止借语义色当系列色；
 * 2) 图表主题只向 series 暴露主色系常量（accent / soft）。
 */
describe('全站样式 · v3.1 方向 C 图表配色护栏', () => {
  const readSrc = (rel: string) => readFileSync(resolve(process.cwd(), 'src', rel), 'utf8');
  const dashboard = readSrc('views/admin/DashboardPage.vue');
  const chartTheme = readSrc('utils/chartTheme.ts');

  it('成绩趋势使用蓝与青绿区分指标，并保留实线/虚线区分', () => {
    expect(dashboard).not.toMatch(/THEME\.success/);
    expect(dashboard).toMatch(/itemStyle:\s*\{\s*color:\s*THEME\.categoryTeal\s*\}/);
    expect(dashboard).toMatch(/lineStyle:\s*\{[^}]*type:\s*'dashed'/);
  });

  it('图表主题把主色系收敛为可复用常量（accent / soft），不导出语义色给系列', () => {
    expect(chartTheme).toMatch(/CHART_ACCENT\s*=\s*THEME\.primary/);
    expect(chartTheme).toMatch(/CHART_SOFT\s*=\s*THEME\.primaryBorder/);
    expect(chartTheme).not.toMatch(/CHART_\w*\s*=\s*THEME\.(success|warning|error|info)\b/);
  });
});

/**
 * v3.1 方向 C 第四批：高频组件刻度护栏（DESIGN-C §2.3 / §2.4）。
 *
 * 这批改的是「每页都会出现的组件」——提示条、页头、卡片、图表图例。
 * 其中提示条同时修掉了一处真实合规缺陷：EP 的 el-alert 默认把语义**原色**
 * 当文字色（warning #F79009 = 2.03:1、error #F04438 = 3.44:1），全都不达 AA。
 * 这类问题肉眼看不出来（颜色本来就"对"），只有断言能防回归。
 */
describe('全站样式 · v3.1 方向 C 组件刻度护栏', () => {
  const scss = readFileSync(resolve(process.cwd(), 'src/styles/index.scss'), 'utf8');
  const pageHeader = readFileSync(resolve(process.cwd(), 'src/components/common/PageHeader.vue'), 'utf8');
  const chartTheme = readFileSync(resolve(process.cwd(), 'src/utils/chartTheme.ts'), 'utf8');

  it.each(['info', 'success', 'warning', 'error'])(
    '提示条 --%s 的文字色是语义深字档（EP 默认用原色，不达 AA）',
    (type) => {
      const block =
        new RegExp(`\\.el-alert\\.el-alert--${type}\\.is-light\\s*\\{([^}]*)\\}`).exec(scss)?.[1] ?? '';
      expect(block).not.toBe('');
      expect(block).toContain(`$color-${type}-text`);
      // 同一块内 desc 也要跟着深字档
      expect(block).toMatch(new RegExp(`\\.el-alert__description\\s*\\{\\s*color:\\s*\\$color-${type}-text`));
    },
  );

  it('提示条形态对齐设计稿 .tip（10px 12px 内距 + 6px 圆角 + 12.5px 正文）', () => {
    // 注：块提取用 [^}]* 会在 Sass 插值 `#{$radius-sm}` 的右花括号处提前截断，
    // 故这里对全文匹配（值都唯一，不会误命中）。
    expect(scss).toMatch(/--el-alert-padding:\s*10px 12px/);
    expect(scss).toMatch(/--el-alert-border-radius-base:\s*#\{\$radius-sm\}/);
    expect(scss).toMatch(/--el-alert-title-font-size:\s*12\.5px/);
  });

  it('页头刻度：22px 标题 / 底部对齐 / 12px 描述', () => {
    expect(pageHeader).toMatch(/align-items:\s*flex-end/);
    expect(pageHeader).toMatch(/font-size:\s*22px/);
    expect(pageHeader).toMatch(/letter-spacing:\s*-0\.01em/);
    expect(pageHeader).toMatch(/font-size:\s*12px/);
  });

  it('卡片刻度：内容内距 20px + 卡头 56px / 16px 20px / 15px 标题', () => {
    expect(scss).toMatch(/--el-card-padding:\s*20px/);
    const header = /\.el-card__header\s*\{([^}]*)\}/.exec(scss)?.[1] ?? '';
    expect(header).not.toBe('');
    expect(header).toMatch(/min-height:\s*56px/);
    expect(header).toMatch(/padding:\s*16px 20px/);
    expect(header).toMatch(/font-size:\s*15px/);
  });

  it('图表图例标记是圆点（ECharts 默认方块/菱形与设计稿不符）', () => {
    expect(chartTheme).toMatch(/icon:\s*'circle'/);
  });

  it('小按钮档对齐设计稿 .btn--sm：28px 高 / 12px / 4px 圆角（EP 的 small 只有 24px）', () => {
    const block = /\.el-button\.el-button--small\s*\{([^}]*)\}/.exec(scss)?.[1] ?? '';
    expect(block).not.toBe('');
    expect(block).toMatch(/height:\s*28px/);
    expect(block).toMatch(/font-size:\s*12px/);
    expect(block).toMatch(/border-radius:\s*\$radius-xs/);
  });
});

/**
 * v3.1 方向 C 第五批：表单控件族刻度护栏（DESIGN-C §2.3 / §2.4）。
 *
 * 这批改的是「每个表单/列表都会出现」的 EP 原生控件——页签、分页、复选、单选、
 * 开关、步骤条、进度条。与 EP 默认差异最大的是页签（40→39px 高、14→13px 字、
 * 非选中由深色改弱色）与分页（EP 只染文字，设计稿是主色实底）。
 * 另有一条反查：EP 的进度条轨道色不是 CSS 变量，写 --el-progress-bg-color 是无效的，
 * 必须直接覆盖 .el-progress-bar__outer —— 断言禁止回退到无效写法。
 */
describe('全站样式 · v3.1 方向 C 表单控件族护栏', () => {
  const scss = readFileSync(resolve(process.cwd(), 'src/styles/index.scss'), 'utf8');
  const settings = readFileSync(resolve(process.cwd(), 'src/views/admin/SettingsPage.vue'), 'utf8');

  it('页签刻度：39px 高 / 13px / 非选中弱色 / 选中主色加粗', () => {
    expect(scss).toMatch(/--el-tabs-header-height:\s*39px/);

    const item = /\.el-tabs__item\s*\{([^}]*)\}/.exec(scss)?.[1] ?? '';
    expect(item).not.toBe('');
    expect(item).toMatch(/font-size:\s*13px/);
    expect(item).toMatch(/font-weight:\s*500/);
    expect(item).toMatch(/color:\s*\$text-secondary/);
    expect(item).not.toMatch(/font-weight:\s*600/);

    expect(scss).toMatch(/&\.is-active\s*\{\s*color:\s*\$color-primary;\s*font-weight:\s*600/);
  });

  it('页签底线是 1px 发丝线（EP 默认 2px）', () => {
    expect(scss).toMatch(/\.el-tabs__nav-wrap::after\s*\{[^}]*height:\s*1px/);
  });

  it('页签刻度只在全局定义，页面不得再局部覆盖 el-tabs__item', () => {
    expect(settings).not.toMatch(/el-tabs__item/);
    expect(settings).not.toMatch(/el-tabs__active-bar/);
  });

  it('分页：选中态是主色实底 + 白字（EP 默认只染文字色）', () => {
    const active = /\.el-pager li\.is-active\s*\{([^}]*)\}/.exec(scss)?.[1] ?? '';
    expect(active).not.toBe('');
    expect(active).toMatch(/background-color:\s*\$color-primary/);
    expect(active).toMatch(/color:\s*#fff/);
    expect(scss).toMatch(/--el-pagination-button-height:\s*27px/);
  });

  it('复选 / 单选：15px 方框 + 3.5px 圆角 + 1.5px 发丝描边', () => {
    expect(scss).toMatch(/--el-checkbox-input-height:\s*15px/);
    expect(scss).toMatch(/--el-checkbox-border-radius:\s*3\.5px/);
    expect(scss).toMatch(/--el-checkbox-input-border:\s*1\.5px solid #\{\$line-strong\}/);
    expect(scss).toMatch(/--el-radio-input-height:\s*15px/);
    expect(scss).toMatch(/--el-radio-input-border:\s*1\.5px solid #\{\$line-strong\}/);
  });

  it('开关：开=主色、关=强发丝线（与设计稿同源）', () => {
    expect(scss).toMatch(/--el-switch-on-color:\s*#\{\$color-primary\}/);
    expect(scss).toMatch(/--el-switch-off-color:\s*#\{\$line-strong\}/);
  });

  it('步骤条：21px 圆形序号 + 12.5px 标签', () => {
    expect(scss).toMatch(/\.el-steps\.el-steps\s*\{\s*\.el-step__icon\s*\{[^}]*width:\s*21px/);
    expect(scss).toMatch(/\.el-steps\.el-steps\s*\{\s*[\s\S]*?\.el-step__title\s*\{[^}]*font-size:\s*12\.5px/);
  });

  it('进度条轨道用中性底，且不得回退到无效的 --el-progress-bg-color', () => {
    expect(scss).toMatch(
      /\.el-progress\.el-progress \.el-progress-bar__outer\s*\{[^}]*background-color:\s*\$color-neutral-bg/,
    );
    expect(scss).not.toMatch(/--el-progress-bg-color/);
  });
});

/**
 * v3.1 方向 C 考试端换肤护栏（DESIGN-C §2.1 / §2.5 / §4.4）。
 *
 * 考试端此前一直停在 v2.x：左缘 3px 强调条、卡片投影、语义原色当文字色、
 * 硬编码装饰色散落各页。这批按设计稿逐页重排后，把三条最容易悄悄回退的
 * 契约落成断言（都是「反查式」——扫源码找违规字面量，而不是断言某处写了什么）：
 * 1) 无 3px 强调条 —— 方向 C 的行焦点语言是「左缘 2px 实心条 / inset 描边」，
 *    v2.x 的 3px 左缘+渐变条一律不得回归（含侧栏，侧栏改用右缘主色圆点）；
 * 2) 考试端零投影 —— 除浮层（`$shadow-lg`）与内嵌发丝线（`inset`）外，
 *    考试端页面不得出现任何 box-shadow；
 * 3) 统计卡（StatCard）契约 —— 左缘 2px + 26px 图标块 + 主色软底，
 *    tone 只换左缘与图标块，文字保持文本档（防语义原色当文字色回退）。
 * 注：扫描排除 `*.test.ts` 自身（本文件要写违规字面量做反例）。
 */
describe('全站样式 · v3.1 方向 C 考试端换肤护栏', () => {
  const stripComments = (s: string) =>
    s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

  function collect(dir: string, out: string[] = []): string[] {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        collect(full, out);
      } else if (/\.(vue|scss)$/.test(entry.name) && !entry.name.endsWith('.test.ts')) {
        out.push(full);
      }
    }
    return out;
  }

  // 业务层 = 排除 styles/（styles/ 是 token 源与 EP 覆盖层：
  // index.scss 的 `.rich-text blockquote` 就是一条「发丝色」引用条，不是强调条）
  const businessFiles = collect(resolve(process.cwd(), 'src')).filter(
    (f) => !/[\\/]styles[\\/]/.test(f),
  );

  it('业务层不再出现 v2.x 的 3px 左缘/顶缘强调条', () => {
    const offenders = businessFiles.filter((f) =>
      /border-(?:left|top)\s*:\s*3px|box-shadow\s*:\s*inset\s+3px/.test(stripComments(readFileSync(f, 'utf8'))),
    );
    expect(offenders).toEqual([]);
  });

  it('侧栏选中项用「主色软底 + 右缘 5px 圆点」，不是左缘 3px 条', () => {
    const layout = stripComments(readFileSync(resolve(process.cwd(), 'src/layouts/AppLayout.vue'), 'utf8'));
    const active = /&\.is-active\s*\{([\s\S]*?)\n\s{4}\}/.exec(layout)?.[1] ?? '';
    expect(active).not.toBe('');
    expect(active).toMatch(/background:\s*\$sidebar-active-bg/);
    expect(active).toMatch(/&::after\s*\{[\s\S]*?width:\s*5px/);
    expect(active).toMatch(/border-radius:\s*50%/);
    expect(active).not.toMatch(/&::before/);
  });

  it('考试端零投影：只允许浮层 $shadow-lg 与 inset 发丝线', () => {
    const examFiles = collect(resolve(process.cwd(), 'src/views/exam'));
    const offenders: string[] = [];
    for (const f of examFiles) {
      const src = stripComments(readFileSync(f, 'utf8'));
      const re = /box-shadow\s*:\s*([^;]+);/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(src)) !== null) {
        const value = (m[1] ?? '').trim();
        if (value.includes('inset') || value === '$shadow-lg') continue;
        offenders.push(`${f} → box-shadow: ${value}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('考试端不把语义原色当作文字色（必须走 -text 深字档）', () => {
    const examFiles = collect(resolve(process.cwd(), 'src/views/exam'));
    const offenders = examFiles.filter((f) =>
      /(?<![-\w])color\s*:\s*\$color-(?:success|warning|error|info)\s*;/.test(
        stripComments(readFileSync(f, 'utf8')),
      ),
    );
    expect(offenders).toEqual([]);
  });

  it('统计卡契约：左缘 2px + 26px 图标块 + 主色软底，tone 只换左缘与图标块', () => {
    const stat = stripComments(readFileSync(resolve(process.cwd(), 'src/components/common/StatCard.vue'), 'utf8'));

    expect(stat).toMatch(/&__rule\s*\{[\s\S]*?width:\s*2px/);
    expect(stat).toMatch(/&__icon\s*\{[\s\S]*?width:\s*26px/);
    expect(stat).toMatch(/background:\s*\$color-primary-soft/);

    // tone 档位必须换「左缘条 + 图标块」，文字色不得被 tone 改写
    for (const tone of ['success', 'warning', 'error']) {
      const block = new RegExp(`&--${tone}\\s*\\{([\\s\\S]*?)\\n  \\}`).exec(stat)?.[1] ?? '';
      expect(block, `StatCard 缺少 --${tone} 档`).not.toBe('');
      expect(block).toMatch(/\.stat-card__rule\s*\{[\s\S]*?background:\s*\$color-/);
      expect(block).toMatch(/\.stat-card__icon\s*\{[\s\S]*?background:\s*\$color-[\w-]+-bg/);
      expect(block).not.toMatch(/(?<![-\w])color\s*:\s*\$color-(?:success|warning|error|info)\s*;/);
    }
  });
});

/**
 * 保真度审计修复护栏（FIDELITY-AUDIT.md B/A 类，2026-10-14）。
 *
 * 这组断言针对一类「护栏测不到」的缺陷：**声明存在但计算值不对**。
 * 成因是 Element Plus 组件级同名变量/规则比 :root 更近（同优先级按注入顺序胜出），
 * 顶层声明被无声吃掉。所以断言不只看「写了什么」，更锁死「必须写在哪个作用域」——
 * 一旦有人把 `.el-input.el-input` 的高优先级覆盖改回裸 `.el-input`，这里先红。
 *
 * ⚠️ vitest 环境取不到 getComputedStyle 的真实结果，故这些是「作用域写法」断言；
 *    真正的计算值校验走 docs/ui-v3b/tools/audit-fidelity.mjs（CDP 实测）。
 */
describe('全站样式 · 保真度审计修复（B/A 类）', () => {
  const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
  const scss = readFileSync(resolve(process.cwd(), 'src/styles/index.scss'), 'utf8');
  const layout = strip(readFileSync(resolve(process.cwd(), 'src/layouts/AppLayout.vue'), 'utf8'));

  it('B1 基准字号：body 13.5px + EP 组件基准 13px（浮层继承 body，此前取浏览器 16px）', () => {
    expect(scss).toMatch(/body\s*\{[\s\S]*?font-size:\s*13\.5px/);
    expect(scss).toMatch(/--el-font-size-base:\s*13px/);
  });

  it('B2 输入框描边：必须写在 .el-input.el-input 作用域（:root 声明会被组件级吃掉）', () => {
    expect(scss).toMatch(/\.el-input\.el-input[\s\S]{0,80}--el-input-border-color:\s*#\{\$line-strong\}/);
  });

  it('B3/B5 表格：.el-table.el-table 作用域设边框色与 13px 字号', () => {
    const block = /\.el-table\.el-table\s*\{([\s\S]*?)\n\}/.exec(scss)?.[1] ?? '';
    expect(block).not.toBe('');
    expect(block).toMatch(/--el-table-border-color:\s*#\{\$border-color\}/);
    expect(block).toMatch(/--el-table-text-color:\s*#\{\$text-body\}/);
    expect(block).toMatch(/font-size:\s*13px/);
  });

  it('B4 表头底边必须带 .is-leaf（否则与 EP 同优先级被注入顺序覆盖）', () => {
    expect(scss).toMatch(/\.el-table\.el-table th\.el-table__cell\.is-leaf/);
  });

  it('B3 回归：不再用规范外的浅灰作表格边框（页面级硬编码曾把变量带偏）', () => {
    expect(scss).not.toMatch(/#eef2f7/i);
  });

  it('A1 按钮刻度：12.5px / 内距 8px 12px', () => {
    const block = /\.el-button\.el-button\s*\{([\s\S]*?)\n\}/.exec(scss)?.[1] ?? '';
    expect(block).toMatch(/font-size:\s*12\.5px/);
    expect(block).toMatch(/padding:\s*8px 12px/);
  });

  it('A2 次按钮：字色 text-1 + 描边强发丝线，且不移除语义类型/text/link 形态', () => {
    const sel = /\.el-button\.el-button:not\(\.el-button--primary\)([\s\S]*?)\{([\s\S]*?)\n\}/.exec(scss);
    expect(sel).not.toBeNull();
    // 覆盖选择器必须排除全部语义类型与 text/link（否则会误伤主按钮与文字按钮）
    for (const t of ['success', 'warning', 'danger', 'info']) {
      expect(sel![0]).toContain(`:not(.el-button--${t})`);
    }
    expect(sel![0]).toContain(':not(.is-text)');
    expect(sel![0]).toContain(':not(.is-link)');
    expect(sel![2]).toMatch(/--el-button-text-color:\s*#\{\$text-primary\}/);
    expect(sel![2]).toMatch(/--el-button-border-color:\s*#\{\$line-strong\}/);
  });

  it('A3 弹窗刻度：头 13px 16px / 标题 14px / 正文 16px / 脚 12px 16px', () => {
    expect(scss).toMatch(/\.el-dialog\.el-dialog[\s\S]*?\.el-dialog__header\s*\{\s*padding:\s*13px 16px/);
    expect(scss).toMatch(/\.el-dialog__title\s*\{\s*font-size:\s*14px/);
    expect(scss).toMatch(/\.el-dialog__body\s*\{\s*padding:\s*16px/);
    expect(scss).toMatch(/\.el-dialog__footer\s*\{\s*padding:\s*12px 16px/);
  });

  it('A4 表单标签：12px / 600 / text-2', () => {
    const block = /\.el-form-item__label\.el-form-item__label\s*\{([^}]*)\}/.exec(scss)?.[1] ?? '';
    expect(block).toMatch(/font-size:\s*12px/);
    expect(block).toMatch(/font-weight:\s*600/);
    expect(block).toMatch(/color:\s*\$text-body/);
  });

  it('A6 徽标刻度：20px 高 / 5px 圆角 / 11.5px', () => {
    const block = /\.el-tag\.el-tag\s*\{([\s\S]*?)\n\}/.exec(scss)?.[1] ?? '';
    expect(block).toMatch(/height:\s*20px/);
    expect(block).toMatch(/border-radius:\s*5px/);
    expect(block).toMatch(/font-size:\s*11\.5px/);
  });

  it('A8 品牌区：mark 24px/r6 + 名称 13.5px/600 + 英文副标题', () => {
    expect(layout).toMatch(/&__brand-mark\s*\{[\s\S]*?width:\s*24px[\s\S]*?border-radius:\s*6px/);
    expect(layout).toMatch(/&__brand-name\s*\{[\s\S]*?font-size:\s*13\.5px[\s\S]*?font-weight:\s*600/);
    expect(layout).toMatch(/small\s*\{[\s\S]*?font-size:\s*9\.5px/);
  });
});

describe('全站样式 · 逐页审计修复（第十轮）', () => {
  it('B1 补遗：body 正文行距 1.55（kit/c.css body 的 line-height）', () => {
    const block = /body\s*\{([^}]*)\}/.exec(scss)?.[1] ?? '';
    expect(block).toMatch(/font-size:\s*13\.5px/);
    expect(block).toMatch(/line-height:\s*1\.55/);
  });

  it('卡片零投影兜底：三写类名 (0,3,0) 压过 EP 的 is-always-shadow / is-hover-shadow', () => {
    expect(scss).toMatch(
      /\.el-card\.el-card\.is-always-shadow[\s\S]*?\.el-card\.el-card\.is-hover-shadow:hover[\s\S]*?\.el-card\.el-card\.is-hover-shadow:focus\s*\{\s*box-shadow:\s*none/,
    );
  });
});
