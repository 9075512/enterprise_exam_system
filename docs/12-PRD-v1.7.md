# 12 · PRD v1.7 —— 考试系统深化（规划草案）

> **状态：范围已确认，分期交付中**（用户 2026-10-13 拍板：**四期全做**；**引入 2FA**；**暂不做 Docker/CI**；**暂不做移动端 H5**）
> 基线版本：v1.6（`b46fbf1`）
> 上游依据：`docs/11-交付说明-v1.6.md` §11 已知限制、§12 后续建议
> 贯穿原则不变：**能做开关/阈值/模板的，一律配置化**；**每期独立实现 + 测试 + 提交**，两端 typecheck/test 全绿。

## 0. 范围确认（2026-10-13）

| 决策项 | 结论 |
| --- | --- |
| 范围 | **四期全做**（① ② ③ ④） |
| 2FA（T2 内） | **引入** |
| Docker / CI / Playwright（T4） | **暂不需要**（第四期剔除 T4，其余照做） |
| 移动端 H5 | **暂不需要** |

**进度**

| 期 | 主题 | 状态 |
| --- | --- | --- |
| ① | 考试运营闭环（O1 试卷 PDF / O2 成绩复核 / O3 特殊安排） | ✅ 已完成 |
| ② | 题库与数据运营深化（Q1–Q4） | ✅ 已完成 |
| ③ | 安全与合规加固（T1 / T2 / S1 / S2） | ✅ 已完成（③-a：T1+T2；③-b：S1+S2） |
| ④ | 工程化与稳定性（T3 / T5 / S3 / S4，不含 T4） | ⏳ 待开始 |

---

## 1. 基线现状

| 维度 | 现状 |
| --- | --- |
| 数据表 | 25 张（v1.6 新增 `bank_authors` / `audit_logs`） |
| 后端测试 | 16 个文件 / 226 用例全绿；typecheck 0 错 |
| 前端测试 | 5 个文件 / 28 用例全绿；typecheck 0 错 |
| 能力闭环 | 组织/用户/题库/组卷/考试/阅卷/成绩/报表/审计/练题端 全链路可用 |
| 已配置化 | `system_settings` 全局开关、考试级三态继承（切屏强制交卷 / 随机组卷 / 题目选项乱序 / 补考） |

**遗留待办（v1.6 自述）**

1. PDF 目前仅覆盖「成绩明细表」，**试卷本身不可导出打印**。
2. 审计日志**只读不可导出**，且无保留/归档策略（长期膨胀）。
3. 简答题**纯文本作答**，无富文本/图片，无评分细则（rubric）。
4. 出题人题库授权**只能逐库逐个添加**，无批量维护。
5. 看板**无按科室下钻**、无时间范围筛选。

**更早遗留（体检挂账）**

6. 验证码为**自研算术题**，机器暴破强度有限。
7. 限流已落库（`rate_limit_buckets`，fail-open），但多实例部署仍建议前置网关统一限流。
8. PDF 中文字体依赖运行环境（已有 `PDF_FONT_PATH` 兜底）。

---

## 2. 候选功能池

> 粗估仅表相对规模：S（≤1 天）/ M（2–3 天）/ L（≥4 天）。风险指对既有闭环的回归面。

### P0 · 考试运营闭环（价值最高、与既有链路正交、风险低）

| 编号 | 功能 | 价值 | 依赖 | 风险 | 粗估 |
| --- | --- | --- | --- | --- | --- |
| O1 | **试卷 PDF 导出**（组卷预览 / 试卷打印版，含答案版与考生版） | 支持线下纸质考试与归档，复用 `utils/pdfExport.ts` | 无（复用 pdfkit + 列白名单模式） | 低 | M |
| O2 | **成绩复核申请流**（考生申请 → 管理员复核 → 改分并留痕） | 补齐「考完不服」的正式通道，减少口头争议 | 复用 `retakes` 申请-审批模式 + `records` 改分 | 中（涉成绩可信性，须审计留痕） | M |
| O3 | **特殊考试安排**（指定考生加时 / 免考 / 单独开考） | 真实企业场景刚需（残障加时、免考、隔离考场） | 新增考试-考生级覆盖表，`startExam` 取覆盖值 | 中（影响 `remaining` 计时与次数口径） | M |

