# 08 · PRD v1.4 —— 考试核心增强 + 扩展功能

> 版本目标：收尾技术债 → 上线「人手一卷」核心能力 → 四项扩展功能。
> 贯穿原则：**凡能做成开关/阈值的，一律配置化**，放在对应位置（全局进「系统设置」对应 Tab，单场进考试字段并继承全局默认）。
> 已拍板：消息通知 = 站内信 + 邮件 SMTP；防暴破 = 失败锁定；补考 = 自动 + 手动。

---

## 1. 版本目标与范围

| 分组 | 功能 | 关键点 |
| --- | --- | --- |
| 收尾 | ① 题库迁移接口 | 补全后端 `POST /banks/:id/questions/migrate` |
| 收尾 | ② 切屏强制交卷 | 超阈值自动交卷，**后台开关** |
| 收尾 | ③ 限流持久化 | 内存 Map → DB 表 |
| 收尾 | ④ 登录失败锁定 | 复用练题端机制，**后台可配** |
| 核心 | ⑤ 随机组卷 + 题目/选项乱序 | 人手一卷，可复现种子，**考试级开关** |
| 扩展 | ⑥ 补考 | 自动（不及格）+ 手动，**开关可配** |
| 扩展 | ⑦ 消息通知 | 站内信 + 邮件 SMTP，**各事件开关** |
| 扩展 | ⑧ 账号批量导入 | Excel 导入用户 |
| 扩展 | ⑨ 填空/简答 + 人工阅卷 | 题型扩展 + 主观题阅卷 |

---

## 2. 配置化总原则（新增贯穿约定）

配置分三级，各自职责清晰：

| 级别 | 载体 | 谁能改 | 适用 |
| --- | --- | --- | --- |
| 部署态 | `server/.env` | 运维 | 端口/密钥/限流阈值/时区（现有 `PRACTICE_RATE_*` 保持不动） |
| 全局态 | `system_settings`（单行 JSON） | 管理员（系统设置页） | 全局默认开关与阈值 |
| 单场态 | `exams` 表字段 | 出题人/管理员（考试表单） | 单场考试覆盖全局默认 |

**约定**：单场考试字段永远提供「继承全局默认」能力——考试表单不显式设置时读 `system_settings` 默认；显式设置后覆盖。前端表单用「开关 + 从默认值预填」实现。

### 2.1 system_settings 新增字段（按现有 Tab 归类）

**「考试规则」Tab**
| 字段 | 类型 | 默认 | 说明 |
| --- | --- | --- | --- |
| `cheatAutoSubmitEnabled` | bool | false | 切屏超阈值是否自动交卷 |
| `shuffleDefaultEnabled` | bool | false | 人手一卷全局默认开关 |
| `shuffleOptionsDefault` | bool | true | 选项乱序全局默认开关 |
| `retakeDefaultEnabled` | bool | false | 不及格自动补考全局默认开关 |

**「账号安全」Tab**
| 字段 | 类型 | 默认 | 说明 |
| --- | --- | --- | --- |
| `loginLockEnabled` | bool | true | 登录失败锁定开关 |
| `loginMaxFails` | int | 5 | 连续失败锁定阈值（1~20） |
| `loginLockMinutes` | int | 15 | 锁定时长分钟（1~1440） |

**「消息通知」Tab（新增）**
| 字段 | 类型 | 默认 | 说明 |
| --- | --- | --- | --- |
| `notifySiteEnabled` | bool | true | 站内信总开关 |
| `notifyEmailEnabled` | bool | false | 邮件总开关 |
| `notifyOnPublish` | bool | true | 考试发布通知 |
| `notifyOnResult` | bool | true | 成绩通知 |
| `notifyOnRetake` | bool | true | 补考通知 |
| `smtpHost` | string | '' | SMTP 服务器 |
| `smtpPort` | int | 465 | SMTP 端口 |
| `smtpSecure` | bool | true | SMTP 是否 SSL |
| `smtpUser` | string | '' | SMTP 账号 |
| `smtpPass` | string | '' | SMTP 密码/授权码 |
| `smtpFrom` | string | '' | 发件人地址 |

> 密码类字段（`smtpPass`）存储遵循现有约定：仅管理员可读、日志脱敏，不返回到普通接口。

### 2.2 exams 表新增字段（单场覆盖全局默认）

| 字段 | 类型 | 默认 | 继承 |
| --- | --- | --- | --- |
| `shuffle_enabled` | TINYINT(1) | NULL | NULL=继承 `shuffleDefaultEnabled` |
| `shuffle_options` | TINYINT(1) | NULL | NULL=继承 `shuffleOptionsDefault` |
| `auto_retake` | TINYINT(1) | NULL | NULL=继承 `retakeDefaultEnabled` |

