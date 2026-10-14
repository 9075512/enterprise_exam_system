# 系统 vs 设计图 · 保真度差异审计（v3.1 方向 C，2026-10-14）

> 审计方法：`tools/audit-fidelity.mjs` 用 CDP 把 **30 页设计图**（`docs/ui-v3b/pages/*.html`，由 vite dev 同源托管）与**工程同路由页面**逐页加载，对同语义元素取 `getComputedStyle` 做数值 diff，另取卡片/表格结构清单比对。全部实测，非目测。

## 结论摘要

| 级别 | 数量 | 说明 |
| --- | --- | --- |
| **B · 覆盖失效** | 5 | 工程声明了正确值，但被 EP 组件级同名变量/规则按注入顺序覆盖，**实际计算值是错的** |
| **A · 系统性刻度偏差** | 9 | 弹窗/表单/按钮/表格/徽标/页签/品牌区，EP 默认值未按设计稿收敛 |
| **C · 结构/流程差异** | 12 | 设计图的区块或流程工程没有（或顺序不同） |
| **D · 有意偏差** | 4 | 换肤时已文档化的取舍，不算回归 |

---

## B · 覆盖失效（最优先，护栏测不到）

工程侧声明存在、实测计算值不符 —— **护栏只断言「声明存在」，不断言「计算值正确」，所以一直绿着**：

| # | 位置 | 工程声明 | 实测生效值 | 设计稿 |
| --- | --- | --- | --- | --- |
| B1 | `body` 基准字号 | 无声明 | **16px**（浏览器默认） | **13.5px** |
| B2 | `--el-input-border-color` | `:root` = `$line-strong` #D9DEE7 | `.el-input` 作用域 = **#e9ecf1** | 输入框描边 #D9DEE7 |
| B3 | `--el-table-border-color` | `.el-table` = `$border-color` #E9ECF1 | **#eef2f7**（页面级硬编码）/ EP 默认 #EBEEF5 | 表头底边 #D9DEE7、行线 #E9ECF1 |
| B4 | 表头底边规则 | `.el-table.el-table th.el-table__cell{border-bottom:1px solid $line-strong}` | **失效**（与 EP `.el-table th.el-table__cell.is-leaf` 同优先级，EP 后注入胜出） | #D9DEE7 |
| B5 | 表格字号 | `.el-table{font-size:13.5px}` | **14px**（EP `.el-table--default` 同优先级胜出） | 13px |

B1 的连带影响最大：**EP 弹窗/浮层 teleport 到 body，整层文字 16px**（实测 `.el-dialog` 根字号 16px；设计稿弹窗正文 13.5px，标题 14px）。这也解释了提示条根字号 16px 的现象（title/description 有自己的字号，所以正文碰巧是对的）。

**修法建议**：
- B1：`body { font-size: 13.5px }` + `:root{--el-font-size-base:13px}` 一并落 token；
- B2/B3/B4：把赋值提到 EP 组件**同一作用域并加一级优先级**（如 `.el-input.el-input`、`.el-table.el-table`），或直接写 `@forward element with()` 的编译期方案；
- 给护栏补「计算值断言」测试（vitest 里 mock 不了 computed style，用 CDP 冒烟或至少把变量值断言挪到与 EP 同作用域的写法校验）。

---

## A · 系统性刻度偏差（命中页数 / 30）

| # | 组件 | 设计稿 | 工程实测 | 命中 |
| --- | --- | --- | --- | --- |
| A1 | 主/次按钮 | 高 32 · padding `0 12px` · **字号 12.5px** · 字重 550 | padding `8px 15px` · **字号 14px** · 字重 500 | 22 |
| A2 | 次按钮描边/文字 | 描边 #D9DEE7、字色 #0D1220(text-1) | **#E9ECF1、#5A6474**（各浅一档） | 21 |
| A3 | 弹窗 | 头 `13px 16px` + 标题 **14px**；body 16px；脚 `12px 16px` | 头 `18px 24px`(实测 61px 高) + 标题 **16px**；body `20px 24px`；脚 `14px 24px` | 全部 |
| A4 | 表单标签 | **12px** / 字重 580 / #3D4657 | **14px** / 500 / #5A6474 | 全部 |
| A5 | 表格单元格 | **13px** / #3D4657(text-2) | **14px** / #5A6474(text-3) | 12 |
| A6 | 徽标 | 高 20 · radius 5 · **11.5px** / 580 | el-tag 高 24 · radius 4(部分 9999) · **12px** / 500 | 13 |
| A7 | 页签 | 高 **39px**（`11px 12px 9px` 内距） | 高 **33px**（第五批定的刻度） | 2 |
| A8 | 品牌区 | mark **24px**/r6 + 名称 13.5px/600 + 英文副标题 | mark **30px**/r8 + 名称 15px/700，**无副标题** | 外壳 |
| A9 | 文字档 | text-1 #0D1220 / **text-2 #3D4657** / text-3 #5A6474 | 只有 3 档：primary/secondary(#5A6474)/disabled，**缺 #3D4657 一档** | 全站 |