### P1 · 题库与数据运营深化

| 编号 | 功能 | 价值 | 依赖 | 风险 | 粗估 |
| --- | --- | --- | --- | --- | --- |
| Q1 | **知识点/标签体系**：题目打标签 → 组卷按知识点配比 → 错题按知识点归因 | 让「错题归因」从科目下钻到知识点，组卷可控难度结构 | `questions` 增标签（JSON 或 `question_tags`）；报表聚合改造 | 中 | L |
| Q2 | **试卷克隆 / 题目复用 / 批量编辑** | 出题效率大幅提升（相似考试快速派生） | 复用 `papers` 快照机制 | 低 | M |
| Q3 | **看板下钻与筛选**：按科室下钻 + 时间范围 | 让看板可用于科室考评 | 复用 `reports.dashboard` + 科室树 | 低 | S |
| Q4 | **审计日志导出 + 保留归档**：导出 CSV/Excel、按时间归档/清理策略 | 合规审计可交付物；控制表膨胀 | 复用 `utils/excelExport.ts` + 定时清理脚本 | 低 | S |

### P2 · 体验与协作

| 编号 | 功能 | 价值 | 依赖 | 风险 | 粗估 |
| --- | --- | --- | --- | --- | --- |
| S1 | **简答富文本/图片作答 + 评分细则（分档 rubric）** | 主观题更贴近真实阅卷（步骤分、要点分） | `answers` 结构扩展（可能含富文本/附件）、阅卷 UI 改造 | 高（作答存储与快照、XSS 过滤） | L |
| S2 | **题库授权批量维护**（按科室/角色批量授权出题人） | 管理成本下降 | 复用 `bank_authors` + 科室树 | 低 | S |
| S3 | **通知模板可配置**（站内信/邮件文案模板） | 运营文案可改，无需发版 | `system_settings` 增模板字段 + `notify.ts` 渲染 | 低 | M |
| S4 | **题库/试卷复制与共享**（跨出题人复制） | 团队协作与沉淀 | 复用 `bank_authors` 授权 | 低 | M |

### T · 安全 / 稳定性 / 交付工程化（横切）

| 编号 | 功能 | 价值 | 依赖 | 风险 | 粗估 |
| --- | --- | --- | --- | --- | --- |
| T1 | **验证码升级**（图形/滑块，替换自研算术） | 提升防暴破强度 | 新增验证码服务 + 前端组件 | 低 | S |
| T2 | **账号安全加固**：登录审计（成功/失败可查）+ 密码策略 + 会话/设备管理 + 可选 2FA | 合规与安全底线 | `login_attempts` 扩展为审计、2FA 涉登录改造 | 中高（2FA 涉全端登录流） | L |
| T3 | **实时考试监控**：进行中考试大屏（在线人数/已交卷/切屏异常告警）+ 强制交卷/延时 | 监考能力从「事后审查」升级到「事中处置」 | WebSocket 或轮询（建议先轮询降复杂度） | 中 | L |
| T4 | **交付工程化**：Docker Compose + CI 流水线（typecheck/test/build）+ 前端 E2E（Playwright） | 一键部署与回归保障 | 无 | 低 | M |
| T5 | **数据归档与性能**：历史成绩归档、慢查询索引优化、大数据量压测 | 长周期可用性 | 需评估既有索引与查询 | 中 | M |

---

## 3. 建议分期（若全选）

按「低风险高价值优先、耦合度递进」排布，每期独立可交付、可回滚：

