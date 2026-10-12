# 07 · 增量方案 —— 练题端体验增强（收藏夹 / 学习报告 / 每日一练）

> 版本：**v1.1（已确认，进入实施）**
> 日期：2026-10-12
> 关系：在 `05-PRD-practice-increment.md`（公网练题·基础版）之上叠加的**第二期增量**，不修改一期已交付的行为契约。
> 适用范围：仅练题域（`practice_*`）与练题端前端 + 内网管理端「公网练题」配置区；**不触碰考试域任何表与路由**。
>
> **v1.1 相对 v1.0 的变更（用户 2026-10-12 拍板）**
> 1. 底部导航确定扩为 **4 Tab**（练题 / 错题本 / 报告 / 我的），采用原「方案 B」；
> 2. 每日一练**纳入本期**，默认题量由 5 题改为 **10 题**；
> 3. **新增范围**：内网后台管理端增加「公网练题 · 每日一练」配置区，含**功能开关**与相关配置项（见 FR-4 / 第 3.3 节 / 第 4.4 节 / T02 / T11）；
> 4. 错题本口径**维持现状不改**（首答对、重做错仍入错题本），原「待确认」项关闭。

---

## 1. 背景与目标

一期已交付：公网练题（登录 / 题库练习 / 即时判分 / 进度 / 错题本 / 底部导航 / 我的页）。

用户反馈：功能通了，但「练完就散」——没有沉淀、看不到成长、缺少回来练的理由。本期目标：

| 目标 | 对应功能 | 用户可感知的价值 |
| --- | --- | --- |
| 让好题可沉淀 | **收藏夹** | 遇到重点题、代表性题可收藏，随时集中重练 |
| 让进步看得见 | **学习报告** | 正确率趋势、薄弱科目定位，知道该练什么 |
| 给一个每天回来的理由 | **每日一练** | 每天固定题量任务 + 连续打卡，形成习惯 |
| 让运营可控 | **后台配置** | 管理员可随时开关每日一练、调整题量与题型 |

非目标（本期不做）：
- 考试域联动（考试错题并入练题、模拟考、组卷）——属于下一方向「考练闭环」；
- 排行/积分/勋章等强激励玩法；
- 企微免登、消息推送。

---

## 2. 功能需求

### FR-1 收藏夹

| 编号 | 需求 | 说明 |
| --- | --- | --- |
| FR-1.1 | 收藏题目 | 作答页（题库练习 / 错题复习 / 收藏重练 / 每日一练）每题可「收藏 / 取消收藏」，即时生效、可撤销 |
| FR-1.2 | 收藏列表 | 「我的收藏」页分页展示：题干、题型、所属题库、收藏时间；支持按题库筛选 |
| FR-1.3 | 集中重练 | 从收藏夹一键「练收藏题」→ 生成练习序列进入作答页 |
| FR-1.4 | 收藏态回显 | 作答过程中已收藏题目显示实心图标；列表页与作答页状态一致 |
| FR-1.5 | 空态与上限 | 无收藏时给出明确空态；上限由后台配置（默认 **500 题**），超出时提示「收藏已达上限，请先清理」 |

### FR-2 学习报告

| 编号 | 需求 | 说明 |
| --- | --- | --- |
| FR-2.1 | 总览指标 | 累计练题（首答去重）、累计答对、正确率、错题数、收藏数、**连续打卡天数** |
| FR-2.2 | 近 N 日趋势 | 近 7 日 / 30 日：每日练题量 + 当日正确率 |
| FR-2.3 | 薄弱科目 | 按题目 `subject` 聚合正确率，升序排列，正确率 < 70% 且作答数 ≥ 5 标记「薄弱」 |
| FR-2.4 | 按题库概览 | 各开放题库的已练 / 总题数、正确率，可直接跳转继续练 |
| FR-2.5 | 统计口径 | **与一期完全一致**：以 `practice_answers` 首答明细为唯一数据源，不使用任何客户端上报计数 |

### FR-3 每日一练

