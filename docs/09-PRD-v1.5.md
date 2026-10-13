# 09 · PRD v1.5 —— 范围收口 + 补考审批制 + 菜单权限

> 版本目标：在 v1.4 基础上收口剩余扩展功能，并修正三处产品口径。
> - 补考由「自动 + 手动」收敛为「**申请-审批制**」，且**仅答题次数为 1 次的考试可补考**。
> - **填空/简答 + 人工阅卷暂缓**（下期再议）。
> - 「系统品牌」改名「**网站信息**」；「公网练题」拆为独立菜单「**练题端设置**」；新增「**菜单权限**」。

---

## 1. 范围调整（相对 v1.4 的变更）

| v1.4 口径 | v1.5 口径 | 说明 |
| --- | --- | --- |
| 补考 = 自动（不及格自动授）+ 手动（管理员批量授） | 补考 = 考生申请 → 管理员审批；**仅 maxAttempts=1 且不及格**可申请 | 不再自动补考；批准后追加 1 次答题机会 |
| 填空/简答 + 人工阅卷 列入本期 | **暂缓** | 不扩题型，判分链路保持不变 |
| 系统设置「系统品牌」Tab | 改名为「**网站信息**」Tab | 仅改文案，字段 `systemName/systemShortName/loginSlogan/copyright` 不变 |
| 系统设置内「公网练题」配置 | 拆为**独立菜单「练题端设置」**（`/admin/practice-settings`） | 独立 `PracticeSettingsPage`，独立 `practice_settings` 存储 |
| —（无） | 新增「**菜单权限**」 | 按角色授权可见菜单，后端 `menu_permissions` 为权威来源 |

本期继续交付（v1.4 已规划、v1.5 落地）：
- ⑥ 补考（改为审批制）
- ⑦ 消息通知（站内信 + 邮件 SMTP）
- ⑧ 账号批量导入（Excel 导入用户）

---

## 2. 菜单权限（新增）

### 2.1 权限模型（三层同步）

| 层 | 载体 | 说明 |
| --- | --- | --- |
| 后端接口 | `requireRole(role)` | 角色级硬校验（不变） |
| 前端路由 | `meta.roles` + `meta.menuKey` | 进入路由时校验菜单授权 |
| 前端菜单 | `menuConfig.key` + `permissionsStore` | 侧栏按授权 key 过滤 |

**权威来源**：v1.5 起，`menu_permissions` 表按角色存 `menu_keys` JSON；该角色无行时回退内置默认（`menuCatalog.defaultGrants`）。

### 2.2 数据与接口

- 表 `menu_permissions`：`role VARCHAR(16) PK, menu_keys JSON, updated_by, updated_at`。
- `GET /api/permissions/menus`（admin）：目录 + 各角色授权。
- `PUT /api/permissions/menus`（admin）：整体替换授权（校验 key 合法）。
- `GET /api/permissions/my`（登录）：当前角色可见菜单 key 列表。

### 2.3 防自锁

`settings`、`permissions` 两个菜单标记 `adminRequired`：
- 后端写入时，管理员必授菜单**恒在**（无法被取消勾选）。
- 后端读取时，管理员授权**兜底补回**必授菜单（防历史脏数据/手工改动自锁）。
- 前端「菜单权限」页禁用这两个菜单的取消操作。

### 2.4 菜单目录（key 与后端 `menuCatalog.ts`、前端 `menuConfig.ts` 一一对应）

| key | 名称 | 默认角色 | adminRequired |
| --- | --- | --- | --- |
| dashboard | 数据总览 | admin | 否 |
| departments | 科室管理 | admin | 否 |
| users | 用户管理 | admin | 否 |
| banks | 题库管理 | admin, author | 否 |
| papers | 试卷管理 | admin, author | 否 |
| exams | 考试管理 | admin | 否 |
| retakes | 补考管理 | admin | 否 |
| scores | 成绩报表 | admin | 否 |
| practice-settings | 练题端设置 | admin | 否 |
| settings | 系统设置 | admin | **是** |
| permissions | 菜单权限 | admin | **是** |
| my-exams | 我的考试 | examinee | 否 |
| my-scores | 我的成绩 | examinee | 否 |

> 降级策略：`permissionsStore.load()` 失败时回退内置默认授权，保证后端不可用不把用户锁死在门外。

---

## 3. 补考（申请-审批制）

### 3.1 资格规则

- 仅 `exams.max_attempts = 1` 的考试可补考。
- 仅「已交卷且不及格」的考生可申请；存在进行中作答不可申请。
- 一名考生对一场考试至多一条申请（**被驳后可重新申请**，重置为待审批）。
- 单场补考开关 `allow_retake`（三态：`NULL` 继承全局 `retakeDefaultEnabled`）。

### 3.2 数据与接口

- 表 `exam_retakes`：`id, exam_id, user_id, status(pending/approved/rejected), reason, applied_at, reviewed_by, reviewed_at, created_at`，唯一键 `(exam_id, user_id)`。
- `POST /api/retakes/apply`（考生）：入参 `{ examId, reason }`。
- `GET /api/retakes/my`（考生）：本人申请分页。
- `GET /api/retakes`（admin）：可按状态筛选，分页。
- `POST /api/retakes/:id/approve`（admin）。
- `POST /api/retakes/:id/reject`（admin）：入参 `{ reason }`。

### 3.3 答题机会闭环