| 期 | 主题 | 包含 | 说明 |
| --- | --- | --- | --- |
| **①** | 考试运营闭环 | O1 + O2 + O3 | 与既有考试全链路正交，复用 PDF/审批/记录三套既有设施，风险最低、业务价值最直接 |
| **②** | 题库与数据运营深化 | Q1 + Q2 + Q3 + Q4 | 面向出题与管理效率；Q1 为最大单点（知识点体系） |
| **③** | 安全与合规加固 | T1 + T2 + S1 + S2 | 安全底线 + 主观题体验；T2/S1 改造面较大，单独成期 |
| **④** | 工程化与稳定性 | T3 + T4 + T5 + S3 + S4 | 监控大屏、部署与回归基建、性能与运营体验 |

> 若希望**小步快跑**，可先只交付 ①（3 项均低风险高价值），验证节奏后再决定 ②–④。

---

## 4. 各期验收要点（初稿）

**① 考试运营闭环**
- 试卷 PDF：考生版无答案、答案版含参考答案与解析；表格/分页/中文正常；非 Windows 环境走 `PDF_FONT_PATH`。
- 成绩复核：考生仅可对自己已交卷记录申请，且限期内一次；管理员复核改分后**总分重算 + 审计留痕 + 通知考生**；复核前后分数可追溯。
- 特殊安排：加时只影响该考生 `remaining`；免考不进成绩统计或按标记区分；单独开考不影响其他考生卷面与次数口径。

**② 题库与数据运营**
- 知识点：题目可多标签；组卷按知识点配比抽题；看板/报表可按知识点下钻错题率。
- 试卷克隆生成独立快照，改源卷不影响克隆卷与历史答卷。
- 审计导出含全部筛选条件、行列与页面一致；归档策略可配置开关与保留天数。
- 看板支持科室下钻与时间范围，默认口径与现状一致。

**③ 安全与合规**
- 验证码图形化后登录/注册链路正常，锁定策略仍生效。
- 登录失败/成功可查；密码策略可配（长度/复杂度/有效期）；2FA 若启用，关闭时行为与现状一致。
- 简答富文本/图片作答在快照与成绩明细中可还原，富文本经白名单过滤防 XSS；rubric 分档给分自动合计。

**④ 工程化与稳定性**
- 监控大屏可实时/准实时反映在线与交卷进度，异常可一键强制交卷并可审计。
- Docker Compose 一键起（前端 + 后端 + MySQL），CI 三关（typecheck/test/build）必过，Playwright 覆盖登录→开考→交卷主链路。
- 归档后历史查询不受影响，关键查询走索引。

---

## 5. 交付节奏与红线（沿用）

- 每期：**后端类型/数据层 → 服务与路由 → 前端类型/UI → 测试与验证 → 提交**闭环。
- 迁移一律**幂等**（`db/init.ts` 的 `enumHasValue` / `columnExists` 模式）。
- 每期收尾：两端 typecheck 0 错、两端 test 全绿、`db:init` 幂等、构建成功。
- **红线**：所有脚本/测试仅针对 `enterprise_exam_system`（及 `..._test`），严禁触碰同实例其他库（如 `exam_system`）。

---

## 6. 待拍板决策点（已确认）

1. **范围**：✅ 四期全做。
2. **2FA（T2）**：✅ 引入。
3. **部署形态（T4）**：✅ 暂不需要 Docker + CI。
4. **移动端**：✅ 暂不需要。

---

## 7. ① 考试运营闭环（已交付）

### 7.1 O1 试卷 PDF 导出

- 后端 `GET /api/papers/:id/export-pdf?withAnswer=1`（admin/author，author 需被授权该试卷来源题库）：考生版 / 答案版。
- 排版：`utils/pdfExport.ts` 新增 `buildPaperPdfBuffer`（题目列表式，非表格）——标题 + 摘要（总分/题量/来源题库）+ 逐题（题干、选项、答案版附参考答案与解析），自动换行与分页。
- 答案文本化：客观题转选项文本（判断题显示「正确/错误」）；填空按空 ` / ` 拼接；简答取参考文本。
- 前端「试卷管理」操作列新增「导出 PDF」下拉（考生版 / 答案版）。

### 7.2 O2 成绩复核申请流

