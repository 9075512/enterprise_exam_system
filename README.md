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
│  ├─ components/common/     # 通用组件（PageHeader/EmptyState/BatchActionBar/StatusTag/…）
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
│  └─ src/test/              # vitest + supertest（另含 modules/、utils/ 内联用例）
├─ practice-web/             # 公网练题端（独立前端工程）
├─ docs/                     # 增量 PRD 与架构设计文档
├─ deploy/                   # 部署脚本（Nginx / DB 授权）
├─ package.json              # 前端 + 编排脚本
└─ README.md
```

## 环境要求

> 面向最终用户和运维人员的完整操作步骤见 [`docs/18-使用说明与部署教程.md`](docs/18-使用说明与部署教程.md)。

- **Node.js 22.19+ 或 24**（`server` 使用 ESM + `NodeNext`；当前前端测试依赖 `undici` 要求 Node ≥22.19，Node 20 无法启动 jsdom 测试）
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
   STORAGE_DIR=storage/attachments
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

   > 该脚本 = `server` 的 `db:init`（`tsx src/db/init.ts`），会创建 `enterprise_exam_system` 库的 **37 张表**、按需执行幂等结构升级（补列 / 扩 ENUM），并幂等写入种子数据。
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
npm run test             # vitest（工具函数 / store / 通用组件 / composables / 样式护栏）
npm run build            # vue-tsc + vite build（产物 dist/）
npm run preview          # 预览构建产物

# 后端
npm --prefix server run typecheck   # tsc --noEmit
npm --prefix server run test        # vitest + supertest
npm --prefix server run build       # 编译到 server/dist
npm --prefix server run start       # 运行编译产物

# 练题端
npm --prefix practice-web run typecheck   # vue-tsc --noEmit
npm --prefix practice-web run test        # vitest（配置默认值 / 登录 store / 组件 / 样式护栏）
```

## 默认账号

| 角色 | 账号 | 密码 | 说明 |
| ---- | -------- | -------- | ---- |
| 管理员 | `admin` | `admin123` | 科室/用户管理、考试发布、成绩报表与切屏审查、人工阅卷、补考审批、审计日志、PDF 导出 |
| 出题人 | `author` | `author123` | 题库管理（仅被授权题库）、Excel 导入、多选题库组卷、人工阅卷 |
| 考生 | `zhangsan` | `123456` | 张三（研发部 dept-rd） |
| 考生 | `lisi` | `123456` | 李四（市场部 dept-mkt） |
| 考生 | `wangwu` | `123456` | 王五（研发部 dept-rd） |

种子数据：2 个科室（研发部 / 市场部，均为顶层节点；多级科室可在「科室管理」页自行创建父子层级）、2 个根级叶子科目题库（安全知识 6 题 / 企业文化 4 题）、1 份示例试卷（10 题）、1 场覆盖两个科室的示例考试；并将演示出题人 `user-author` 设为两个示例题库的编辑人员。

## 功能清单（按功能域归纳）

> 按当前能力组织；括号内标注引入 / 增强的版本，逐版交付细节见 `docs/` 下各 PRD 与交付说明。

### 题库与试题
- **树形科目题库**：科目名称就是题库名称；父级科目仅作目录，叶子科目维护试题。支持任意层级、排序、启停继承、部门/人员浏览权限、编辑人员及最近覆盖节点继承规则。
- **Excel 批量导入**：12 列模板下载；`.xlsx`（≤5MB / ≤2000 行）上传 → 服务端逐行校验 → 预览明细 → 单事务写入；导入后科目统一以目标题库名称为准。
- **知识点标签（v1.7②）**：知识点体系与题目筛选。
- **内容去重复用（v1.8⑤）**：题库复制与 Excel 导入按「题型+题干+选项+答案」内容指纹去重（复制同批内同内容只建一行；导入可选「跳过重复题目」，默认关闭），降低题库膨胀。
- **题库复制（v1.7④）**：含试题与授权一并复制。
- **浏览与编辑授权**：`bank_view_departments` / `bank_view_users` 控制浏览范围，`bank_authors` 作为编辑人员；编辑人员隐含浏览权限，管理员始终拥有全部权限。

