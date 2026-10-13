# 14 · PRD v1.8 —— 实时化与存储演进（规划）

> **状态：范围已确认，分期交付中**（用户 2026-10-13 拍板：**5 项全做**；**低风险优先**；推送用 **SSE**；对象存储用**本地磁盘 + 抽象接口**；题目共享用**内容去重式复用**）
> 基线版本：v1.7（`c8df639`）
> 上游依据：`docs/13-交付说明-v1.7.md` §12「后续建议（v1.8 候选）」
> 贯穿原则不变：**能做开关/阈值/模板的，一律配置化**；**每期独立实现 + 测试 + 提交**，两端 typecheck/test 全绿；优先**零新增依赖**。

---

## 0. 范围（用户候选 5 项）

| 编号 | 主题 | 一句话 | 风险 |
| --- | --- | --- | --- |
| U1 | 实时监控推送 | 监考大屏由 15s 轮询升级为服务端推送（SSE / WebSocket） | 中 |
| U2 | 两步验证增强 | 2FA 支持**恢复码** + 管理员**强制重置** | 低 |
| U3 | 归档自动化 | 归档支持**定时任务**（当前仅手动 + `archiveRetentionDays` 记录策略） | 低 |
| U4 | 附件对象存储 | 富文本**粘贴图片** + 服务端**对象存储**（替代 data URI 内联） | 中 |
| U5 | 题目引用共享 | 题库复制的**跨库题目引用共享**（当前深拷贝），降低题库膨胀 | 高 |

**交付进度**

| 期 | 主题 | 状态 |
| --- | --- | --- |
| ② | U2 两步验证增强（恢复码 + 管理员强制重置） | ✅ 已完成 |
| ③ | U3 归档自动定时任务 | ⏳ 进行中 |
| ① | U1 实时监控 SSE 推送 | ⏳ 待开始 |
| ④ | U4 富文本附件对象存储 | ⏳ 待开始 |
| ⑤ | U5 题库复制内容去重复用 | ⏳ 待开始 |

---

## 1. 现状与约束

| 维度 | 现状 | 对 v1.8 的影响 |
| --- | --- | --- |
| HTTP | Express 4.21（`app.ts`：cors → json(8mb) → `/api` 路由 → 404 → 错误处理） | SSE 可直接用 `res.write`；对象存储需新增静态/流式读取路由 |
| 依赖 | 仅 `bcryptjs/cors/dotenv/exceljs/express/jsonwebtoken/multer/mysql2/nodemailer/pdfkit/zod` | 新增依赖需充分理由；SSE、TOTP、恢复码、调度器均可零依赖自研 |
| 鉴权 | 仅 `Authorization: Bearer <token>`（header） | 原生 `EventSource` **无法携带 header** → SSE 采用 **fetch + ReadableStream** 前端解析（复用现有 Bearer，后端零改动）；或后端放宽 `?token=`（需额外安全考量，不推荐） |
| 调度 | **无任何调度器**（无 node-cron，无 setInterval） | 归档定时任务 = `index.ts` 内进程内 `setInterval` + 单飞（single-flight）互斥 + 启动时读设置 |
| 上传 | `multer.memoryStorage()`（题库导入 / 用户导入） | 对象存储先落内存缓冲 → 校验 → 写盘，复用同一模式 |
| 静态托管 | **无** `express.static` | 新增受控读取路由（鉴权 + 白名单目录），不直接裸露目录 |
| 归档 | `maintenance.service.archive(input, operatorId)`（手动 POST） | 定时任务复用同一 service，审计 actor 标记为「系统」 |
| 富文本 | `data URI` 内联（单图 ≤512KB、≤3 张），`express.json` 8mb | 改上传取得 URL 后回填 `<img src="/api/attachments/xxx">`，请求体大幅减小 |
| 题库复制 | `cloneBank` 深拷贝（新 id 全量复制，含 rubric） | 引用共享需引入映射表 + 引用计数 + 删除保护 |

**红线**：所有脚本/测试仅针对 `enterprise_exam_system`（及测试库 `..._test`）；严禁触碰同实例其他库。