- 新表 `score_appeals`（按 record_id 唯一，每条答卷至多一次；外键 CASCADE 到 `exam_records`）。
- 规则：仅本人 `submitted` 记录可申请；考试级三态开关 `exams.allow_appeal`（null 继承全局 `appealEnabled`）；申请时限 `appealWindowDays`（天，0 = 不限）；被驳回不可再次申请。
- 复核：`POST /api/appeals/:id/approve`（改分 0~试卷总分，**直接更新记录总分 + 审计留痕 + 通知考生**）/ `POST /api/appeals/:id/reject`（意见必填）。
- 接口：`POST /api/appeals/apply`、`GET /api/appeals/my`（考生）、`GET /api/appeals`（admin，可按状态过滤）。
- 前端：新增「成绩复核」菜单 + `admin/AppealManagePage.vue`；考生「我的成绩」页新增「申请复核」入口。
- 审计动作：`appeal.approve` / `appeal.reject`（目标类型 `appeal`）。

### 7.3 O3 特殊考试安排

- 新表 `exam_exceptions`（按 考试×考生 唯一）：`extra_minutes` / `extra_attempts` / `exempt` / `note`。
- 语义：加时仅影响该考生本人倒计时（`ExamRecordDto.extraMinutes`，开考与记录详情均下发）；额外次数叠加在答题次数上限之上；免考考生开考被拒（1001）。
- 接口（admin）：`GET /api/exams/:id/exceptions`、`PUT /api/exams/:id/exceptions/:userId`、`DELETE /api/exams/:id/exceptions/:userId`。
- 考生端：`ExamMyDto` 增 `extraMinutes / extraAttempts / exempt`；答题页倒计时按「考试时长 + 本人加时」计算并显示「含加时」标记。
- 审计动作：`exam.exception_update`。
- 前端：考试管理新增「特殊安排」入口 + `admin/ExamExceptionDialog.vue`。

**① 验证**：后端 typecheck 0 错；新增 `server/src/test/v17a.test.ts`（15 用例）全通过，全量 **241/241**（17 文件）；前端 typecheck 0 错、vitest 28/28、`vite build` 成功；`db:init` 幂等（27 表，新增 `score_appeals` / `exam_exceptions`，补 `exams.allow_appeal`）。

---

## 8. ② 题库与数据运营深化（已交付）

### 8.1 Q1 知识点（标签）体系

- 存储：`questions.tags JSON NULL`（DDL + `db/init.ts` 幂等迁移）；`QuestionDto.tags: string[]`（空数组 = 未打标签）。
- 归一化：`questions.service.normalizeTags()` —— trim → 去空 → 去重（保序）→ 单标签截断 32 字 → 最多 `MAX_TAGS = 10` 个；zod 层同步 `.max(10)` 中文提示。
- 过滤：`questions.repo.buildWhere` 支持 `tag` → `JSON_CONTAINS(tags, JSON_QUOTE(?))`。**题库内列表**（`GET /api/banks/:id/questions?tag=`）与**全局试题池**（`GET /api/questions?tag=`）均支持；题库内列表题型过滤同时放开为全部 5 种题型。
- 标签选项：新增 `GET /api/questions/tags?bankIds=`（跨题库展开 JSON 数组、去重、按中文排序；author 限定被授权题库）。
- **组卷按知识点配比**：`POST /api/papers/draw-questions` 新增 `tagRules: Array<{tag, count, score}>`，与题型 `rules` 可同时使用。
  - 两阶段执行：先对全部规则做**存量预检**，任一不足即整体作废并返回 `tagShortages`（HTTP 200，不生成任何题目）；预检通过后逐规则抽取，规则间通过 `id NOT IN (...)` 排除已抽中题目**自动去重**。
  - 返回结构 `DrawResult` 增 `tagShortages: DrawTagShortage[]`。
- **看板知识点归因**：`DashboardReportDto.tagWrong`（一题多标签则每个标签各计一次；未打标签题目不计入；简答不纳入）。
- 前端：`QuestionFormDialog` 增「知识点标签」多选（支持回车创建，候选来自同题库已有标签）；`QuestionBankDetailPage` 增标签列 + 「全部知识点」筛选；`PaperComposerPage` 抽题模式增「按知识点配比」规则行（可增删、去重校验）与题池标签筛选。