### 试卷与组卷
- **多选题库组卷**：多选来源题库；「按题型抽题」（题量不足返回 shortages 并阻断）或「手动勾选」；逐题调分、实时总卷面分；试卷列表/预览/编辑。
- **人手一卷（v1.4）**：考试级/全局可配「题目乱序 + 选项乱序」，以 `(examId, userId, attemptNo)` 为种子确定性打乱，续考结果稳定。
- **试卷克隆与题目批量编辑（v1.7②）**。
- **试卷 PDF 导出（v1.7①）**：含答案版 / 考生版。

### 考试与考务
- **考试管理**：绑定试卷、多选参与科室（支持科室树级联）、时间窗/时长/及格线、作答次数上限；时间窗实时推导状态；已产生成绩记录的考试不可删除。
- **特殊考试安排（v1.7①）**：`exam_exceptions`，按 考试×考生 加时 / 额外次数 / 免考。
- **实时考试监控（v1.7④ 建，v1.8① 升级 SSE）**：大屏含花名册 + 进度 + 剩余时长 + 监考加时 + 强制交卷；推送由 15s 轮询升级为 **SSE**（零依赖；同场考试的全部监考页**共享一次查库**，按考试聚合广播；15s 心跳 + 连接数上限），推送不可用时前端**自动回退轮询**。
- **补考管理（v1.5）**：考生申请 → 管理员审批（仅「作答次数=1 且不及格」可申请，批准后额外授予 1 次）。
- **成绩复核（v1.7①）**：`score_appeals` 申请与审批流（可配开关与时限，通过可改分）。
- **考务按考试维度打通（v1.9④）**：待阅卷 / 补考 / 复核三个列表支持 `examId` 过滤、`?examId=` 直达并显示考试筛选器；考试管理行操作「补考 / 复核 / 阅卷」一键直达（自动按该考试过滤）。

### 在线答题与防作弊
- **在线答题（考生）**：仅显示本科室（含上级科室级联）考试；开考（幂等续考）→ 试卷快照答题 → 倒计时（到点自动交卷）→ 节流暂存 → 切屏检测与上报 → 交卷即时判分（简答题转「待阅卷」）→ 成绩明细（逐题对错 + 解析 + 切屏记录 + 主观题得分）。
- **防作弊与公平性（v1.6①）**：答题页铺陈「姓名 + 账号」浮水印 + 复制/剪切/右键/选择/拖拽限制（后台可配置）；成绩报表「切屏审查」Tab 展示切屏时间线。
- **题型扩展（v1.6②）**：填空（多空逐空自动判分：`trim` + 忽略大小写）+ 简答（转人工阅卷，记录状态 `pending_review`）。
- **简答富文本/图片作答（v1.7③，v1.8④ 对象存储）**：作答图片支持**粘贴/选图上传**（服务端落盘 `storage/attachments/yyyy/MM`，可替换为云对象存储），作答内容经**服务端白名单净化**（防 XSS），答案回填站内带签名 URL，不再内联 base64；读取走**双通道鉴权**（Bearer 归属校验 / HMAC 签名 URL），净化白名单收敛到站内前缀。

### 判分与阅卷
- **人工阅卷（v1.6②）**：「人工阅卷」页（待阅卷列表 + 逐题给分）。
- **评分细则 rubric（v1.7③）**：简答分档给分。

### 成绩报表与数据运营
- **成绩报表（管理员）**：成绩列表（含切屏异常标红）、分数段分布、科室对比、错题排行（ECharts）、切屏审查、成绩导出 Excel / PDF。
- **数据看板（v1.6④，v1.7② 下钻）**：及格率趋势 + 科目错题归因，支持下钻与筛选。
- **数据归档（v1.7④ 建，v1.8③ 自动化）**：`exam_records_archive` 归档表（无外键可长期保留；历史读路径 union 合并，历史报表/成绩透明）+ 复合索引优化；归档定时任务（开关 + 执行时点可配，单飞 + 每天一次 + 系统 actor 审计；默认关闭），支持「立即执行一次」。
- **审计日志（v1.6④，v1.7② 导出归档）**：用户/考试/题库/菜单权限写操作留痕（`fail-open`）+ 查询页 + 导出与保留归档。

