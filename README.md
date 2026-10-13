# 企业内部在线考试系统（enterprise_exam_system）

面向企业内部使用的在线考试系统：题库管理、Excel 批量导入、多选题库组卷、考试发布、在线答题自动判分、成绩统计报表、分科室考试（科室隔离）、三角色权限控制（管理员 / 出题人 / 考生）、防作弊机制（限时自动交卷、切屏检测、浮水印、复制限制）。

已从早期「纯前端 localStorage」版本迁移为 **Vue 3 前端 + Node/Express 后端 + MySQL** 的前后端分离架构。

## 架构

```
Vue 3 (Vite, Element Plus, Pinia, Vue Router)  ──REST/JSON──▶  Express (TypeScript)  ──mysql2──▶  MySQL 8
        :5173  ──(开发代理 /api → :3001)──▶  :3001
```

- 前端统一经 `src/api/http.ts` 访问 `/api/**`；响应体约定 `{ code, message, data }`（`code=0` 成功，其余为业务错误码）。
- 权限三重同步：路由 `meta.roles` / `meta.menuKey`（前端守卫）+ 侧栏菜单按角色与「菜单权限」过滤（`src/layouts/menuConfig.ts`）+ 后端 `requireRole` 中间件；菜单目录以后端 `menuCatalog.ts` 为权威来源。
- 考试记录在开考时冻结**试卷快照**，后续修改题库/试卷不影响已开考的答卷。
- 判分与考试状态机的权威实现在后端（`server/src/modules/records/`、`server/src/utils/grading.ts`、`server/src/utils/examStatus.ts`）。

## 目录结构

```
考试1/
├─ src/                      # 前端（Vue 3 + TS）
│  ├─ api/                   # 各模块 REST 封装（唯一 axios 实例在 http.ts）
│  ├─ components/common/     # 通用组件（PageHeader/EmptyState/StatusTag/…）
│  ├─ composables/           # useRequest / usePagination / useConfirm
│  ├─ constants/             # 业务常量 + 主题色板 theme.ts
│  ├─ layouts/               # AppLayout + 菜单配置
│  ├─ router/                # 路由表 + 全局守卫
│  ├─ stores/                # Pinia（app / auth）
│  ├─ styles/                # SCSS 变量与全局样式、Element Plus 主题覆盖
│  ├─ types/                 # 全量 TS 类型（单一类型源）
│  ├─ utils/                 # 日期/格式化/考试状态/科室树等纯函数
│  └─ views/                 # 页面（admin / author / exam）
├─ server/                   # 后端（Express + TS + MySQL）
│  ├─ src/modules/           # auth/banks/questions/papers/exams/records/reports/audit/…（router·service·repo·schema）
│  ├─ src/db/                # init.ts（建表 + 幂等迁移 + 种子）、seed.ts
│  ├─ src/middleware/        # auth / role / validate / error
│  ├─ src/utils/             # 响应、错误、分页、Excel（exceljs）、PDF（pdfkit）、鉴权、JWT 等
│  └─ src/test/              # vitest + supertest（226 用例）
├─ practice-web/             # 公网练题端（独立前端工程）
├─ docs/                     # 增量 PRD 与架构设计文档
├─ deploy/                   # 部署脚本（Nginx / DB 授权）
├─ package.json              # 前端 + 编排脚本
└─ README.md
```

## 环境要求

- **Node.js 22**（`server` 使用 ESM + `NodeNext`）
- **MySQL 8**
- npm（随 Node 安装）

## 初始化

1. 复制并填写后端环境变量 `server/.env`（参考 `server/.env.example`）：

   ```ini
   PORT=3001
   DB_HOST=127.0.0.1
   DB_PORT=3306
   DB_USER=root
   DB_PASSWORD=你的密码
   DB_NAME=enterprise_exam_system
   DB_NAME_TEST=enterprise_exam_system_test
   JWT_SECRET=请替换为随机字符串
   ```

2. 安装依赖（**Windows 下建议加 `--ignore-scripts`**，规避 esbuild/rollup 安装脚本锁定问题）：

   ```bash
   npm install --ignore-scripts
   npm --prefix server install --ignore-scripts
   ```

3. 建表 + 幂等迁移 + 写入种子数据（可重复执行）：

   ```bash
   npm run db:init
   ```

   > 该脚本 = `server` 的 `db:init`（`tsx src/db/init.ts`），会创建 `enterprise_exam_system` 库的 **25 张表**、按需执行幂等结构升级（补列 / 扩 ENUM），并幂等写入种子数据。
   > 需要**清空重建**时执行：`npm --prefix server run db:reset`（仅作用于 `enterprise_exam_system`）。