| 编号 | 需求 | 说明 |
| --- | --- | --- |
| FR-3.1 | 每日任务 | 每自然日固定 **10 题**（后台可配，见 FR-4）；题型按后台配置的范围抽取；抽题范围优先「用户已练过的开放题库」，不足时补充其他开放题库 |
| FR-3.2 | 题序固定 | 当日题序在首次生成后**不再变化**（刷新、重新进入均为同一批题） |
| FR-3.3 | 完成度 | 首页卡片显示 `已答 n/10`；全部作答完成为「今日已完成」 |
| FR-3.4 | 连续打卡 | 有作答记录的自然日连续计数；当日完成后 +1，中断则从 1 重新开始 |
| FR-3.5 | 入口 | 首页顶部任务卡（主入口）+ 报告页「今日任务」区块 |
| FR-3.6 | 开关生效 | 后台关闭每日一练时：首页不显示任务卡、`/daily/session` 拒绝建会话；已有历史打卡数据**不删除** |

### FR-4 后台配置（新增 · 内网管理端）

| 编号 | 需求 | 说明 |
| --- | --- | --- |
| FR-4.1 | 配置入口 | 内网管理端「系统设置」页新增第 5 张卡片「公网练题」，仅 admin 可见/可改 |
| FR-4.2 | 每日一练开关 | `dailyEnabled`：关闭后练题端立即不再提供每日一练 |
| FR-4.3 | 每日题量 | `dailyQuestionCount`：1~50，默认 **10** |
| FR-4.4 | 题型范围 | `dailyTypes`：多选（单选/多选/判断），留空 = 全部题型 |
| FR-4.5 | 抽题范围 | `dailyBankScope`：`practiced`（优先已练题库，默认）/ `all`（全部开放题库） |
| FR-4.6 | 收藏上限 | `favoriteLimit`：1~2000，默认 **500** |
| FR-4.7 | 独立保存 | 该卡片独立保存按钮，走独立接口；**不并入**现有 `PUT /api/settings` 的整体替换语义，避免两类配置互相覆盖 |
| FR-4.8 | 与 `system_settings` 隔离 | 练题配置存**独立单行表 `practice_settings`**：`practice_app` 对其**只读**（写由内网实例完成），一期「`practice_app` 对 `system_settings` 零授权」的约定**保持不变** |

---

## 3. 数据模型

新增 3 张表，全部落在练题域；`user_id` 弱关联内网 `users.id`（**无外键**），`question_id` 保留题域外键。