### 8.2 Q2 试卷克隆 + 题目批量编辑

- **试卷克隆**：`POST /api/papers/:id/clone`（body `{ name? }`；省略 → 「原名（副本）」，截断 100 字）。复用 `papers.create` 完成整卷重写（题目/分值/来源题库原样复制，生成独立新卷），权限沿用 `getById`（author 需被授权来源题库）。前端「试卷管理」操作列增「克隆」。
- **题目批量编辑**：`POST /api/questions/batch-edit`
  - 入参 `{ ids[], subject?, tags?, tagsMode?: 'append'|'replace', defaultScore? }`，**仅提交的字段被修改**，题干/选项/答案等一律不动；至少选一个字段（否则 1001）。
  - 上限 500 题/次；逐题做 author 题库授权校验（任一无权即整体失败 1003）；标签追加模式按题读取现有标签后合并去重（保序）。
  - 前端新增 `author/QuestionBatchEditDialog.vue`；题库详情表格支持多选（`reserve-selection` 跨页保留勾选）与「批量编辑（N）」入口。

### 8.3 Q3 看板下钻与筛选

- `GET /api/reports/dashboard` 增 `departmentId` / `from` / `to`：
  - `departmentId` 按**科室树下钻**（自身 + 全部子孙科室，`reports.service.resolveDepartmentScope` 遍历 `departments.parent_id`），过滤口径为记录的 `department_id`；
  - `from` / `to` 按**考试开始时间**筛选；纯日期按 `T00:00:00.000Z` ~ `T23:59:59.999Z` 覆盖整天（与审计模块同口径）；
  - 缺省时口径与 v1.6 完全一致（不传即全量）。
- 前端「数据总览」增筛选条（科室下拉带层级缩进 + 考试开始时间日期范围）与「知识点错题归因」图表；聚合图表改为科目/知识点共用的 `wrongRateOption` 工厂。

### 8.4 Q4 审计日志导出与保留归档

- 新增 `utils/csvExport.ts`（零依赖；RFC 4180 转义、CRLF、UTF-8 BOM 保证 Excel 打开不乱码）。
- 新增 `modules/audit/audit.columns.ts`（7 列白名单：操作时间/操作者/操作类型/对象类型/对象名称/对象 ID/明细；默认列集 6 列）。
- 导出：`GET /api/audit-logs/export?format=xlsx|csv&columns=&tzOffset=&<同列表过滤条件>`，`repo.listForExport` 单次上限 **20000 条**；`detail` 序列化为「键=值；…」可读文本；时间按 `tzOffset` 格式化为本地时间。导出动作自身留痕（`audit.export`，含 format / rowCount / 过滤条件摘要）。
- 保留策略：设置项 `auditRetentionDays`（默认 180 天，0 = 永久保留）。
  - `GET /api/audit-logs/retention` 返回当前生效天数；
  - `POST /api/audit-logs/cleanup`（可选 `retentionDays` 覆盖）→ `repo.deleteBefore(cutoff)` 删除超期日志，**清理动作自身留痕**（`audit.cleanup`），返回 `{ retentionDays, deletedCount, cutoff, remainingCount }`；0/负数视为永久保留不删除。
- 审计枚举联动扩展：`AuditAction` 增 `audit.export` / `audit.cleanup`，`AuditTargetType` 增 `audit`（后端 `domain.ts` + `audit.service.ts` 文案 ↔ 前端 `src/types` + `src/constants` 双份同步）。
- 前端「审计日志」页头增：保留策略文案、「导出字段」勾选弹窗、导出下拉（Excel / CSV）、「清理过期日志」按钮（永久保留时仅提示不执行）。

**② 验证**：后端 typecheck 0 错；新增 `server/src/test/v17b.test.ts`（23 用例）全通过，全量 **264/264**（18 文件）；前端 typecheck 0 错、vitest 28/28、`vite build` 成功；`db:init` 幂等（`questions.tags` 列已就位）。