---

## 2. 分期方案（建议 5 期，每期独立提交）

### ① U1 实时监控推送（SSE）

- **传输选型**：**SSE**（零依赖、单向服务端→客户端、天然匹配「大屏推送」场景）；不引入 WebSocket（双向能力本期无需求，且需新增 `ws` 依赖与独立升级握手）。
- **后端**：`GET /api/exams/:id/monitor/stream`（admin）—— `Content-Type: text/event-stream`、`Cache-Control: no-cache`、`Connection: keep-alive`、`X-Accel-Buffering: no`；
  - 事件：`event: monitor` + `data: <ExamMonitorDto JSON>`；首帧立即推送，之后**按变更/心跳**推送（默认 5s 节流，可配 `monitorPushIntervalSeconds`）；
  - **心跳**：每 15s 发送 `: ping` 注释帧保活（穿透反代/防超时）；
  - **连接管理**：进程内 `Map<examId, Set<res>>`；`req.on('close')` 清理；单考试连接上限（防资源耗尽）；进程退出/超时兜底关闭。
  - **降级**：客户端连接失败 / 不支持流式读取 → 自动回退现有 15s 轮询（保留 `GET /exams/:id/monitor`）。
- **前端**：`ExamMonitorPage.vue` 增加「实时推送」开关（默认开）；用 `fetch` + `ReadableStream` 解析 SSE 帧（复用 `Authorization` header）；断线指数退避重连；连接状态徽标（已连接 / 重连中 / 已回退轮询）。
- **设置项**：`monitorPushEnabled`（默认 true）、`monitorPushIntervalSeconds`（默认 5，1~60）。
- **影响面**：新增 1 个路由 + 1 个 `monitorStream` 管理器；现有 `GET /monitor` 保留不动（向后兼容、供降级）。
- **风险与缓解**：连接泄漏（close 清理 + 上限）、代理缓冲（`X-Accel-Buffering: no`）、Nginx 超时（心跳帧）。
- **验收**：开考后大屏在 ≤2s 内反映状态变化（不再等一轮 15s）；连接断开后自动重连；推送不可用时自动回退轮询且功能不降级。

### ② U2 两步验证增强（恢复码 + 管理员强制重置）

- **恢复码**：
  - 表 `user_recovery_codes`：`id / user_id / code_hash / used_at / created_at`（**仅存哈希** bcrypt，不可逆；`UNIQUE(user_id, code_hash)`）。
  - 启用 2FA 时（`POST /auth/2fa/enable`）**一次性下发 10 个**恢复码（明文仅本次响应返回，提示用户保存）；支持「重新生成」（作废旧码）。
  - 登录第二步 `POST /auth/2fa/verify` 额外接受恢复码：命中即**标记已用**（一次性），并在响应中提示剩余数量；用尽或全部用尽时提醒。
  - `GET /auth/2fa/policy` 增 `recoveryCodesRemaining`。
- **管理员强制重置**：`POST /api/users/:id/2fa/reset`（admin）—— 清空 `two_factor_secret/two_factor_enabled` 并作废该用户全部恢复码；审计 `user.two_factor_reset`；通知该用户（`notifyEvent`，新增事件 `twoFactorReset`）。
- **前端**：`AccountSecurityDialog.vue` 启用 2FA 后弹「恢复码」清单（复制/下载）；显示剩余数量与「重新生成」；`LoginPage.vue` 第二步支持粘贴恢复码；`UserPage.vue` 增「重置两步验证」。
- **影响面**：新增 1 表 + 2 接口 + 1 事件模板；`AuthAction`/`AuditAction` 增 1 动作。
- **风险与缓解**：恢复码泄露（仅哈希存储、一次性、可批量作废）、锁定风险（管理员可强制重置兜底）。
- **验收**：启用 → 用恢复码登录成功且该码作废 → 剩余数递减；管理员强制重置后可重新用密码登录；审计留痕。

### ③ U3 归档自动定时任务