A9 是 A2/A4/A5 的共同根因：设计稿四档文字，工程只落地了三档，凡设计稿用 text-2 的地方工程都落到了 text-3，整体比设计稿「灰一档」。

---

## C · 结构 / 流程差异

**外壳（AppLayout vs 设计稿 shell）**
- C1 设计稿顶栏有**全局搜索框（⌘K）与帮助按钮**，工程没有；
- C2 用户块位置：设计稿在**侧栏底部**，工程在顶栏右侧（工程顶栏另多了折叠按钮，属合理新增）；
- C3 侧栏分组：设计稿是**静态分组小标题**（`.side__grp` 10px/.12em），工程用 `el-sub-menu` 可折叠分组（交互更强，形态不同）；
- C4 品牌区见 A8。

**页面级缺口（设计图有、工程无的区块）**
| 页面 | 设计稿有 / 工程无 |
| --- | --- |
| departments | **科室树**（左右双栏，工程只有一张表） |
| exam-monitor | **异常告警**独立卡（工程只有统计卡+考生表） |
| scores | **分数段分布 / 科室对比 / 错题排行 TOP 5** 三张分析卡（工程需先选考试，首屏是空态；选中后才出现明细表，分析卡仍缺） |
| retakes | 补考规则（系统设置）卡 |
| appeals | 复核处理卡（考生成绩变更史） |
| practice-settings | 开放策略 / 访问链接 / 练题端数据概览 / 关闭态预览 / 配置留痕 |
| content | 轮播管理 / 新建公告 独立卡 |
| home-config | 生效说明卡 |
| permissions | 选择角色 / 当前统计 卡 |
| audit | 日志详情卡 |
| login-logs | 异常登录提示卡 |
| maintenance | 数据归档策略 / 执行记录 / 危险操作 卡（工程以表单区块实现，无卡头） |
| banks / papers | 题库健康度 / 试卷引用检查 |
| bank-detail | 知识点分布、批量导入模板 |
| composer | 选题范围 / 智能组卷 / 试卷结构 / 难度分布 / 发布检查（工程是「开始组卷」空态起步的向导流） |
| paper-preview | 试卷信息 / 预览设置 / 题目结构 |
| settings | **设计稿是「每域一张卡」**（防作弊/数据导入/账号安全/考试/阅卷/品牌 各带卡头），工程是「页签 + 单面板」 |
| reviews | 待阅队列 / 逐题评分 / 总分汇总（工程需先选记录） |
| exam-home | 即将开始 / 最新公告 区块（工程用待办+快捷入口替代） |
| exam-scores | 申请成绩复核 / 复核记录 区块（工程只有列内「申请复核」按钮） |
| score-detail | 知识点掌握卡（后端无知识点聚合数据） |
| dashboard | 考试场次趋势 / 科室及格率 / 最近考试 / 异常告警（工程为及格率趋势 / 错题归因×2 / 近期考试） |

**表格列集合差异（实测 both-side 表头）**：`exams`（设计：参考/应交、及格率、考试时间 ↔ 工程：试卷名、参与科室、时长、及格线、答题次数）、`dashboard 最近考试`、`users`（列序不同）、`content`、`home-config`、`maintenance`、`permissions`、`composer` 等 —— 多数是**信息架构不同**而非遗漏，如需逐列对齐需产品决策。

---

## D · 有意偏差（已文档化，不算回归）

1. 表头字号 12px（设计 11px）、字距 .05em（设计 .06em）—— 第二批注释里写明「正文 13.5px 下折算取 12px」；
2. 表头行高 38px（设计 36px）、卡片内距统一 16px（设计稿各卡 8–20px 不等）—— 第四批定案的单档收敛；
3. 统计卡 tone 语义收敛（仅「需注意」指标上状态色）—— 已对齐设计稿约定；
4. 字重 620/660/670 → 600/700：Inter 可变字重系统字体不支持，就近取整。

---

## 建议修复顺序

1. **B1 全局基准字号**（一处改动，全站浮层受益，影响面最大）；
2. **B2–B5 EP 覆盖失效**（同修一处手法，护栏补计算值断言）；
3. **A1–A6**（按钮/弹窗/表单/徽标/表格字号 —— 都是 `:root` EP 变量一揽子可解）；
4. **A9 文字档补 #3D4657**（token 层加一档，A2/A4/A5 随之解决）；
5. **C 类**按页面逐个排期（需产品确认：settings 卡片化 vs 页签、scores 分析卡、departments 科室树 优先级最高）。