---

## 9. ③ 安全与合规加固（已交付）

> 拆两批交付：**③-a = T1 + T2**（已交付，commit `d9c3f4f`）；**③-b = S1 + S2**（已交付）。

### 9.1 T1 图形验证码（替换自研算术题）

- 新增 `server/src/utils/captcha.ts`（**零依赖**）：`issueCaptcha()` 生成 4 位字符（字符集 `ABCDEFGHJKMNPQRSTUVWXY23456789`，剔除易混字符 0/O/1/I/L/Z），逐字随机旋转、叠加干扰线与噪点，输出 **SVG Data URI**（`data:image/svg+xml;base64,...`）与 `captchaId`。
- 答案**不随响应返回**，服务端内存存储（`captchaId → { answer, expiresAt }`，TTL 5 分钟）；`verifyCaptcha(captchaId, value)` **一次性消费**（校验后立即作废）、大小写不敏感。
- 登录 `/api/auth/login`、练习端登录 `/api/practice/login` 复用同一实现；`practiceLoginGuard` 删除自研算术验证码，改为 `verifyCaptcha`。
- 触发阈值由设置项 `loginCaptchaAfterFails`（默认 3，1~20）驱动 —— 连续登录失败达阈值后才要求验证码；不足时不强制。
- 接口：`GET /api/auth/captcha` → `{ captchaId, image }`；`POST /api/practice/captcha` 同构。
- 错误码：新增 **1015 `CAPTCHA_REQUIRED`**（HTTP 400，默认文案「请输入图形验证码」），前端捕获后自动展示验证码控件并刷新。
- 前端：新增 `src/components/common/CaptchaImage.vue`（`v-model` 回传 `captchaId`、`defineExpose({ refresh })`、点击图片/「换一张」刷新）；登录页与练习端登录页改为图形图片 + 「换一张」。
- 测试钩子：`__peekCaptchaAnswer(captchaId)`（**仅供测试**从进程内读取明文）。

### 9.2 T2 账号安全加固

**（1）登录审计 `login_logs`**

- 新表 `login_logs`（id / username / user_id / role / ip / user_agent / success / reason / source / created_at + 3 索引），**自包含无外键**、**fail-open 写入**（写日志失败仅 `console.error`，绝不影响登录）。
- `source` 区分 `admin`（管理端）/ `practice`（练题端）；成功与失败均落库，失败原因可读。
- 接口：`GET /api/login-logs`（`authRequired + requireRole('admin')`；过滤：`username` LIKE / `success` / `source` / `from` / `to`；日期归一化与审计模块同口径 —— 纯日期覆盖整天）。
- 前端：新增「登录日志」菜单 + `src/views/admin/LoginLogPage.vue`（筛选条 + 表格：时间/账号/结果/说明/来源/IP/客户端 + 分页），失败原因走 `REASON_LABELS` 映射。

**（2）密码策略（可配）**

- 新增 `server/src/utils/passwordPolicy.ts`：`passwordPolicyErrors` / `assertPasswordPolicy`（不满足抛 **1001** 中文聚合文案）/ `describePolicy` / `isPasswordExpired`。
- 设置项：`passwordRequireUpper` / `passwordRequireLower` / `passwordRequireDigit` / `passwordRequireSymbol`（默认 false）、`passwordExpireDays`（默认 0 = 不过期，0~3650）。
- 用户表增 `password_changed_at DATETIME(3) NULL`（迁移补 DDL 后回填 = `created_at`）；改密/重置密码时同步刷新；登录时若超期返回 `LoginResult.passwordExpired`，前端提示改密。
- 应用点：`auth.service.changePassword`、`users.service`（新建用户 / 重置密码）均改走 `assertPasswordPolicy`。

**（3）会话 / 设备管理 `user_sessions`**