### 组织·账号·安全
- **多级科室树（v1.6③）**：考试按**祖先链**级联授权，选父科室覆盖整棵子树。
- **用户 Excel 导入（v1.5）**。
- **菜单权限（v1.5）与侧栏分组（v1.9②）**：按角色的「菜单权限」配置；21 项菜单归 6 组可折叠二级分组（数据中心 / 教学资源 / 考试运营 / 练题运营 / 组织与系统 / 考生中心，默认展开当前组）；分组是**纯展示层**，菜单 key 与权限矩阵不变。
- **登录安全（v1.7③）**：图形验证码（`utils/captcha.ts`）；登录审计（`login_logs`，区分管理端/练题端来源）；密码策略（复杂度/有效期可配）；登录会话与设备管理（`user_sessions`，可远程下线）。
- **两步验证（v1.7③ 建，v1.8② 增强）**：零依赖 TOTP（`utils/totp.ts`）；恢复码（10 个，一次性、仅存哈希、可重新生成）+ 管理员强制重置（清空密钥、作废恢复码、撤销会话并通知本人）。

### 通知
- **站内/邮件通知（v1.5，v1.7④ 模板化）**：nodemailer（fail-open）；通知文案模板化（可配文案）。

### 系统设置
- **系统设置（v1.9③ 重排）**：7 类（考试默认值 / 作答与防作弊 / 阅卷与复核 / 账号与安全 / 通知与模板 / 数据与归档 / 网站与品牌），每类有说明文案、组内再分组；补齐 3 个「后端有、前端无入口」的设置项（审计保留天数、自动归档开关与时点）。

### 练题端（公网）
- **练题可见性（v1.9①）**：题库必须同时为有效叶子、`allow_practice=1` 且当前用户命中科目浏览权限；`POST /api/banks/practice/batch` 批量开/关（仅 admin，审计留痕），练题首页按同一科目树展示可见题库；无题可抽不再返回空会话（→ 1014）。
- **练题设置（v1.9⑤）**：11 项配置 —— 默认练题方式、单次题量上下限、作答后是否展示答案/解析、每日一练重置时点与最少题量、错题本连续答对自动移除阈值、学习报告/错题本/收藏夹三个页面入口开关；`GET /api/practice/config` 供练题端读取，功能关闭时接口统一返回 1017。
- **打卡与激励（v2.0⑤）**：**零迁移** —— 连续打卡天数与 9 枚成就徽章（初次练题 / 坚持三天 / 一周不辍 / 月度恒心 / 百题斩 / 五百题达人 / 精准射手 / 每日一练达人 / 错题清零）全部由既有 `practice_answers` / `practice_daily_tasks` / `practice_wrong_book` 派生；**今日未练从昨日回溯**（不因「今天还没练」归零）、断链后保留历史最长纪录；`GET /api/practice/achievements` 与 `achievementEnabled` 开关（关闭 → 练题端隐藏入口，接口 1017）。