---

## 修复后复验（2026-10-14 第二轮，commit `36a0e15`…`03207d0`）

B/A/A9 类全部修完后，用同一把尺子重跑 `tools/audit-fidelity.mjs`（30 页全量），对**同语义元素取 computed style** 做一次前/后对照，确认修复真的落到渲染层（而非只在源码里声明）。

### 关键项实机计算值（前 → 后）

| 元素 | 属性 | 修复前 | 修复后 | 设计稿 | 对应 |
| --- | --- | --- | --- | --- | --- |
| `body` | font-size | **16px** | **13.5px** | 13.5px | **B1** |
| `.el-dialog`（teleport 浮层根） | font-size | **16px** | **13.5px** | 13.5px | **B1** |
| `--el-font-size-base` | 变量值 | （未设） | **13px** | — | B1 |
| `--el-text-color-regular` | 变量值 | #5A6474 | **#3D4657** | text-2 | A9 |
| 输入框描边 | box-shadow inset 色 | **#E9ECF1** | **#D9DEE7** | #D9DEE7 | **B2** |
| 表头底边 | border-bottom-color | **#EEF2F7** | **#D9DEE7** | #D9DEE7 | **B3/B4** |
| 表格单元 | border-bottom-color | **#EEF2F7** | **#E9ECF1** | #E9ECF1 | B3 |
| 表格单元 | font-size | **14px** | **13px** | 13px | **B5/A5** |
| 表格单元 | color | #5A6474 | **#3D4657** | #3D4657 | **A9** |
| 主按钮 | font-size | **14px** | **12.5px** | 12.5px | A1 |
| 次按钮 | border / color | #E9ECF1 / #5A6474 | **#D9DEE7 / #0D1220** | 同 | A2/A9 |
| 弹窗头 / 体 | padding | 18px 24px / 20px 24px | **13px 16px / 16px** | 同 | A3 |
| 徽标 `.el-tag` | height/radius/font-size | 24px/4px/12px | **20px/5px/11.5px** | 同 | A6 |
| 页签 `.el-tabs__item` | height | **33px** | **39px** | 39px | A7 |
| 卡头 | 匹配率 | 34% | **66%** | — | A3 |

### 汇总

- 严格逐属性全等口径：**112/567 (19.8%) → 142/567 (25.0%)，+30 个元素转正**。
- 该绝对值偏低不是问题源：探针会取 `boxShadow`（EP 用 `inset 0 0 0 1px` 阴影画输入框/表格边框，设计稿用真 `border`，**结构上不可能相等**）与 `fontWeight`（设计稿 550/580 → 工程取整 500/600，属 **D 类已文档化偏差**）。只看**趋势**与**逐项计算值**，不看绝对值。
- 剩余未对齐项均为 D 类：表头行高 38px（设计 36）、表头 12px（设计 11）、卡片内距 16px（设计各卡 8–20 不一）、字重取整。

### 护栏补强

`src/styles/globalStyle.test.ts` 新增 `describe('全站样式 · 保真度审计修复（B/A 类）')` 11 条，把 B1–B5/A1–A6/A8/A9 的**声明作用域**钉住（如 `.el-input.el-input` 元素级声明、`.el-table.el-table` 同作用域、表头规则含 `.is-leaf`）。vitest 读不到 computed style，**计算值仍以本文件 §修复后复验 + CDP 实测为准**（vitest 215/215 全绿）。

### ⚠️ 仍需产品决策的 C 类（本轮未做）

- `scores` 分数段分布 / 科室对比 / 错题排行 TOP 5 三张分析卡（后端仅 `Report.summary/bands/departments/wrongRate`，首屏需先选考试）；
- `dashboard` 科室及格率 / 待办 / 异常告警（无后端聚合）；
- `composer` 向导流 vs 设计稿分区面板、`reviews` 需先选记录、`paper-preview` 信息块；
- 表格列集合差异（信息架构不同，非遗漏）。

---

## C 类收尾（2026-10-14 第三轮，commit `0fb5c0c`…`07cdde7`）

上表前四行已全部落地（数据可得的部分用真实聚合，不可得的诚实标注）：