- JWT 增 `jti`（= 会话 id）；新表 `user_sessions`（id / user_id / ip / user_agent / created_at / last_seen_at / revoked_at / expires_at + 2 索引）。
- `authRequired` 改 **async**：对**带 jti** 的令牌校验会话有效性（未撤销 + 未过期），过期/撤销即 1002；**不带 jti 的旧令牌兼容放行**（不破坏既有登录态）；`touchSession` 5 分钟内不重复写库。
- 接口：`GET /api/auth/sessions`（我的设备）、`DELETE /api/auth/sessions/:id`（下线单台）、`DELETE /api/auth/sessions`（下线其他设备）、`POST /api/auth/logout`（撤销当前会话）；管理员侧 `GET/DELETE /api/users/:id/sessions`（查看 / 强制该用户全部下线）。
- 重置密码后自动 `sessions.revokeAll` 强制该用户全部设备下线。
- 前端：新增 `src/components/account/AccountSecurityDialog.vue`（「账号安全」弹窗，三卡片：密码策略 / 两步验证 / 登录设备，`describeAgent` 将 UA 归一为「系统 · 浏览器」）；顶栏下拉增「账号安全」入口；`admin/UserPage.vue` 增「强制下线」按钮。

**（4）两步验证（TOTP，RFC 6238）**

- 新增 `server/src/utils/totp.ts`（**零依赖**）：Base32 编解码 + HMAC-SHA1 + 30s / 6 位，`verifyTotp` 采用 **±1 步长窗口**容错。
- 用户表增 `two_factor_secret` / `two_factor_enabled`；设置项 `twoFactorAvailable`（默认 true）全局开关。
- 登录流：启用 2FA 的用户凭证校验通过后**不直接发访问令牌**，改为返回 5 分钟 **挑战令牌**（`scope: '2fa'` 的 JWT）；`POST /api/auth/2fa/verify` 用挑战令牌 + 验证码换取正式令牌并建会话。挑战令牌**不可作访问令牌**（`authRequired` 明确拒绝）。
- 接口：`GET /api/auth/2fa/policy`（策略与是否启用）、`POST /api/auth/2fa/setup`（生成密钥 + `otpauth://` 扫码 URL）、`POST /api/auth/2fa/enable`（验证码确认开启）、`POST /api/auth/2fa/disable`（密码 + 验证码关闭）。
- 前端：登录页增 `step: 'credentials' | 'twofa'` 两阶段表单（含「返回重新输入账号」）；`stores/auth.login` 返回 `LoginOutcome`、新增 `completeTwoFactor`。
- 审计：`AuditAction` 增 `user.change_password` / `user.two_factor_enable` / `user.two_factor_disable` / `user.force_logout`（后端 `audit.service.ts` ↔ 前端 `src/constants/index.ts` 双份同步）。

**③-a 验证**：后端 typecheck 0 错；新增 `server/src/test/v17c.test.ts`（16 用例）全通过，全量 **280/280**（19 文件）；前端 typecheck 0 错、vitest 28/28、`vite build` 成功；practice-web typecheck 0 错；`db:init` 幂等（**29 表**，新增 `login_logs` / `user_sessions`，结构升级 `users.password_changed_at` / `users.two_factor_secret` / `users.two_factor_enabled`）。

### 9.3 S1 简答富文本/图片作答 + 评分细则（rubric）

**（1）富文本作答**

- 新增 `server/src/utils/richText.ts`（**零依赖白名单重建**）：
  - `sanitizeRichText(html, opts)`：先删注释与危险标签整段（script/style/iframe/svg/form/... ），再逐标签重建 —— **标签白名单**（p/br/div/span/strong/b/em/i/u/s/del/ins/sub/sup/ol/ul/li/blockquote/h1-h6/code/pre/a/img/hr），**属性白名单**（`a[href,title]` / `img[src,alt,width,height]`），`on*` 事件属性天然被剔除；`a[href]` 仅允许 http/https/mailto/tel 与站内相对地址（杜绝 `javascript:`）；`img[src]` 仅允许 `data:image/(png|jpe?g|gif|webp|bmp);base64,`，并限制**单图体积**（默认 512KB，含 64B 容差）与**图片张数**（默认 3）；输出**长度上限** 20000 字符（超限截断）。
  - `isRichTextEmpty(html)`：空白 / 仅 `<br>` / `&nbsp;` 视为空（仅含图片视为非空）。