### 公告与内容运营
- **公告与轮播图（v1.9⑥）**：`announcements` / `banners` 两表与「公告与轮播」菜单（公告 / 轮播图两页签）。一份内容可选发布到 **考试端 / 练题端 / 两端**，支持启停、置顶、排序与**生效时间窗**；可见性口径统一在服务端判定（`enabled=1` 且 `target ∈ {scope, both}` 且在时间窗内）。管理端 `/api/content/*` 仅 admin；考生侧考试端走 `GET /api/content/feed?scope=exam`，练题端走 `GET /api/practice/feed`（公网实例对两表**仅 SELECT**）。
- **公告富文本与图片（v2.0①）**：公告正文由纯文本升级为富文本（长度上限 5000 → 20000），管理端换用富文本编辑器（加粗 / 列表 / 插入图片 / 粘贴截图，图片走对象存储回填站内签名 URL）。**安全边界放在服务端**：新建/编辑均经 `sanitizeRichText` 白名单净化（危险标签连内容删除、`on*` 属性剔除、图片仅接受内联 `data:image` 与站内附件签名 URL），净化后为空 → 1001；前端 `v-html` 只渲染已净化内容。附带**重要公告首次进入强提醒**（本地标记保证同一公告只提醒一次）。
- **已读 / 触达统计（v2.0③）**：`announcement_reads` / `banner_clicks` 两表，唯一键按「内容 + 用户 + 端」去重 + `INSERT IGNORE`，**上报天然幂等**；双端在打开详情 / 强提醒弹出 / 点击轮播时上报（失败静默），管理端列表回传阅读 / 点击人数并提供「触达概览」弹层（受众规模 + 阅读率 / 点击率）。顺带修复轮播列表按关键字搜索引用不存在列的缺陷。
- **预约发布与批量上下线（v2.0④）**：**零新调度** —— 预约发布复用既有生效时间窗（`start_at` 未到即未生效，`end_at` 到点自动下线）；`POST /api/content/announcements|banners/batch`（批量上线 / 下线 / 删除，≤200 条，返回受影响行数并落审计），管理端两表加多选列与批量按钮。

### 考试端首页
- **考生首页（v1.9⑦ 建，v2.0② 后端化，v2.0⑥ 个性化）**：考生默认落地页「首页」（`/exam/home`，菜单 key `home`，登录与越权重定向均落此页），聚合**轮播图与公告**（复用考试端内容看板）、**未读消息**（点击进消息中心）与**快捷入口**（我的考试 / 我的成绩 / 我的补考 / 消息中心）；统计（待考 / 进行中 / 已交卷 / 平均分 + **及格率**）、最近 10 次成绩趋势与待办（待考 / 未交卷 / 可补考 / 未读消息）由 `GET /api/home/summary` 一次返回，统计直接查 `exam_records ∪ exam_records_archive` 派生源，**全量口径不受前端分页上限影响**；管理端「首页配置」（`home_dept_configs` 表）按科室下发**快捷入口启停 / 文案覆盖**与**推荐练题题库**（最多 6 个），生效优先级 **本科室配置行 → 全局默认行（`*`）→ 内置默认**，按行覆盖不做逐项合并；推荐题库保存时校验 `allow_practice = 1`、**解析时二次过滤**（配置后被关闭对外练题则自动摘除，不留死链）。

## 数据表（37 张，一句话说明）

| 表 | 说明 |
| --- | --- |
| `departments` | 科室（组织单位，v1.6③ 起支持 `parent_id` 父子层级） |
| `users` | 用户账号（角色/所属科室/状态，密码 bcrypt 哈希） |
| `question_banks` | 科目题库树（父级/排序/状态/权限继承/练题开关；`category` 仅兼容保留） |
| `questions` | 试题（题型/题干/选项/答案/默认分值；兼容科目字段始终同步为题库） |
| `papers` | 试卷（名称/总分/创建者） |
| `paper_questions` | 试卷-试题关联（每题分值、排序） |
| `paper_bank_refs` | 试卷-来源题库关联（组卷来源） |
| `exams` | 考试（试卷/参与科室/时间窗/时长/及格线/次数上限/乱序与防作弊开关） |
| `exam_records` | 考试记录（试卷快照/答案/得分/主观题得分/切屏事件/状态） |
| `import_batches` | 试题 Excel 导入批次历史 |
| `system_settings` | 系统设置（单行 JSON：默认分值、及格线、乱序、防作弊、通知等） |
| `practice_progress` | 练题进度（继续练习） |
| `practice_answers` | 练题作答流水 |
| `practice_wrong_book` | 练题错题本（v1.9⑤ 起含 `correct_streak`，连续答对达阈值自动移出） |
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
| `user_recovery_codes` | 两步验证恢复码（v1.8②，仅存 bcrypt 哈希，一次性使用） |
| `attachments` | 富文本附件（v1.8④，图片作答对象存储元数据；文件本体落盘 `server/storage/attachments`） |
| `announcements` | 公告（v1.9⑥，发布范围 exam/practice/both + 启停 + 置顶 + 生效时间窗；v2.0① 正文富文本） |
| `banners` | 轮播图（v1.9⑥，图片地址 + 跳转链接 + 排序 + 发布范围 + 生效时间窗） |
| `announcement_reads` | 公告已读回执（v2.0③，按「公告 + 用户 + 端」唯一，`INSERT IGNORE` 幂等） |
| `banner_clicks` | 轮播点击回执（v2.0③，按「轮播 + 用户 + 端」唯一，`INSERT IGNORE` 幂等） |
| `home_dept_configs` | 考生首页个性化配置（v2.0⑥，`department_id` 主键，`*` 为全局默认；快捷入口启停/文案 + 推荐题库） |