- `listForExaminee` 返回 `retakeStatus` 与 `canApplyRetake`（前端据此渲染「申请补考」入口与状态标签）。
- `startExam` 次数校验：`used < maxAttempts + (isRetakeGranted ? 1 : 0)`；存在已通过申请时额外授予 1 次。
- 审批通过/驳回后 `notifyUsers` 通知考生（受 `notifyOnRetake` 开关控制）。

### 3.4 前端

- `ExamFormDialog`：新增「补考申请」三态开关；`maxAttempts !== 1` 时提示「仅答题次数为 1 次的考试可补考」。
- `MyExamPage`：新增「补考」状态列（待审批/已通过/已驳回）+「申请补考」入口（弹窗填说明）+「我的补考」入口；已通过时主按钮可用次数 +1。
- `MyRetakePage`（考生）、`RetakeManagePage`（admin 审批）。

---

## 4. 设置页拆分

- `SettingsPage`（`system_settings`）Tab：**考试规则 / 账号安全 / 列表与导入 / 网站信息 / 消息通知**（原「系统品牌」改名「网站信息」，原「公网练题」移除）。
- `PracticeSettingsPage`（`practice_settings`）独立菜单「练题端设置」，承载原公网练题配置（每日一练等），独立保存、互不影响。
- 系统设置新增字段（相对 v1.4）：
  - `retakeDefaultEnabled`（补考全局默认开关，默认 false）
  - `notifySiteEnabled/notifyEmailEnabled/notifyOnPublish/notifyOnResult/notifyOnRetake`（通知各事件开关）
  - `smtpHost/smtpPort/smtpSecure/smtpUser/smtpPass/smtpFrom`（SMTP；`smtpPass` 仅管理员可读、脱敏）

---

## 5. 消息通知（站内信 + 邮件 SMTP）

- 表 `notifications`：`id, user_id, type, title, content, is_read, created_at`。
- 接口：`GET /notifications`（分页）、`GET /notifications/unread-count`、`PUT /notifications/:id/read`、`PUT /notifications/read-all`。
- `notifyUsers(userIds, payload)` 统一入口：按设置分派站内信 + 可选邮件（nodemailer 动态加载）；**fail-open**，任何失败不阻断主流程，无 SMTP 配置/发送失败则降级为仅站内信。
- 触发点：考试发布（`notifyOnPublish`，目标科室考生）、交卷出成绩（`notifyOnResult`）、补考审批结果（`notifyOnRetake`）。
- 前端：顶栏站内信铃铛 + 未读数；`NotificationCenterPage` 消息中心（列表/已读/全部已读）。

---

## 6. 账号批量导入

- 表 `user_import_batches`（同 `import_batches` 但无 `bank_id`），逐行创建、失败行不阻断其余行。
- 模板 6 列：`登录账号 / 姓名 / 角色 / 科室 / 邮箱 / 初始密码(可选)`。
  - 角色支持中文（管理员/出题人/考生）或英文（admin/author/examinee）；科室按名称解析为 id（仅考生必填）；邮箱格式校验；密码长度校验；文件内账号去重。
- 接口：`GET /users/import/template`、`POST /users/import/preview`、`POST /users/import/commit`、`GET /users/import/batches`。
- 复用 `preview → commit` 两段式与 `importMaxRows/importMaxFileMb/defaultPassword` 配置。
- 前端：`UserPage` 增加「批量导入账号」入口 + `UserImportDialog`（批量导入 / 导入历史两个页签）；用户表单/表格增加 `email` 字段。

---

## 7. 数据库变更汇总（相对 v1.4 落地的最终版）

**新表**
1. `notifications`
2. `exam_retakes`
3. `user_import_batches`
4. `menu_permissions`

**字段扩展（applyMigrations 幂等）**
1. `exams` 增 `allow_retake TINYINT(1) NULL`
2. `users` 增 `email VARCHAR(120) NULL`

> 说明：v1.4 规划的 `rate_limit_buckets` / `login_attempts` / `shuffle_enabled` / `shuffle_options` 已在 v1.4 批次落地；`auto_retake` 取消，由 `exam_retakes` 审批流替代；`fill/short` 题型与 `pending_review` 状态本期**不做**。

---

## 8. 验收标准（节选）

- 菜单权限：admin 不可取消「系统设置」「菜单权限」；author/examinee 隐藏未授权菜单，直接访问路由被重定向回首页；后端不可用时回退默认菜单不锁死。
- 补考：`maxAttempts ≠ 1` 的考试不出现申请入口且后端拒绝；不及格 + 已交卷可申请；pending 不可重复申请；approved 后考生可再考一次（次数 +1）；rejected 可重新申请。
- 消息通知：关闭 `notifyEmailEnabled` 仅站内信；开启且 SMTP 配好邮件送达；SMTP 未配置/发送失败不阻断考试/交卷/审批主流程。
- 账号导入：失败行被跳过且记录到批次历史；科室名不存在的考生行报错；邮箱格式错误报错。
- 设置页：「网站信息」「消息通知」Tab 正常保存；「练题端设置」独立菜单独立保存，与系统设置互不影响。

---

## 9. 风险与边界

- 菜单权限与路由联动依赖 `meta.menuKey` 完整覆盖；新增菜单须同时改 `menuConfig.ts` + `menuCatalog.ts` + 路由，缺一会导致菜单不可见或被默认授权覆盖。
- 补考次数校验是安全关键路径，须确保 `isRetakeGranted`（存在 approved 申请）与 `startExam` 上限一致，防止超次作答。
- `notifyUsers` 为 fail-open，站点信写入失败仅记日志不阻断主流程；如后续需要严格投递，需引入重试/队列。
- 本期内不扩题型（填空/简答）、不做人工阅卷；相关链路保持现状。