| 页面 | 本轮补齐 |
| --- | --- |
| scores | **删页签改单页**：成绩列表全宽卡 → `.grid.g3` 三联卡（分数段分布 / 科室对比 / 错题排行 TOP 5）→ 切屏审查；并**首屏默认选中最近一场考试**（对齐设计稿「进入即有数据」，有值探针 7/25 → 21/25） |
| dashboard | 科室及格率（最近 ≤5 场加权平均 + 内联进度条）/ 待办（待阅卷·复核申请·补考申请真实计数）/ 异常告警（切屏记录，阈值同系统设置） |
| reviews | 三栏重排：待阅队列（可点选 + 选中态）/ 逐题评分（题干·作答·参考答案·给分）/ 总分汇总（未评完提示） |
| composer | 选题范围摘要 / 试卷结构（题型×题量×小计）/ 难度分布（降级为题型分值分布）/ 发布检查 6 项校验 |
| banks | 题库健康度卡（题库·题目总数 / 未开放练题 / 无授权出题人 / 空库 / 题数分布） |
| bank-detail | 知识点分布卡（tags 聚合）+ 批量导入模板入口卡 |
| papers | 试卷引用检查卡（exams 列表按 paperId 归类） |
| paper-preview | 试卷信息 / 预览设置（纯前端显隐）/ 题目结构（题型聚合 + 总分核对） |
| score-detail | 知识点掌握卡（`paperSnapshot.questions` 的 tags + answers 纯前端聚合，全题型对错判定） |

**仍开放的缺口（后端无对应字段/接口，前端已 `—` + 注释标注，需产品决策是否加后端）**：
题目级健康度指标（缺解析 / 从未被使用 / 正确率<30% / 近 12 个月未更新）；题目 `difficulty` 字段；阅卷 SLA（超时 N 小时）与告警工单表；阅卷评语 / 标记存疑 / 快捷键；表格列集合差异（信息架构不同）。

---

## 练题端（practice-web）专项审计（2026-10-14 第四轮）