> 用 `NULL` 表示「未显式设置，继承全局」，避免三态布尔；读取时 `?? 全局默认`。

---

## 3. 功能明细

### ① 题库迁移接口
- **现状**：前端 `api/banks.ts#migrate()` 已写好，后端 404。
- **接口**：`POST /api/banks/:id/questions/migrate`（admin/author），入参 `{ targetBankId, questionIds }`，返回 `{ moved }`。
- **规则**：源/目标题库存在、目标≠源、题目均属源题库；单事务 `UPDATE questions SET bank_id=? WHERE id IN(...) AND bank_id=?`。
- **边界**：题目 `id` 不变，`paper_questions` 引用不受影响；源题库清空后 `paper_bank_refs` 仍可能引用（仅作来源展示，不阻塞）。

### ② 切屏强制交卷
- **现状**：`cheatCountThreshold`/`cheatSecondsThreshold` 已存在，但超阈值仅 `ElMessage.warning`，不强制交卷。
- **改动**：`ExamTakingPage#onAway` 内，当 `cheatAutoSubmitEnabled` 为真且（`cheatCount≥cheatCountThreshold` 或 `cheatAwayTotal≥cheatSecondsThreshold`）→ 自动 `submit(auto=true)` 并提示「检测到异常切屏，已自动交卷」。
- **配置**：`cheatAutoSubmitEnabled`（§2.1）；阈值复用现有两字段。

### ③ 限流持久化
- **现状**：`practiceRateLimit.ts` 用进程内存 Map，重启/多实例失效。
- **改动**：新建 `rate_limit_buckets` 表，`consume(bucketKey, limit, windowMs)` 用 MySQL 原子 UPSERT 计数（窗口过期重置）。
  - 表：`rate_limit_buckets(key VARCHAR(191) PK, count INT, window_start DATETIME(3), updated_at DATETIME(3))`。
- **权限**：练题实例（`practice_app` 只读）需对该表**单独授 INSERT/UPDATE**（仅此一张表可写，不破坏业务表只读隔离）；`deploy/db-grants-practice.sql` 追加授权。
- **兼容**：阈值仍走 env（部署态，保持不动）；仅替换计数存储层。

### ④ 登录失败锁定（考试端）
- **现状**：练题端已有 `PRACTICE_LOGIN_MAX_FAILS` 等；考试端 `auth.login` 无锁定。
- **改动**：新增 `login_attempts` 表（`username PK, fail_count, locked_until, updated_at`）；登录前查锁、失败累计、成功清零。
- **配置**：`loginLockEnabled`/`loginMaxFails`/`loginLockMinutes`（§2.1，管理端可改）。

### ⑤ 随机组卷 + 题目/选项乱序（人手一卷）
- **现状**：`drawQuestions` 随机但「生成一次固化」；`getSnapshot` 返回试卷固定题型序；`paper_snapshot` 为试卷级。
- **改动**：
  1. `startExam` 冻结快照前，若考试开启 `shuffle_enabled`：用种子 `sha1(examId + userId + attemptNo)` 对快照做洗牌。
  2. 洗牌纯函数 `shuffleSnapshot(snapshot, seed, shuffleOptions)`：
     - 题目顺序 Fisher-Yates 洗牌；
     - `shuffle_options` 时每题 `options` 洗牌并**重映射 `answer` 索引**。
  3. 乱序结果直接写入该 record 的 `paper_snapshot`（考生级快照），并在快照附加 `seed`/`shuffled` 标记（审计可复现）。
- **判分**：`grade()` 逻辑不变——快照内 `answer` 已是乱序后的索引，`isAnswerCorrect` 照常。
- **配置**：`shuffleDefaultEnabled`/`shuffleOptionsDefault`（全局）+ `exams.shuffle_enabled`/`shuffle_options`（单场，§2.2）。

### ⑥ 补考（自动 + 手动）
- **自动**：考试 `auto_retake` 为真时，考生交卷后若 `score < pass_score` 且 `已交卷次数 == max_attempts`，额外授予 1 次（仅一次）。`startExam` 的次数校验改为 `used >= maxAttempts + retakeGranted`。
- **手动**：新增 `exam_retakes` 表（`id, exam_id, user_id, granted_by, created_at`）；管理员 `POST /api/exams/:id/retake` 批量授予，`GET` 查询已授予名单。
- **配置**：`retakeDefaultEnabled`（全局）+ `exams.auto_retake`（单场，§2.2）。