- **方案**：`src/index.ts` 启动后注册进程内定时器（零依赖），按设置 `archiveAutoEnabled`（默认 false，安全默认）/`archiveAutoCronHour`（默认 3，即每日 03:00）；每日到点触发 `maintenance.service.archiveAuto()`。
  - **单飞互斥**：`isRunning` 标志 + 上一轮未结束则跳过本轮；启动时若已过当日时点则等到次日（可加「启动后 N 分钟首跑」用于验证）。
  - **系统 actor**：审计 `system.archive` 的 actor 记为系统（`actorId='system'`、`actorName='系统自动'`）。
  - **可观测**：记录最近一次自动归档结果与时间（`GET /maintenance/stats` 增 `lastAutoArchive`）；失败 fail-open 不崩进程。
  - **可手动触发**：`POST /maintenance/archive/auto-run`（admin，便于验证；等价于立即跑一次自动策略）。
- **设置项**：`archiveAutoEnabled`（默认 false）、`archiveAutoHour`（默认 3，0~23）、`archiveRetentionDays`（已有，0 时自动任务不执行）。
- **前端**：`SystemMaintenancePage.vue` 增「自动归档」卡片（开关 + 执行时点 + 上次运行结果 + 立即执行按钮）。
- **风险与缓解**：多实例重复执行（本期为单实例内网部署，标注限制；后续可加 DB 乐观锁）、误删（仅 `submitted` + 已结束 + 无复核，复用既有安全边界）。
- **验收**：开关开启 + 设定时点后自动执行并留痕；关闭时不执行；手动「立即执行」可复现；幂等（重复跑不重复归档）。

### ④ U4 富文本附件对象存储

- **方案**：
  - 新增存储抽象 `server/src/utils/attachmentStore.ts`（本地实现 `localStore`：写入 `STORAGE_DIR`（env，默认 `./storage/attachments`），按 `yyyy/MM/` 分目录，文件名 = 随机 id + 扩展名；返回相对 key）。**预留接口**以便后续换云对象存储。
  - 表 `attachments`：`id / owner_id / kind / mime / size / storage_key / created_at / ref_count`（记录归属与引用，便于清理与配额）。
  - 接口：`POST /api/attachments`（登录用户，multipart，`multipart` 复用 multer 内存存储；限 `image/*`、单图 ≤2MB）→ 返回 `{ id, url }`；`GET /api/attachments/:id`（鉴权 + 归属校验后可读；用于 `<img src>`）→ 流式返回文件。
  - 富文本作答：`RichTextEditor.vue` 支持**粘贴图片**（`paste` 事件取 `clipboardData.items` 中的图片）与选择文件 → 上传得 URL → 插入 `<img src="/api/attachments/xxx">`；`sanitizeRichText` 的 `img[src]` 白名单**增加站内 `/api/attachments/` 前缀**（仍保留 data URI 兼容）。
  - **请求体**：不再内联 base64，`express.json` 上限可由 8mb **回调至 1mb**（或保持 8mb 兼容历史数据，建议保持 8mb 一版后再降）。
- **设置项**：`richTextImageMaxMb`（默认 2）、`richTextImageMaxCount`（默认 3）、`attachmentStorageDir` 只读展示。
- **前端**：`RichTextEditor.vue` 增粘贴上传 + 上传进度；`ReviewPage` / `ScoreDetailPage` 的 `v-html` 渲染站内图片 URL 原样可用。
- **风险与缓解**：XSS（`img[src]` 白名单收敛到站内前缀 + data URI；其余一律拒绝）、路径穿越（文件名服务端生成，不接受客户端路径）、孤儿文件（`ref_count` + 后续清理任务）、越权读取（`GET` 校验归属/角色）。
- **验收**：粘贴图片作答 → 请求体不再含 base64 → 服务端落盘 + 记录 + 回显；非法类型/超限被拒；渲染正常。

### ⑤ U5 题库跨库题目引用共享