## 项目清理记录（2026-10-15）

- 按入口、动态路由、组件自动导入与测试引用检查了三个工程；当前生产依赖均有实际使用，保留依赖清单与锁文件。
- 删除未使用的 `src/components/common/ConfirmDialog.vue`、`src/utils/id.ts`，以及练题端的 `LoadingDots.vue`、`RingProgress.vue`，同步移除组件类型声明中的残留引用。
- 清理 16 处未使用的导入、局部变量和辅助函数；PDF 导出行高计算改用 `forEach`，不再创建无人使用的数组。
- 将两端 `dist-verify/`、临时登录截图、`.vitest-tmp/` 及三个工程的 `node_modules/.vite/` 缓存移入回收站，共移出约 95 MB 文件；保留验证通过的正式 `dist/` 构建产物，后续构建会更新它们。
- 保留历史设计稿、交付截图、架构文档、部署 SQL、旧 React 备份、工作区记录、环境配置和上传附件；这些内容有参考、部署或恢复用途。
- 验证：管理/考试前端 234 项、练题前端 33 项、后端 545 项测试全部通过；三个工程类型检查和构建通过。前端测试使用现有 Node 24 运行。
- 清理时发现题库复制弹窗缺少入口，保留了业务功能代码；后续优化已补回卡片上的「复制题库」操作。

## 项目优化记录（2026-10-15）

- 请求与分页统一采用「仅最新请求回填」规则，防止快速查询、翻页时旧结果覆盖新结果；页面离开后不再回填异步状态，分页失败可记录和重试。
- 数据看板复用请求保护；成绩报表切换考试时立即清空旧报表、成绩与切屏审查数据，取消选择会作废在途列表响应。登录日志、审计日志重新查询与重置筛选时回到第一页。
- 系统设置与公开品牌设置合并并发请求，所有调用方都等待同一次加载；保存成功后，迟到的旧加载结果不能覆盖新设置。练题配置加载失败后允许重试，重置后忽略旧响应。
- 两端 HTTP 层对业务错误统一支持静默提示，主动取消请求不再弹网络异常；练题端补齐 `skipAuthRedirect` 的会话保护语义。
- 恢复题库复制入口，并让卡片操作栏在窄卡片内换行。
- 新增 24 项回归测试，覆盖请求乱序、卸载、分页清空、配置加载等待与恢复、HTTP 静默错误和取消；管理/考试前端共 251 项、练题前端共 40 项测试通过，两端严格类型检查（含未使用声明检查）及生产构建通过。验证使用 Node 24。

## ⚠️ 红线说明

- 本系统只使用数据库 **`enterprise_exam_system`**（37 张表）。
- 同名/同实例下的 **`exam_system`** 库属于**其他项目**（17 张表），**严禁对其执行任何 DDL/DML 操作**。所有脚本、测试与初始化均仅针对 `enterprise_exam_system`（及测试库 `enterprise_exam_system_test`）。
