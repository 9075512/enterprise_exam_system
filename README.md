# 企业内部在线考试系统（enterprise_exam_system）

面向企业内部使用的在线考试系统：题库管理、Excel 批量导入、多选题库组卷、考试发布、在线答题自动判分、成绩统计报表、分科室考试（科室隔离）、三角色权限控制（管理员 / 出题人 / 考生）、防作弊机制（限时自动交卷、切屏检测）。

已从早期「纯前端 localStorage」版本迁移为 **Vue 3 前端 + Node/Express 后端 + MySQL** 的前后端分离架构。

## 架构

```
Vue 3 (Vite, Element Plus, Pinia, Vue Router)  ──REST/JSON──▶  Express (TypeScript)  ──mysql2──▶  MySQL 8
        :5173  ──(开发代理 /api → :3001)──▶  :3001
```

- 前端统一经 `src/api/http.ts` 访问 `/api/**`；响应体约定 `{ code, message, data }`（`code=0` 成功，其余为业务错误码）。
- 权限三重同步：路由 `meta.roles`（前端守卫）+ 侧栏菜单按角色过滤（`src/layouts/menuConfig.ts`）+ 后端 `requireRole` 中间件。
- 考试记录在开考时冻结**试卷快照**，后续修改题库/试卷不影响已开考的答卷。
- 判分与考试状态机的权威实现在后端（`server/src/modules/records/`、`server/src/utils/examStatus.ts`）。

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
│  ├─ utils/                 # 日期/格式化/考试状态等纯函数
│  └─ views/                 # 页面（admin / author / exam）
├─ server/                   # 后端（Express + TS + MySQL）
│  ├─ src/modules/           # auth/banks/questions/papers/exams/records/reports/…（router·service·repo·schema）
│  ├─ src/db/                # init.ts（建表 + 种子）、seed.ts
│  ├─ src/middleware/        # auth / role / validate / error
│  ├─ src/utils/             # 响应、错误、分页、Excel（exceljs）、JWT 等
│  └─ src/test/              # vitest + supertest（55 用例）
├─ docs/                     # 增量 PRD 与架构设计文档
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

3. 建表 + 写入种子数据（幂等，可重复执行）：

   ```bash
   npm run db:init
   ```

   > 该脚本 = `server` 的 `db:init`（`tsx src/db/init.ts`），会创建 `enterprise_exam_system` 库的 10 张表并幂等写入种子数据。
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
npm run test             # vitest（18 用例）
npm run build            # vue-tsc + vite build（产物 dist/）
npm run preview          # 预览构建产物

# 后端
npm --prefix server run typecheck   # tsc --noEmit
npm --prefix server run test        # vitest + supertest（55 用例）
npm --prefix server run build       # 编译到 server/dist
npm --prefix server run start       # 运行编译产物
```

## 默认账号

| 角色 | 账号 | 密码 | 说明 |
| ---- | -------- | -------- | ---- |
| 管理员 | `admin` | `admin123` | 科室/用户管理、考试发布、成绩报表与切屏审查 |
| 出题人 | `author` | `author123` | 题库管理、Excel 导入、多选题库组卷 |
| 考生 | `zhangsan` | `123456` | 张三（研发部 dept-rd） |
| 考生 | `lisi` | `123456` | 李四（市场部 dept-mkt） |
| 考生 | `wangwu` | `123456` | 王五（研发部 dept-rd） |

种子数据：2 个科室、2 个题库（安全知识 6 题 / 企业文化 4 题）、1 份示例试卷（10 题满分 100）、1 场覆盖两个科室的示例考试。

## 功能清单

- **题库管理**：题库分类增删改查（含级联删除语义）、题库内试题的手动新增/编辑/删除、按题型/科目/关键字筛选与分页。
- **Excel 批量导入**：12 列模板下载；`.xlsx`（≤5MB / ≤2000 行）上传 → 服务端逐行校验（题型/题干/选项/答案/分值 7 条规则）→ 预览成功/失败明细 → 单事务写入成功行（部分成功）；科目与题库分类不一致时黄色警告；前端可导出错误报告 CSV。
- **多选题库组卷**：多选来源题库；「按题型抽题」（题量不足返回 shortages 并阻断）或「手动勾选」；逐题调分、实时总卷面分；试卷列表/预览/编辑。
- **考试管理**：绑定试卷、多选参与科室、时间窗/时长/及格线；时间窗实时推导状态；已产生成绩记录的考试不可删除。
- **在线答题（考生）**：仅显示本科室考试；开考（幂等续考）→ 试卷快照答题 → 倒计时（到点自动交卷）→ 1.5s 节流暂存 → 切屏检测与上报 → 交卷即时判分 → 成绩明细（逐题对错 + 解析 + 切屏记录）。
- **成绩报表（管理员）**：成绩列表（含切屏异常标红）、分数段分布、科室对比、错题排行（ECharts）。

## 数据表（10 张，一句话说明）

| 表 | 说明 |
| --- | --- |
| `departments` | 科室（组织单位） |
| `users` | 用户账号（角色/所属科室/状态，密码 bcrypt 哈希） |
| `question_banks` | 题库（分类 / 科目域） |
| `questions` | 试题（题型/题干/选项/答案/默认分值/科目） |
| `papers` | 试卷（名称/总分/创建者） |
| `paper_questions` | 试卷-试题关联（每题分值、排序） |
| `paper_bank_refs` | 试卷-来源题库关联（组卷来源） |
| `exams` | 考试（试卷/参与科室/时间窗/时长/及格线） |
| `exam_records` | 考试记录（试卷快照/答案/得分/切屏事件） |
| `import_batches` | Excel 导入批次历史（成功/失败数、错误明细） |

## ⚠️ 红线说明

- 本系统只使用数据库 **`enterprise_exam_system`**（10 张表）。
- 同名/同实例下的 **`exam_system`** 库属于**其他项目**（17 张表），**严禁对其执行任何 DDL/DML 操作**。所有脚本、测试与初始化均仅针对 `enterprise_exam_system`（及测试库 `enterprise_exam_system_test`）。