- **方案**（**高风险，需先确认范围**）：
  - 新增映射表 `bank_question_refs`：`bank_id / question_id / added_by / created_at`（`question_id` 指向**归属题库**中的题目；一条题目可被多个题库引用）。
  - `BankDto` 增 `questionCount` 口径调整（自有 + 引用）；题库内列表 = 自有题 ∪ 引用题（去重）。
  - **组卷/考试**：`paper_questions.question_id` 不变（仍指向同一条题目，天然共享）；试题编辑权归**归属题库**授权出题人（引用方只读或需授权）。
  - **删除保护**：题目 `ref_count > 0` 时禁止删除（1005），或提示先解除引用；归属题库删除需先解除全部引用。
  - **复制语义扩展**：`cloneBank` 增 `mode: 'copy' | 'share'`（默认 `copy` 保持现状），`share` 模式下仅登记引用而不复制题目行。
- **备选（折中，低风险）**：**内容去重式复用** —— 复制时若目标题库已存在「题干+题型+答案」完全相同的题目，则复用其 id（不新建行），从而降低重复存储但不引入引用计数与依赖管理。
- **影响面**：新增 1 表；`banks.service` / `questions.repo` / `cloneBank` / 题库详情与列表 / 组卷抽题 / 删除校验多处改动；`questionCount` 口径变化影响仪表盘统计。
- **风险与缓解**：删除/编辑的依赖关系复杂（引用计数 + 删除保护 + 审计）、统计口径变化（`questionCount` 拆分为 `ownCount/referencedCount`）、历史兼容（老题库无引用行，读路径按「无引用 = 仅自有」兼容）。
- **验收**：跨库共享后不产生重复题目行；归属题编辑后引用方同步可见；有引用的题目不可删除；复制默认仍为深拷贝（行为不变）。

---

## 3. 影响面汇总

| 维度 | ① U1 | ② U2 | ③ U3 | ④ U4 | ⑤ U5 |
| --- | --- | --- | --- | --- | --- |
| 新表 | — | `user_recovery_codes` | — | `attachments` | `bank_question_refs` |
| 新接口 | +1（stream） | +3 | +2（auto-run / stats 扩展） | +2（上传 / 读取） | —（复用复制接口 + mode） |
| 新设置 | +2 | — | +2 | +2 | — |
| 新事件模板 | — | +1（`twoFactorReset`） | — | — | — |
| 前端改动 | 监控页 | 账号安全 / 登录页 / 用户页 | 维护页 | 富文本编辑器 / 编辑弹窗 | 题库列表 / 详情 / 复制弹窗 |
| 兼容性 | 保留轮询降级 | 纯新增 | 默认关闭 | data URI 仍兼容 | 默认深拷贝不变 |

---

## 4. 决策点（已拍板 2026-10-13）

| # | 决策 | 结论 |
| --- | --- | --- |
| D1 | 推送传输 | **SSE（fetch 流）**——零依赖、单向够用、复用 Bearer；保留 15s 轮询降级 |
| D2 | 对象存储实现 | **本地磁盘 + 存储抽象接口**——内网部署够用、零依赖，预留云对象存储替换点 |
| D3 | 题目共享范围 | **内容去重式复用**——复制时复用「题型+题干+选项+答案」完全相同的既有题目，不引入引用计数 |
| D4 | 交付顺序 | **低风险优先**：② U2 + ③ U3 → ① U1 → ④ U4 → ⑤ U5 |

---

## 5. 建议顺序与理由

> 建议：**② U2 + ③ U3（低风险、独立、可立即开工）→ ① U1（收益高、改动局部）→ ④ U4（需存储抽象，改动富文本链路）→ ⑤ U5（最后做，架构影响最大）**。

理由：先做**零架构风险、纯新增**的两项快速产生价值；再做**收益最高但局部**的 SSE；对象存储引入新概念（文件生命周期），放在监控之后；题目共享会改动题库/组卷/统计多处，风险最高，放最后并留足回归。

---

## 6. 验收要点（各期通用）

- 后端 typecheck 0 错；新增测试文件覆盖本期核心路径与边界；全量测试全绿。
- 前端 typecheck 0 错、vitest 全绿、`vite build` 成功；练题端 typecheck 0 错。
- `db:init` 幂等复跑「结构升级：无需变更（已是最新）」。
- 涉及开关的功能：默认值须保持「与引入前行为一致」（安全默认）。
- 每期独立提交，提交信息含范围、关键设计、验证结论。