- **安全边界在服务端**：`records.service.saveAnswers` 对 `short` 题作答调用 `sanitizeRichText`（空内容归一为 `''`）；前端 `v-html` 渲染仅作展示，不承担安全职责。
- 请求体上限由 `express.json({ limit: '2mb' })` 放宽至 **8mb**（支持内联图片作答）。
- 前端：新增 `src/components/common/RichTextEditor.vue`（`contenteditable` + 原生 `execCommand`，工具栏：加粗/斜体/下划线/无序列表/有序列表/插入图片/清除格式；本地选图 → `FileReader` 转 data URI 内联插入，前端预校验体积与张数）；`QuestionCard.vue` 简答作答改用它；`ReviewPage.vue` / `ScoreDetailPage.vue` 以 `v-html` 渲染（新增全局 `.rich-text` 渲染样式）。

**（2）评分细则 rubric**

- `questions.rubric JSON NULL`（DDL + `db/init.ts` 幂等迁移）；`QuestionDto.rubric: RubricBand[]`（`{ score, label, description }`）。
- 归一化（`questions.service.normalizeRubric`）：**仅简答题保留**（其余题型强制空数组）；分值合法（0~9999）→ **同分去重** → **按分值降序** → 最多 **10 档**；`label ≤32` 字、`description ≤200` 字。
- zod 层 `.max(10, '评分细则最多 10 档')`；批量编辑（`batch-edit`）透传 rubric 不动。
- 前端：`QuestionFormDialog.vue` 简答题增「评分细则」编辑区（分值/档位名称/说明，增删，≤10 档，分值是 0~题目分值）；`ReviewPage.vue` 阅卷时按 rubric 渲染**分档快选按钮**（点击即填入该档分值），默认预选最高档，提交后总分 = 客观分 + 主观分（分档给分自动合计）。

### 9.4 S2 题库授权批量维护

- 新增接口（**仅 admin**）：
  - `POST /api/banks/:id/authors/grant` —— 批量授权出题人；
  - `POST /api/banks/:id/authors/revoke` —— 批量取消出题人授权。
- 入参 `{ userIds?, departmentId?, includeSubDepartments?, role? }`（三种选择器可组合，至少提供一种，否则 1001）：
  - `userIds` 直接并入；
  - `departmentId` 给出时取该科室成员（`includeSubDepartments` 默认 true，复用 `departments.service.expandDepartmentIds` 展开子树），`role` 在其内做**交集**过滤；
  - 仅给 `role`（无科室）时表示「全部该角色账号」。
- 命中集合中**角色不是出题人 / 账号不存在**者被跳过并计数（`nonAuthor` / `missing`），不阻断整体操作；返回 `BankAuthorBatchResult { changed, skipped, nonAuthor, missing, authorIds, authorNames }`。
- 审计留痕：新增 `AuditAction` `bank.author_grant` / `bank.author_revoke`（后端 `audit.service.ts` ↔ 前端 `src/constants/index.ts` 双份同步），detail 记录 changed/skipped/nonAuthor/missing 与选择器摘要。
- 前端：新增 `src/views/author/BankAuthorBatchDialog.vue`（科室树选择 + 含子科室开关 + 角色过滤 + 手选出题人；**客户端即时预演**命中人数/将授权人数/已授权跳过数）；`QuestionBankDetailPage.vue` 题库信息卡新增管理员可见的「批量授权」入口，完成后刷新题库详情。

**③-b 验证**：后端 typecheck 0 错；新增 `server/src/test/v17d.test.ts`（20 用例）全通过，全量 **300/300**（20 文件）；前端 typecheck 0 错、vitest 28/28、`vite build` 成功；`db:init` 幂等（29 表，结构升级 `questions.rubric`）。