### ⑦ 消息通知（站内信 + 邮件 SMTP）
- **站内信**：新增 `notifications` 表（`id, user_id, title, content, type, is_read, created_at`）。
  - 接口：`GET /notifications`（分页）、`GET /notifications/unread-count`、`PUT /notifications/:id/read`、`PUT /notifications/read-all`。
- **邮件**：引入 `nodemailer`；SMTP 配置见 §2.1。
- **触发点**（各事件受对应开关控制）：考试发布（目标科室考生）、交卷出成绩（考生）、补考授予（考生）。
- **实现**：`notify.ts` 服务，`enqueue(type, userIds, title, content)` 同步写站内信 + 可选异步发邮件（内网量小可同步）。
- **配置**：`notify*` + `smtp*`（§2.1）。

### ⑧ 账号批量导入
- **现状**：`import` 模块仅支持试题（`import_batches.bank_id` 强外键）。
- **改动**：
  - 新表 `user_import_batches`（同 `import_batches` 但无 `bank_id`）。
  - 解析 `parseUserWorkbook`：列 `username/name/role/department/初始密码(可选)`。
  - 路由：`POST /users/import/preview`、`POST /users/import/commit`、`GET /users/import/batches`。
- **复用**：`preview → commit` 两段式、`importMaxRows`/`importMaxFileMb`/`defaultPassword` 配置。

### ⑨ 填空/简答 + 人工阅卷
- **题型扩展**：`questions.type` 增 `fill`（填空）、`short`（简答）。
  - `fill`：`answer` = 文本数组（逐空参考答案），**自动判分**（trim + 忽略大小写逐空匹配）。
  - `short`：`answer` = 参考答案文本，**人工阅卷**（0~满分）。
- **迁移**：`ALTER TABLE questions MODIFY type ENUM('single','multiple','judge','fill','short')`（`applyMigrations` 幂等补）；`answers` 类型扩为 `Record<string, number[] | string>`。
- **判分**：`grade()` 客观题自动判，主观题暂记 0；记录含主观题时 `status` 增加 `pending_review`。
- **阅卷**：`GET /records/pending`（待阅卷列表，admin）、`PUT /records/:id/review`（提交逐题主观分 + 重算总分）。
- **前端**：题库表单/导入支持新题型；答题页填空输入框、简答多行框；成绩报表加「待阅卷」入口 + 阅卷弹窗。

---

## 4. 数据库变更汇总

**新表**
1. `rate_limit_buckets`
2. `login_attempts`
3. `notifications`
4. `exam_retakes`
5. `user_import_batches`

**字段扩展（applyMigrations 幂等）**
1. `questions.type` enum 增 `fill`/`short`
2. `exams` 增 `shuffle_enabled`/`shuffle_options`/`auto_retake`
3. `exam_records.status` enum 增 `pending_review`；新增主观题得分列（`subjective_scores JSON`，阅卷结果）

---

## 5. 前端改动汇总

- **系统设置页**：新增「消息通知」Tab；「考试规则」「账号安全」补开关/阈值。
- **考试表单**：新增人手一卷/选项乱序/自动补考三个开关（预填全局默认）。
- **答题页**：切屏自动交卷；填空/简答输入。
- **成绩报表**：待阅卷列表 + 阅卷弹窗；补考授予按钮。
- **用户管理页**：账号批量导入入口（复用导入组件）。
- **顶栏/我的页**：站内信铃铛 + 未读数 + 消息中心。
- **题库表单/导入**：新题型支持。

---

## 6. 验收标准（节选）

- 关闭 `cheatAutoSubmitEnabled`：超阈值仅记录不交卷；开启：超阈值自动交卷（auto 标记）。
- 关闭 `shuffleDefaultEnabled`：同卷所有人题序一致；开启：人手一卷、选项乱序、判分正确、种子可复现。
- 关闭 `loginLockEnabled`：失败不锁定；开启：连错 N 次锁 M 分钟，解锁后可登录。
- 关闭 `notifyEmailEnabled`：仅站内信；开启且 SMTP 配好：邮件送达。
- 补考：自动补考仅一次；手动授予后考生可再考。
- 简答题：交卷后进待阅卷，阅卷后总分 = 客观 + 主观。

---

## 7. 风险与边界

- ⑤ 乱序涉及 `answer` 索引重映射，是判分正确性的核心，需重点单测。
- ⑨ 题型扩展影响 questions 全链路（CRUD/导入/组卷/快照/判分/答题/报表），改动面最大，单独成批回归。
- 邮件依赖 `nodemailer`；SMTP 不可用时降级为仅站内信，不阻断主流程。
- 练题域与 practice-web 本期不纳入（限流存储层除外，见 §3③）。