## 开发

```bash
npm run dev:server   # 启动后端（tsx watch，:3001）
npm run dev          # 启动前端（Vite，:5173），已配置 /api 代理到 :3001
```

浏览器访问 <http://localhost:5173>。前端开发服务器将 `/api/**` 代理至 `http://localhost:3001`，无需额外配置跨域。

## 构建与测试

```bash
# 前端
npm run typecheck        # vue-tsc --noEmit
npm run test             # vitest（28 用例）
npm run build            # vue-tsc + vite build（产物 dist/）
npm run preview          # 预览构建产物

# 后端
npm --prefix server run typecheck   # tsc --noEmit
npm --prefix server run test        # vitest + supertest（318 用例）
npm --prefix server run build       # 编译到 server/dist
npm --prefix server run start       # 运行编译产物
```

## 默认账号

| 角色 | 账号 | 密码 | 说明 |
| ---- | -------- | -------- | ---- |
| 管理员 | `admin` | `admin123` | 科室/用户管理、考试发布、成绩报表与切屏审查、人工阅卷、补考审批、审计日志、PDF 导出 |
| 出题人 | `author` | `author123` | 题库管理（仅被授权题库）、Excel 导入、多选题库组卷、人工阅卷 |
| 考生 | `zhangsan` | `123456` | 张三（研发部 dept-rd） |
| 考生 | `lisi` | `123456` | 李四（市场部 dept-mkt） |
| 考生 | `wangwu` | `123456` | 王五（研发部 dept-rd） |

种子数据：2 个科室（研发部 / 市场部，均为顶层节点；多级科室可在「科室管理」页自行创建父子层级）、2 个题库（安全知识 6 题 / 企业文化 4 题）、1 份示例试卷（10 题）、1 场覆盖两个科室的示例考试；并将演示出题人 `user-author` 授权到两个示例题库。

## 功能清单

- **题库管理**：题库分类增删改查（含级联删除语义）、题库内试题的手动新增/编辑/删除、按题型/科目/关键字筛选与分页；支持单选/多选/判断/填空/简答五种题型。
- **Excel 批量导入**：12 列模板下载；`.xlsx`（≤5MB / ≤2000 行）上传 → 服务端逐行校验 → 预览成功/失败明细 → 单事务写入成功行（部分成功）；科目与题库分类不一致时黄色警告；前端可导出错误报告 CSV。
- **多选题库组卷**：多选来源题库；「按题型抽题」（题量不足返回 shortages 并阻断）或「手动勾选」；逐题调分、实时总卷面分；试卷列表/预览/编辑。
- **考试管理**：绑定试卷、多选参与科室（支持科室树级联）、时间窗/时长/及格线、作答次数上限；时间窗实时推导状态；已产生成绩记录的考试不可删除。
- **在线答题（考生）**：仅显示本科室（含上级科室级联）考试；开考（幂等续考）→ 试卷快照答题 → 倒计时（到点自动交卷）→ 节流暂存 → 切屏检测与上报 → 交卷即时判分（简答题转「待阅卷」）→ 成绩明细（逐题对错 + 解析 + 切屏记录 + 主观题得分）。
- **成绩报表（管理员）**：成绩列表（含切屏异常标红）、分数段分布、科室对比、错题排行（ECharts）、切屏审查、成绩导出 Excel / PDF。
- **人手一卷（v1.4）**：考试级/全局可配「题目乱序 + 选项乱序」，以 `(examId, userId, attemptNo)` 为种子确定性打乱，续考结果稳定。
- **补考与通知（v1.5）**：考生申请补考 → 管理员审批（仅「作答次数=1 且不及格」可申请，批准后额外授予 1 次）；站内/邮件通知（nodemailer，fail-open）；用户 Excel 导入；按角色的「菜单权限」配置。
- **防作弊与公平性（v1.6①）**：答题页铺陈「姓名 + 账号」浮水印 + 复制/剪切/右键/选择/拖拽限制（后台可配置）；成绩报表「切屏审查」Tab 展示切屏时间线。
- **题型扩展与人工阅卷（v1.6②）**：填空（多空逐空自动判分：`trim` + 忽略大小写）+ 简答（人工阅卷，记录状态 `pending_review`）；新增「人工阅卷」页（待阅卷列表 + 逐题给分）。
- **组织与权限精细化（v1.6③）**：多级科室树（考试按**祖先链**级联授权，选父科室覆盖整棵子树）；出题人题库授权（`bank_authors`，`author` 仅能管理被授权题库）。
- **数据运营与审计（v1.6④）**：操作审计日志（用户/考试/题库/菜单权限写操作留痕，`fail-open`）+ 审计日志查询页；数据看板「及格率趋势 + 科目错题归因」。
- **考试运营闭环（v1.7①）**：试卷 PDF 导出（含答案版/考生版）；成绩复核申请与审批流（`score_appeals`，可配开关与时限，通过可改分）；特殊考试安排（`exam_exceptions`：加时 / 额外次数 / 免考）。
- **题库与数据运营深化（v1.7②）**：知识点（标签）体系与筛选；试卷克隆 + 题目批量编辑；看板下钻与筛选；审计日志导出与保留归档。
- **安全与合规加固（v1.7③）**：图形验证码（替换自研算术题，`utils/captcha.ts`）；登录审计（`login_logs`）+ 密码策略（复杂度/有效期可配）+ 登录会话与设备管理（`user_sessions`，可远程下线）+ 两步验证（零依赖 TOTP，`utils/totp.ts`）；简答富文本/图片作答（服务端白名单净化 XSS）与评分细则（rubric 分档给分）；题库授权批量维护（按科室/角色圈选）。
- **工程化与稳定性（v1.7④）**：实时考试监控大屏（轮询：花名册 + 进度 + 剩余时长 + 监考加时 + 强制交卷）；题库复制（含试题与授权）；数据归档与读路径 union（`exam_records_archive`，历史报表/成绩透明）+ 复合索引优化；通知文案模板化（8 事件可配文案）。