---

## 7. 红线

- 所有脚本/测试仅针对 **`enterprise_exam_system`**（及测试库 `..._test`）——**严禁**操作同实例其他库（如 `exam_system`）。
- 归档/清理类操作沿用 v1.7④ 的安全边界（仅 `submitted` + 已结束 + 无复核申请）；自动任务默认**关闭**。

---

## 8. U2 交付详情（② 两步验证增强，已交付）

### 8.1 恢复码

- 新表 `user_recovery_codes`（表 31；`id / user_id / code_hash / used_at / created_at`，**无外键**自包含，2 索引）；**仅存 bcrypt 哈希**，明文只在启用 / 重新生成时一次性下发。
- 新增 `server/src/utils/recoveryCode.ts`（零依赖）：字符集 31 位（去除 `0/O/1/I/L`），格式 `XXXXX-XXXXX`（约 49 bit 熵）；`generateRecoveryCodes` / `normalizeRecoveryCode`（兼容小写、空格、全角连字符、无连字符）/ `isRecoveryCodeFormat`（与字符集严格一致）/ `hashRecoveryCode` / `matchRecoveryCode`。
- 启用 2FA（`POST /auth/2fa/enable`）→ 返回 `{ recoveryCodes: string[10] }`；关闭 2FA 或管理员重置时**作废全部恢复码**。
- 登录第二步 `POST /auth/2fa/verify` 的 `code` 同时接受 TOTP 动态码与恢复码：**仅当格式合法才查库**（避免热路径无谓 bcrypt 计算）；命中后 `markUsed`（条件更新保证一次性）；登录日志 reason 区分 `two_factor` / `recovery_code`。
- `POST /auth/2fa/recovery-codes`（需密码 + 验证码）重新生成，旧码立即失效。
- `GET /auth/2fa/policy` 扩展为 `AccountSecurityPolicyDto { text, expireDays, twoFactorEnabled, recoveryCodesRemaining }`。

### 8.2 管理员强制重置

- `POST /api/users/:id/2fa/reset`（admin）：清空密钥与开关、作废全部恢复码、**撤销该账号全部会话**、写审计 `user.two_factor_reset`，并向本人发送站内信（新增通知事件 `twoFactorReset`）。
- 未开启 2FA 的账号重置 → 1001；非 admin → 1003。
- 新增通知模板事件 `twoFactorReset`（`NotifyTemplates` 由 8 → 9 个；前后端双份同步 `NOTIFY_TEMPLATES_DEFAULT` / `NOTIFY_TEMPLATE_META`）；站内信 type 为 `security`。

### 8.3 前端

| 位置 | 变更 |
| --- | --- |
| `components/account/AccountSecurityDialog.vue` | 启用后展示**恢复码清单**（复制全部 / 下载 .txt / 关闭）、剩余数量与低余量警示、**重新生成**（密码 + 验证码） |
| `views/LoginPage.vue` | 第二步支持输入恢复码（占位与校验文案放宽，`maxlength` 6 → 11） |
| `views/admin/UserPage.vue` | 新增「重置2FA」操作（仅对已开启 2FA 的账号显示，二次确认） |
| `api/auth.ts` / `api/users.ts` / `types` / `constants` | 新增 `AccountSecurityPolicy` / `RecoveryCodes` 类型与接口；审计动作 `user.two_factor_reset`；通知模板新增 `twoFactorReset` |

### 8.4 验证结论

- 后端 typecheck **0 错**；新增 `server/src/test/v18a.test.ts`（14 用例）全通过，全量 **332/332（22 文件）**（`v17e` 的模板数量断言同步更新为 9）。
- 前端 typecheck **0 错**、vitest **28/28**、`vite build` **成功**；练题端 typecheck **0 错**。
- `db:init` 幂等复跑：**表数量 31**，「结构升级：无需变更（已是最新）」。