> 前三轮的审计 lane 只覆盖根应用（30 页同源 5173）；**练题端是独立构建、独立端口（5174）、独立 token（`practice.token`）、独立 styles/**，从未过 computed-style 审计。本轮新增 `tools/audit-practice.mjs`（探针换成移动端 kit `kit/m.css` 的 `.m-*` ↔ 练题端工程选择器，移动视口 390×844），对 7 页设计稿逐页实测。

### 结论：与根应用同源的 B / A9 类缺陷

| 项 | 设计（kit/m.css） | 练题端实测（改前） | 修法 |
| --- | --- | --- | --- |
| **B1 同类 · body 基准字号** | **14px** | **16px**（7/7 页）——EP 浮层 teleport 到 body 继承浏览器默认 | `body { font-size: 14px }` |
| **B2 同类 · 输入框描边** | `--line-strong` **#D9DEE7** | `:root` 写了 #D9DEE7，但 `.el-input` 元素作用域实测 **#e9ecf1**（EP 在元素作用域重定义同名变量，按作用域规则必胜；登录页只是本地 box-shadow 兜了底，其余 el-input 全中招） | `:root` 保留 + 新增 `.el-input.el-input / .el-textarea.el-textarea` 元素级声明 |
| **A9 同类 · 文字档** | text-1/2/3/icon 四档，text-2 = **#3D4657** | 只有三档，`--el-text-color-regular` = **#5a6474**（text-3），EP 默认正文整体「灰一档」 | token 补 `$text-body: #3D4657`，`--el-text-color-regular` 指向它 |

### 修复后复验（同尺子重跑）

- `body`：16px → **14px**（7/7 页，与设计一致）；
- `--el-text-color-regular`：#5a6474 → **#3D4657**（`:root` 与 `.el-input` 作用域实测一致）；
- `.el-input` 元素作用域 `--el-input-border-color`：#e9ecf1 → **#D9DEE7**（登录页实测 box-shadow inset 同步）；
- 截图复核 p-home / p-report / p-profile：14px 基准未破坏版式。

### 不算缺陷的实测差异（工程适配 / D 类）

- 内容区 `padding: 14px 14px 74px`（设计 14px）—— 底部 74px 是给固定 TabBar 让位，属移动端适配；
- 底栏 Tab 高 57px（设计 56px）、Tab 项 `padding-top 0`（设计 6px）—— 用 flex 居中的等效实现；
- 列表页主按钮为 `el-button--small`（24–31px / r6），设计 kit 只定义大号 `.m-btn`（42px / r8），无对应设计元素可比 —— 小按钮 r6 vs 控件档 r8 待产品定夺是否统一；
- 业务类文字色实测已符合设计（选项 = text-2、列表副标 = text-3），无需盲迁 50 处 `$text-secondary`。

### 护栏

`practice-web/src/styles/styleGuard.test.ts` 新增 describe「练题端 · 保真度审计修复（B/A9 类）」4 条（body 14px / `$text-body` token / `--el-text-color-regular` 指向 / `.el-input.el-input` 元素级声明）。practice-web 测试 28 → **32**，vue-tsc 0，vite build 成功；根应用测试 215/215 不受影响。

---

## 题目难度（difficulty）全链路落地（2026-10-14 第五轮）

前四轮把 `composer 难度分布` 标为「降级为题型/分值分布」——根因是 **Question 无 difficulty 字段**，属设计稿要求而数据模型缺失的唯一可直接补齐项（其余开放项均需新增后端表或产品定夺语义）。本轮按既有幂等补列范式全链路补齐：

### 落地范围

| 层 | 改动 |
| --- | --- |
| **DB** | `questions.difficulty ENUM('low','medium','high') NULL`（NULL = 未标注）：`schema.ts` DDL + `init.ts` 幂等 ALTER（查 information_schema 再补列）+ `schema.sql` 文档副本 |
| **服务端** | domain `QuestionDifficulty` + DTO；mapper/repo 全字段透传；zod（新建/编辑 nullish、列表查询枚举、批量编辑 nullish）；service 归一（枚举外一律视为未标注）；**列表筛选**（全局池 `/api/questions?difficulty=` 与题库内 `/api/banks/:id/questions?difficulty=`）；**批量编辑**（null = 清除）；**抽题返回** `DrawQuestionItem.difficulty`；题库克隆 / Excel 导入沿用归一化自动携带 |
| **种子** | 10 道示例题回填难度（低 6 / 中 3 / 高 1）；upsert 对存量库做 `ON DUPLICATE KEY UPDATE difficulty = ?`（仅难度这一列回填，其余仍不覆盖） |
| **前端** | 类型 + `QUESTION_DIFFICULTY_LABELS/OPTIONS` 常量；试题表单「难度」下拉（可清空）；批量编辑弹窗「修改难度」；题库详情难度列 + 全部难度筛选；组卷题池难度列 + 筛选、已选清单难度徽标、**难度分布卡改真实聚合**（低/中/高恒定 + 未标注仅有值时展示，附「N / M 题已标注难度」口径） |
| **快照** | `getSnapshot` 经 `mapQuestionRow` 组装，难度自动进入 `paperSnapshot.questions[].question`，无需额外改动 |

### 有意不做（避免编造数据）

- 设计稿的「难度系数 0.74 / 目标 0.72」**未实现**：难度系数（P 值）应由作答正确率统计得出或需要「目标难度」配置项，用固定映射（如低=0.9）伪造会违背「不造数」红线；需产品决策后加配置 + 统计口径。
- composer 抽题规则未提供「按难度抽题」——设计稿未要求，暂不扩。

### 验证

- 服务端 `tsc --noEmit` 0；vitest **523/523**；`npm run db:init` 幂等补列成功（二次执行「无需变更」）。
- API 实测：创建带难度 ✅ / 更新改难度 ✅ / `difficulty=high` 过滤仅返回 q-09 ✅ / 批量置难度 ✅ / 非法枚举 **400** ✅ / 临时题已清理。
- 前端 `vue-tsc` 0；vitest **215/215**；`vite build` 成功（26.1s）。
- CDP 实测（author 登录）：`/author/papers/composer?paperId=paper-demo` 难度分布卡真实渲染 **低 6题·60% / 中 3题·30% / 高 1题·10%** + 「10/10 题已标注难度」；题库详情难度列与筛选正常。

---

## 题库「题目级健康度」落地（2026-10-14 第六轮）

C 类收尾与第五轮后，开放项里唯一「数据源已存在、无需产品定夺语义」的是**题目级健康度**——`practice_answers`（练题作答明细）天然提供正确率统计源。本轮把设计稿 `pages/bank-detail.html` 顶部五张卡与表格「正确率」列全部真实落地。

### 落地范围

| 层 | 改动 |
| --- | --- |
| **服务端** | 新增 `GET /api/banks/:id/question-stats`：题型分布（五题型恒有键）/ 平均正确率 / 待完善口径拆分；`GET /api/banks/:id/questions` 每题透传 `correctRate`（0-100 保留 1 位小数，无作答 → `null`；仅对当前页题目做一次 IN 批量聚合） |
| **聚合口径** | 平均正确率 = 该题库**全部**练题作答记录的正确占比（加权，`SUM(is_correct)/COUNT(*)`）；「待完善」= 缺解析 ∪ 未设置知识点（**并集去重**，SQL 单列 SUM，卡 foot 按「缺解析 N · 未设知识点 M」拆分展示）；单题正确率 = 该题全部作答记录的正确占比 |
| **前端** | 题库详情页顶部 5 张 `StatCard`（题目总数 / 单选·多选 / 判断·简答（foot 动态补「含填空 N 道」）/ 平均正确率（foot 显示有作答题数或「暂无练题作答」）/ 待完善 warn tone）；表格新增「正确率」列（数值 + 42px 内联进度条）；待完善行 `row--incomplete` 高亮 + 知识点空值改「未设置」warn 文案 + 操作列首按钮动态「补齐」 |
| **测试** | 新增 `server/src/test/bank.question-health.test.ts` 4 条（无作答 null 不造数 / 待完善并集去重 / 聚合精度 66.7 / 鉴权 1003·1004），服务端 523 → **527** |

### 设计差异的工程化决策

- **正确率三档着色**：设计稿示例（61% 红 / 48% 琥珀 / 86–94% 默认）非单调、无自洽阈值，按单调阈值实现：**<60% error / 60–79% warning / ≥80% 主色**；数字一律 `-text` 档（700），语义原色仅作进度条填充（DESIGN-C 语义色铁律）。
- **「近 12 个月未更新」未做**：`questions` 无 `updated_at` 列（仅 `created_at`），需先加列 + 幂等迁移，暂不扩。
- **演示库不加练题作答种子**：seed 既有惯例不写任何作答记录（`exam_records` 同），无作答时统计卡显示 `—` + foot「暂无练题作答」，属诚实数据缺口表达。
- **正确率列分档与「待完善」行的操作**：待完善行操作列首按钮显示「补齐」（复用编辑弹窗，引导补解析/知识点），对齐设计稿。

### 验证（CDP 实测计算值，截图 `_shot/bank-detail-health.png`）

- 用带独立标记的验证作答（`user_id=user-qa-health-verify`，不触碰真实账号）造出三档 + 空态，实测后**按标记精确清理**（演示库 `practice_answers` 归零）；
- 统计卡实测：6 道 / 2 / 2 / **60%**（foot「3 道有练题作答」）/ 6 道（foot「缺解析 0 · 未设知识点 6」，warning tone 琥珀左缘条）；
- 正确率列实测：66.7%（文字 `rgb(181,71,8)`= `$color-warning-text`、填充 warning 原色）/ 100%（`$text-primary` + `#0B5BFF`）/ 0%（`rgb(180,35,24)`= `$color-error-text` + error 原色）/ `—`；进度条宽度逐条正确；
- 待完善行背景实测 **`rgb(255,250,235)` = `#FFFAEB`**（`$color-warning-bg`）——双写类名（`.el-table.el-table`）+ 抬一级选择器实测压过 EP 斑马纹（EP 懒加载后注入的同分规则）；
- 知识点「未设置」文字实测 `#B54708`（warning-text 档，非原色）；
- **实测发现并修正**：平均正确率初版显示 `60%%`（`formatRate` 已带 % 又拼 StatCard unit）→ 数值与单位职责拆分后复验 `60%`；
- 前端 vue-tsc 0 / vitest **215/215** / `vite build` 成功；服务端 tsc 0 / vitest **527/527**。

### 仍开放的缺口（需产品决策）

难度系数（P 值）与目标配置、阅卷 SLA（超时 N 小时）与告警工单表、阅卷评语 / 标记存疑 / 快捷键、表格列集合差异（信息架构不同）、练题端小按钮 r6 vs r8。

---

## 阅卷「评语 + 标记存疑 + 快捷键」落地（2026-10-14 第七轮）

第六轮后，开放项里唯一「不需产品定夺语义、且设计稿明确要求」的是 **阅卷三件套**——`pages/reviews.html` 的「本题评分」区含「评语（可选，考生可见）」「标记存疑」，页脚含快捷键提示条。此前阅卷页以占位提示（`数据缺口：…暂不提供`）标注，本轮全链路补齐并移除占位。

### 落地范围

| 层 | 改动 |
| --- | --- |
| **DB** | `exam_records.review_notes JSON NULL` + `exam_records_archive.review_notes`（业务表与归档表同列，`RECORD_FULL_COLUMNS` 共用）；`schema.ts` 两表 DDL + `init.ts` 幂等 ALTER（for-of 覆盖两表）+ `schema.sql` 文档副本三处同步；归档搬移 `INSERT…SELECT` 显式列清单同步补列（否则归档丢备注） |
| **存储结构** | `Record<questionId, { comment?, commentVisible?, doubtful? }>`；未填字段省略（不写空串 / false），空条目整条剔除 |
| **服务端** | `ReviewNote`/`ReviewNotes` 领域类型；mapper 映射（`parseJsonColumn` 默认 `{}`）；`repo.updateReview` 写 `review_notes`；`service.review(id, subjectiveScores, reviewNotes)` 归一化（归属校验 + 评语 ≤ 500 + 空条目剔除）；zod `reviewSchema` 加可选 `reviewNotes`；router 透传 |
| **考生可见性（服务端强制）** | `candidateReviewNotes()`：仅保留 `comment && commentVisible` 的评语，**剔除存疑等内部标记**；`getById`（examinee 视角）与 `listMy` 走该过滤，管理员视角返回完整备注 |
| **前端阅卷页** | 逐题「评语」textarea（500 字计数）+「评语同步展示给考生」勾选；「标记存疑」开关按钮（warning 三件套）；快捷键 **1–9 采纳第 N 档评分细则 / ← → 切换题目（含滚动定位）/ Enter 提交并下一份**，光标在输入框/按钮内不触发；当前题目主色描边高亮；页脚快捷键提示条替换原占位 |
| **前端成绩明细** | 简答区新增「阅卷评语」info 软底块（考生可见评语由服务端过滤后下发）；管理员额外见「阅卷存疑」warn 徽标（考生视角该字段已被剔除，天然不可见） |
| **测试** | 新增 `server/src/test/v33.review-notes.test.ts` 10 条（长度上限 1001 / 归属校验 1001 / 空条目剔除 / 评语存疑入库 / 管理员完整视角 / 考生过滤 / 我的成绩列表过滤 / 归档表列存在性），服务端 527 → **537** |

### 设计差异的工程化决策

- **评语位置**：设计稿把「评语」放在右栏「本题评分」卡（对应「当前题」）；本工程中栏逐题纵向堆叠、无「当前题」单卡，故**内联到每题得分行下方**，语义等价且避免右栏与当前题失联。
- **「Enter 提交并下一份」**：本工程提交粒度是「整份答卷」，实现为提交后推进到队列中下一份（原条目离开待阅队列），与设计意图一致。
- **快捷键「采纳第 N 条评分要点」**：本工程评分模型是**互斥分档 rubric**（非设计稿的累加要点），故按键语义实现为「采纳第 N 档」，提示条按实际模型措辞（工程诚实）。
- **存疑的语义消费点**：提交后记录离队，存疑若无消费点即死数据；故在**管理员成绩明细**以「阅卷存疑」徽标呈现（考生不可见），给该标记一个真实去处。

### 验证（CDP 实测计算值 + 真实键盘事件）

- **阅卷页**（截图 `_shot/review-notes.png`）：2 题卡片；`ArrowRight/ArrowLeft` 实测切换 `activeId`；按键 `2` 实测采纳第 2 档（`20 分 基本 缺时限` 高亮）；评语 textarea `input` 实测 `30/500` 计数与 `v-model` 同步；「评语同步展示给考生」默认勾选；「标记存疑」实测 `标记存疑 → 已标记存疑`，按钮 `background #FFFAEB / color #B54708 / border #FEDF89`（warning 三件套，文字走深字档）；当前题高亮 `border #0B5BFF / background #EDF3FF`；提示条 `color #175CD3 / background #EFF8FF` + 5 个 `kbd`。
- **提交接线**：CDP 抓包确认请求体 `{"subjectiveScores":{…},"reviewNotes":{"…":{"comment":"…","commentVisible":true,"doubtful":true}}}`；DB/API 双向核对 `review_notes` 落库。
- **成绩明细**（截图 `_shot/score-detail-admin.png`）：管理员视角实测「阅卷存疑」warn 徽标 + 评语 info 软底块（`color #175CD3 / background #EFF8FF`）；**考生视角实测同一记录 `doubtBadges: []`、仅有评语**——服务端过滤端到端生效。
- 前端 vue-tsc 0 / vitest **215/215** / `vite build` 成功；服务端 tsc 0 / vitest **537/537**；`npm run db:init` 幂等补列（二次执行「无需变更」），`information_schema` 直查确认两表 `review_notes` 就位。
- **环境坑（复用注意）**：长期运行的 vite dev server 会缓存 `src/api/*` 模块（本次表现为新参数被吞、请求体缺字段）；**验证改动请另起独立 dev server（如 `npx vite --port 5180`）**，勿依赖常驻实例。另：`scrollIntoView` 会滚动布局**内层**滚动容器，截图前需遍历归零 `scrollTop`（`window.scrollTo` 无效）。
- 验证数据按名称标记（`CDP 验证`）精确清理，演示库 `exam_records` 归零新增、`questions` 简答题归零；临时脚本全部删除。

### 仍开放的缺口（需产品决策）

难度系数（P 值）与目标配置、阅卷 SLA（超时 N 小时）与告警工单表、表格列集合差异（信息架构不同）、练题端小按钮 r6 vs r8。

---

## 组卷「难度系数（P 值）」落地（2026-10-14 第八轮）

第六、七轮后，开放项里「难度系数（P 值）与目标配置」具备了落地条件：设计稿 `pages/composer.html` 的「难度分布」卡明确要求卡头「**目标 0.72**」tag、正文「**当前难度系数 0.74**，接近目标值，可直接发布」；而第六轮已建立 `practice_answers` 实测正确率聚合、第五轮已建立题目 `difficulty` 标注——两条数据路径都在。

### 落地范围

| 层 | 改动 |
| --- | --- |
| **服务端** | `listGlobal`（组卷选题池 `GET /api/questions`）与 `papers.getById`（试卷详情）透传 `correctRate`（均复用 `correctRateByQuestionIds`，仅当前页/当前卷题目一次 IN 聚合，无作答 → null）。**试卷详情也透传**是为了编辑已有试卷时难度系数口径与新建一致（否则「实测优先」只在新建流程生效，属半成品） |
| **常量** | `QUESTION_DIFFICULTY_P_VALUE`（低 0.9 / 中 0.7 / 高 0.5，无实测时的估算锚点）、`PAPER_TARGET_DIFFICULTY`（0.72，对齐设计稿）、`PAPER_DIFFICULTY_TOLERANCE`（0.05）——前端常量而非配置域（设计稿为固定展示值，产品如需可配置再走「配置项双份同步」） |
| **纯函数** | `services/examRules.ts` 新增：`questionPValue`（实测优先 → 标注锚点 → null，0–100 clamp 到 0–1）、`calcDifficultyIndex`（**按分值加权**平均，无可用数据 → null 不造数）、`difficultyVerdict`（四态：none/near/easy/hard）、`difficultyVerdictText`；`evaluableQuestionCount` |
| **前端组卷页** | `SelectedQuestion` 带 `correctRate`（选题池勾选 / 试卷详情回填均带上；抽题结果无作答统计 → null 走标注）；难度分布卡：卡头「目标 0.72」tag + 底部结论条（`is-near` info 三件套 / `is-easy`·`is-hard` warning 三件套 / `is-none` 中性） |
| **测试** | 前端 `examRules.test.ts` 10 条（实测优先 / 越界 clamp / 锚点 / 加权 / 跳过未标注 / 无数据 null / 四态边界 / 文案），前端 215 → **225**；服务端 `v33.pool-correct-rate.test.ts` 2 条（无作答 null / 聚合精度 66.7），服务端 537 → **539** |

### 设计差异的工程化决策

- **实测优先、标注回落**：设计稿的「当前难度系数」语义是实测通过率；纯标注锚点只能算「设计难度」。工程实现为：题目有练题作答 → 实测正确率即 P 值；无作答 → 按难度标注锚点估算；两者皆无 → 该题不计入（无数据时诚实提示「无法评估」）。
- **锚点取值**：低/中/高 → 0.9/0.7/0.5（经典三级难度锚点；对设计稿示例按分值加权验算得 0.71，落在「接近目标」区间，自洽）。
- **按分值加权**而非按题量：难度系数应与卷面分权重一致（与 `calcTotalScore` 同口径）；等分卷时与算术平均等价。
- **容差判定的浮点防线**：`0.77 − 0.72 = 0.050000000000000044` 会把边界值误判为偏易——delta 先做千分位取整再比（单测边界用例 0.77/0.67 钉住）。
- **目标值未做配置化**：设计稿给的是固定「目标 0.72」，先以常量落地；若产品要按科室/考试类型配目标，再走配置域（`defaults.ts` ↔ `constants` 双份同步范式）。

### 验证（CDP 实测计算值，截图 `_shot/composer-difficulty.png`）

- **场景 A（演示库现状，含 3 条真实练题作答）**：难度系数 **0.69**（纯标注应为 0.80——q-04/q-09/q-10 的实测 0%/0%/100% 覆盖了标注锚点，「实测优先」端到端生效）→ `is-near`；结论条实测 `bg #EFF8FF / color #175CD3 / border #B2DDFF`（info 三件套全中）；卡头 tag「目标 0.72」；条形 低 6 题 60% / 中 3 题 30% / 高 1 题 10%。
- **场景 B（给 6 道 low 题造 70% 验证作答后）**：难度系数 **0.65**（手算一致）→ `is-hard`「偏难（目标 0.72），建议补充低难度题目」；实测 `bg #FFFAEB / color #B54708 / border #FEDF89`（warning 三件套全中，文字走深字档）。
- 验证作答用独立标记 `user_id=user-qa-diff-verify`（60 条），实测后精确清理——演示库 `practice_answers` 回到 3 条真实数据，零污染。
- 前端 vue-tsc 0 / vitest **225/225** / `vite build` 成功；服务端 tsc 0 / vitest **539/539**（改动后重跑确认）。

### 仍开放的缺口（需产品决策）

阅卷 SLA（超时 N 小时）与告警工单表（需新表 + 语义）、表格列集合差异（信息架构不同）、练题端小按钮 r6 vs r8。**「难度系数与目标配置」的目标值配置化**若产品要按域配置，走配置域范式即可。