## 数据表（30 张，一句话说明）

| 表 | 说明 |
| --- | --- |
| `departments` | 科室（组织单位，v1.6③ 起支持 `parent_id` 父子层级） |
| `users` | 用户账号（角色/所属科室/状态，密码 bcrypt 哈希） |
| `question_banks` | 题库（分类 / 科目域 / 对外开放练题开关） |
| `questions` | 试题（题型/题干/选项/答案/默认分值/科目） |
| `papers` | 试卷（名称/总分/创建者） |
| `paper_questions` | 试卷-试题关联（每题分值、排序） |
| `paper_bank_refs` | 试卷-来源题库关联（组卷来源） |
| `exams` | 考试（试卷/参与科室/时间窗/时长/及格线/次数上限/乱序与防作弊开关） |
| `exam_records` | 考试记录（试卷快照/答案/得分/主观题得分/切屏事件/状态） |
| `import_batches` | 试题 Excel 导入批次历史 |
| `system_settings` | 系统设置（单行 JSON：默认分值、及格线、乱序、防作弊、通知等） |
| `practice_progress` | 练题进度（继续练习） |
| `practice_answers` | 练题作答流水 |
| `practice_wrong_book` | 练题错题本 |
| `practice_favorites` | 练题收藏夹 |
| `practice_daily_tasks` | 每日一练任务 |
| `practice_settings` | 练题端设置（每日题量/目标等） |
| `login_attempts` | 登录失败与锁定记录 |
| `rate_limit_buckets` | 限流令牌桶（持久化） |
| `notifications` | 站内/邮件通知 |
| `exam_retakes` | 补考申请（`exam_id` + `user_id` 唯一） |
| `user_import_batches` | 用户 Excel 导入批次历史 |
| `menu_permissions` | 菜单权限（按角色一行，`menu_keys` JSON） |
| `bank_authors` | 题库-出题人授权映射（v1.6③） |
| `audit_logs` | 操作审计日志（v1.6④，自包含无外键） |
| `score_appeals` | 成绩复核申请（v1.7①，`record_id` 唯一，状态 pending/approved/rejected） |
| `exam_exceptions` | 特殊考试安排（v1.7①，按 考试×考生：加时 / 额外次数 / 免考） |
| `login_logs` | 登录审计日志（v1.7③，自包含无外键，区分管理端/练题端来源） |
| `user_sessions` | 登录会话与设备（v1.7③，支持远程下线与强制登出） |
| `exam_records_archive` | 考试记录归档表（v1.7④，无外键可长期保留；历史读路径 union 合并） |

## ⚠️ 红线说明

- 本系统只使用数据库 **`enterprise_exam_system`**（30 张表）。
- 同名/同实例下的 **`exam_system`** 库属于**其他项目**（17 张表），**严禁对其执行任何 DDL/DML 操作**。所有脚本、测试与初始化均仅针对 `enterprise_exam_system`（及测试库 `enterprise_exam_system_test`）。