```sql
-- 15. 收藏夹（按 用户×题目 唯一）
CREATE TABLE IF NOT EXISTS practice_favorites (
  id          VARCHAR(64) NOT NULL,
  user_id     VARCHAR(64) NOT NULL,
  question_id VARCHAR(64) NOT NULL,
  created_at  DATETIME(3) NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uk_pf_user_question (user_id, question_id),
  KEY idx_pf_user (user_id),
  CONSTRAINT fk_pf_question FOREIGN KEY (question_id) REFERENCES questions(id)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 16. 每日一练任务（按 用户×自然日 唯一）
CREATE TABLE IF NOT EXISTS practice_daily_tasks (
  id            VARCHAR(64) NOT NULL,
  user_id       VARCHAR(64) NOT NULL,
  practice_date DATE        NOT NULL,  -- 服务端按 TZ 折算的自然日
  question_ids  JSON        NOT NULL,  -- 当日固定题序
  total         INT         NOT NULL DEFAULT 0,
  done_count    INT         NOT NULL DEFAULT 0,
  correct_count INT         NOT NULL DEFAULT 0,
  completed_at  DATETIME(3) NULL,
  created_at    DATETIME(3) NOT NULL,
  updated_at    DATETIME(3) NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uk_pdt_user_date (user_id, practice_date),
  KEY idx_pdt_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 17. 练题配置（单行表，应用层永远使用 id = 1；内网管理端写、练题实例只读）
CREATE TABLE IF NOT EXISTS practice_settings (
  id         TINYINT      NOT NULL DEFAULT 1,
  settings   JSON         NOT NULL,
  updated_by VARCHAR(64)  NOT NULL DEFAULT '',
  updated_at DATETIME(3)  NOT NULL,
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

索引补充（性能）：

```sql
ALTER TABLE practice_answers ADD KEY idx_pa_user_answered (user_id, answered_at);
```

### 3.1 练题配置默认值（单一事实来源）

```ts
export const DEFAULT_PRACTICE_SETTINGS: PracticeSettings = {
  dailyEnabled: true,
  dailyQuestionCount: 10,
  dailyTypes: [],            // 空 = 全部题型
  dailyBankScope: 'practiced',
  favoriteLimit: 500,
};
```

前后端各持一份并在读取时做 `{ ...DEFAULT, ...stored }` 合并（沿用 `system_settings` 的既有模式）。

### 3.2 时区口径

`answered_at` / `created_at` 一律 UTC 存储。自然日边界由服务端按 `PRACTICE_TZ_OFFSET`（默认 `+08:00`）折算为 UTC 半开区间 `[dayStartUtc, dayEndUtc)`，SQL 用 `>= / <` 过滤，**不使用 `DATE()` 或 `CONVERT_TZ`**（避免依赖 MySQL 时区表）。

---

## 4. API 设计

练题端接口全部挂 `practiceAuthRequired`，响应 `Cache-Control: no-store`，新增独立限流分组。
管理端接口挂 `authRequired + requireRole('admin')`，且仅在**非 PRACTICE_ONLY** 实例注册。

### 4.1 收藏夹（练题端）

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| `GET` | `/api/practice/favorites?page=&pageSize=&bankId=` | 收藏列表（分页；**不含**答案/解析） |
| `GET` | `/api/practice/favorites/ids?bankId=` | 当前用户收藏的题目 id 数组（供作答页批量回显收藏态） |
| `POST` | `/api/practice/favorites` | body `{ questionId }` → 收藏（幂等） |
| `DELETE` | `/api/practice/favorites/:questionId` | 取消收藏（幂等） |
| `POST` | `/api/practice/favorites/reans` | body `{ bankId? }` → 生成「练收藏题」会话 |

### 4.2 学习报告（练题端）

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| `GET` | `/api/practice/report/summary` | `{ doneTotal, correctTotal, accuracy, wrongTotal, favoriteTotal, streakDays, todayDone, todayTotal, dailyEnabled }` |
| `GET` | `/api/practice/report/trend?days=7\|30` | `[{ date, doneCount, correctCount, accuracy }]`，无记录的自然日补 0 |
| `GET` | `/api/practice/report/subjects` | `[{ subject, doneCount, correctCount, accuracy, weak }]`（正确率升序） |
| `GET` | `/api/practice/report/banks` | `[{ bankId, bankName, doneCount, totalCount, accuracy }]` |

### 4.3 每日一练（练题端）

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| `GET` | `/api/practice/daily` | `{ enabled, date, questionIds, total, doneCount, correctCount, completed, streakDays }`；`enabled=false` 时不生成任务 |
| `POST` | `/api/practice/daily/session` | 生成今日任务会话；关闭时返回业务错误「每日一练暂未开放」 |

复用不变：`POST /api/practice/check` 判分（`session.bankId` 为空串时跳过题库归属校验，跨库会话天然支持每日任务与收藏重练）。

### 4.4 后台配置（内网管理端 · admin）

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| `GET` | `/api/settings/practice` | 读取练题配置（带默认值合并） |
| `PUT` | `/api/settings/practice` | 保存练题配置（zod 校验，中文文案；越界 → 1001） |

> 挂载于现有 `settingsRouter`（`/api/settings`）下的子路径，从而天然继承「PRACTICE_ONLY 实例不注册 `settingsRouter`」的隔离性。实现委托给 `modules/practice/practiceSettings.*`。

---

## 5. 前端设计

### 5.1 路由（新增 2 条）

```
/practice/favorites   name: practice-favorites   我的收藏
/practice/report      name: practice-report      学习报告
```

`/practice/daily` 不新增路由 —— 复用作答页 `PracticeSessionPage`，通过 `query.source=daily` 进入，完成后回首页刷新打卡状态。

### 5.2 底部导航（**4 Tab · 已确认**）

```
练题(/practice/home) | 错题本(/practice/wrong-book) | 报告(/practice/report) | 我的(/practice/profile)
```

- 图标：`Collection` / `Notebook` / `TrendCharts` / `User`；
- 收藏夹入口：首页「我的收藏」卡片（与错题本卡并列）；
- 每日一练入口：首页顶部任务卡。

### 5.3 页面与组件

| 文件 | 类型 | 改动 |
| --- | --- | --- |
| `src/views/practice/PracticeFavoritesPage.vue` | 新增 | 收藏列表 + 按题库筛选 + 「练收藏题」 |
| `src/views/practice/PracticeReportPage.vue` | 新增 | 总览四宫格 + 连续打卡 + 趋势图 + 薄弱科目 + 题库概览 |
| `src/views/practice/components/PracticeTrendChart.vue` | 新增 | 轻量趋势图（纯 SVG 手写，不引入图表库） |
| `src/views/practice/components/PracticeTabBar.vue` | 修改 | 3 Tab → **4 Tab** |
| `src/views/practice/PracticeHomePage.vue` | 修改 | 顶部「每日一练」任务卡 + 「我的收藏」卡 |
| `src/views/practice/PracticeSessionPage.vue` | 修改 | 收藏按钮；每日任务模式显示「今日 n/10」与完成态 |
| `src/views/practice/PracticeProfilePage.vue` | 修改 | 「学习报告」入口行（带连续打卡天数角标） |
| `src/views/admin/SettingsPage.vue` | 修改 | 新增第 5 张卡片「公网练题」+ 独立保存 |
| `src/api/practice.ts` / `src/api/settings.ts` | 修改 | 新增练题端 12 个 + 管理端 2 个接口函数 |
| `src/types/index.ts` | 修改 | 新增 `PracticeFavorite`、`PracticeReportSummary`、`PracticeTrendPoint`、`PracticeSubjectStat`、`PracticeBankStat`、`PracticeDailyTask`、`PracticeSettings` |
| `src/constants/practiceSettings.ts` | 新增 | 练题配置默认值（与后端对齐） |
| `src/stores/settings.ts` 或新 store | 修改/新增 | 练题配置加载/保存 |

### 5.4 视觉约束（沿用一期红线）

冷静蓝 · 商务风：单一主色 `$practice-primary`、白底细边框卡片、小圆角 `$practice-radius`、无渐变、无 emoji、无大圆角；触控区 ≥ 44px；`env(safe-area-inset-bottom)`；趋势图配色沿用主色 + 中性灰，不使用红绿涨跌色。管理端卡片沿用 `el-card` 既有样式与 `$radius-lg`。

---

## 6. 隔离与安全（硬约束，不可放宽）

1. **表域**：新增 `practice_favorites` / `practice_daily_tasks` / `practice_settings` 均为 `practice_*` 前缀；`user_id` 弱关联**无外键**。
2. **只读白名单不变**：`users`（列级最小集）、`question_banks` / `questions`（且仅 `allow_practice = 1`）、`departments`（仅 id/name）。**仍绝不读写考试域表**（`exams / papers / paper_questions / paper_bank_refs / exam_records / import_batches`）。
3. **`system_settings` 继续零授权**：练题配置走独立表，一期「`practice_app` 对 `system_settings` 无权限」的约定不变。
4. **静态扫描测试**：把新增的 `practiceSettings.repo.ts` / `practiceSettings.service.ts` 加入扫描文件列表；保持「考试域表名不得出现」「`users` / `departments` 不得出现写操作」断言；`practice_settings` 属允许表。
5. **权限脚本**：`deploy/db-grants-practice.sql` 增加 3 张新表授权 —— 收藏/每日任务表 `SELECT, INSERT, UPDATE, DELETE`；`practice_settings` **仅 `SELECT`**（写入由内网实例完成）。
6. **管理端接口隔离**：`/api/settings/practice` 仅在非 `PRACTICE_ONLY` 实例注册（随 `settingsRouter` 一并跳过），公网实例物理不可达。
7. **判分口径唯一**：所有新入口最终仍走 `POST /practice/check` → `utils/grading.isAnswerCorrect`，**不得**在报告/收藏模块重复实现判分。
8. **计数服务端权威**：报告与每日任务的 done/correct 一律由服务端从 `practice_answers` 聚合，忽略客户端上报。
9. **上限与限流**：收藏上限读配置；新增 `favorites` / `report` / `daily` 三组限流（60 次/分钟·设备）。

---

## 7. 验收标准

| 编号 | 验收点 |
| --- | --- |
| AC-1 | 作答页收藏/取消收藏即时生效；退出重进状态一致；收藏列表与作答页状态一致 |
| AC-2 | 「练收藏题」可生成会话并正常判分；跨题库收藏混合练习不报错 |
| AC-3 | 收藏达到配置上限时，新增收藏被拒绝并给出明确提示 |
| AC-4 | 报告总览数字与「我的」页统计一致；逐日趋势无记录日补 0；薄弱科目标记规则可复现 |
| AC-5 | 每日任务题序稳定（刷新/重进不变）；完成后 `completed=true` 且打卡天数 +1 |
| AC-6 | 跨自然日（TZ=+08:00）任务重置、打卡连续/中断判定正确（含 UTC 边界用例） |
| AC-7 | **后台关闭每日一练后**：练题端首页无任务卡、`/daily/session` 被拒；重新打开后恢复；历史打卡数据未丢失 |
| AC-8 | **后台改题量为 N 后**：次日新任务按 N 出题；当日已生成任务不受影响（题序固定优先） |
| AC-9 | 管理端配置页仅 admin 可见可改；非 admin 调用 `/api/settings/practice` 写接口 → 403 |
| AC-10 | 未登录访问任一新增练题接口 → 401 并跳练题登录页；`PRACTICE_ONLY` 实例下 `/api/settings/practice` 与考试域路由均 404 |
| AC-11 | 隔离静态扫描测试全绿；后端与前端新增用例全绿；一期既有测试（后端 154 / 前端 47）无回归 |
| AC-12 | 移动端 375×667 与微信内置浏览器下：4 Tab 不拥挤、无横向滚动、内容与底部导航不重叠 |

---

## 8. 任务拆解

| 任务 | 内容 | 依赖 |
| --- | --- | --- |
| T01 | DB：新增 3 表 + `practice_answers` 复合索引（`schema.ts` / `schema.sql` / `init.ts`） | — |
| T02 | 后端 · 练题配置：`practiceSettings.{defaults,repo,service,schema}.ts` + 挂载 `/api/settings/practice` GET/PUT | T01 |
| T03 | 后端 · 收藏夹：repo / service / schema / router + 单测 | T01, T02 |
| T04 | 后端 · 每日一练：任务生成（固定题序）、完成度重算、打卡连击、时区工具 + 单测 | T01, T02 |
| T05 | 后端 · 学习报告：summary / trend / subjects / banks 聚合 + 单测 | T01 |
| T06 | 后端 · 加固：限流分组、隔离静态扫描 allowlist、`db-grants-practice.sql`、`.env.example` | T02–T05 |
| T07 | 前端 · 基础设施：API + 类型 + 路由 + **4 Tab 导航** | T02–T05 |
| T08 | 前端 · 收藏夹：收藏页 + 作答页收藏按钮 + 首页收藏入口 | T07 |
| T09 | 前端 · 学习报告：报告页 + 趋势图组件 + 我的页入口 | T07 |
| T10 | 前端 · 每日一练：首页任务卡 + 作答页进度态 + 完成态 + 开关降级 | T04, T07 |
| T11 | 前端 · 管理端：「公网练题」配置卡片 + 独立保存（admin） | T02, T07 |
| T12 | QA：后端/前端全量回归 + 边界（时区、上限、跨库、开关、权限）+ 移动端走查 | 全部 |

---

## 9. 风险与处置

| 项 | 风险 | 处置 |
| --- | --- | --- |
| 每日一练抽题 | 开放题库总题量不足配置题量 | 按实际题量生成；为 0 时卡片降级为「暂无可练题目」 |
| 时区 | 容器 `TZ` 与业务时区不一致导致跨日错判 | 一律用 `PRACTICE_TZ_OFFSET` 显式配置，禁止依赖系统时区；补 UTC 边界单测 |
| 趋势图 | 引入图表库会显著增大公网包体 | 纯 SVG 手写，不接受新增图表依赖 |
| 配置读写 | 管理端与练题端并发读写单行配置 | 单行 UPSERT + 应用层默认值合并；练题端只读，无写竞争 |
| 一期契约 | 修改 `PracticeSessionPage` / `PracticeHomePage` 可能影响既有 47 条前端用例 | 改动保持向后兼容；收藏态与每日任务加载失败时静默降级，不阻塞答题 |
| 配置语义 | `favoriteLimit` 调小后已有收藏超出上限 | 不回溯删除；仅限制**新增**收藏 |

已关闭的待确认项（v1.0 → v1.1）：
- ✅ 底部导航 = **4 Tab**
- ✅ 每日一练题量默认 = **10**（后台可配）
- ✅ 每日一练 = **纳入本期**
- ✅ 错题本口径 = **不改**

---

## 10. 兼容性

- 一期已交付接口签名**全部不变**，新增接口为纯增量，老客户端不受影响；
- 数据库变更全部为 `CREATE TABLE IF NOT EXISTS` + 一条 `ADD KEY`，可重复执行、无需停机；
- 底部导航由 3 Tab 变 4 Tab：仅练题端内部导航结构调整，不涉及对外接口契约；
- 管理端配置卡片为新增区块，现有 4 张卡的保存语义与接口完全不变。

---

## 11. 实施与验证记录（2026-10-12 完成）

**已交付范围**：T01–T12 全部完成。

**后端**
- 新增 3 表（`practice_favorites` / `practice_daily_tasks` / `practice_settings`）+ `practice_answers.idx_pa_user_answered` 幂等索引迁移；
- 新增模块：`practiceSettings.{defaults,repo,service,schema}.ts`、`practice.time.ts`，并扩展 `practice.{repo,service,schema,router}.ts`；
- 新增 14 个接口（练题端 12 + 管理端 2），新增限流分组 `favorites` / `report` / `daily`，新增错误码 1013（收藏上限）/ 1014（每日一练未开放）；
- 隔离加固：静态扫描扩展到 7 个练题源文件，并新增「练题代码不得引用 `system_settings`」断言；`db-grants-practice.sql` 增授权（`practice_settings` **仅 SELECT**）；`server/README.md` 权限表同步。

**前端**
- 新增 `PracticeFavoritesPage.vue` / `PracticeReportPage.vue` / `PracticeTrendChart.vue`（纯 SVG）；底部导航 3 → **4 Tab**（练题 / 错题本 / 报告 / 我的）；
- 改造 `PracticeHomePage`（每日一练卡 + 收藏卡）、`PracticeSessionPage`（收藏按钮 + 来源标记 + 今日进度）、`PracticeProfilePage`（学习报告入口）；
- 管理端 `SettingsPage.vue` 新增第 5 张卡片「公网练题」（**共用同一后台**，独立表单独立保存）。

**验证结果**

| 项 | 结果 |
| --- | --- |
| 后端全量测试 | **180 / 180 通过**（一期 154 条零回归 + 新增 `practice.enhance.api.test.ts` 26 条） |
| 前端全量测试 | **47 + 12 = 59 条通过**（一期 47 条零回归 + 新增 `practice.enhance.test.ts` 12 条） |
| 类型检查 | 后端 `tsc --noEmit` 0 错；前端 `vue-tsc --noEmit` 0 错 |
| 生产构建 | `vite build` 成功（2486 模块） |
| 开发库升级 | `npm run db:init` → 17 张表 + 索引升级完成，幂等可复跑 |
| 端到端冒烟 | 真实服务上 14 个新增接口全部 200/`code:0`；练题 token 调 `/api/settings/practice` 正确返回 401/1002 |

**遗留说明**
- 前端组件级（页面渲染）自动化用例未新增，UI 走查以类型检查 + 构建 + 人工验证为主；
- 生产部署需执行一次 `npm run db:init`（或等价 DDL）与更新后的 `deploy/db-grants-practice.sql`。
