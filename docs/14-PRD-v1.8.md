# 14 · PRD v1.8 —— 实时化与存储演进（规划）

> **状态：范围已确认，五项候选全部交付完成**（用户 2026-10-13 拍板：**5 项全做**；**低风险优先**；推送用 **SSE**；对象存储用**本地磁盘 + 抽象接口**；题目共享用**内容去重式复用**）
> 基线版本：v1.7（`c8df639`）
> 上游依据：`docs/13-交付说明-v1.7.md` §12「后续建议（v1.8 候选）」
> 交付说明：`docs/15-交付说明-v1.8.md`（v1.8 交付版本 `a2ca84f`）
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
| ③ | U3 归档自动定时任务 | ✅ 已完成 |
| ① | U1 实时监控 SSE 推送 | ✅ 已完成 |
| ④ | U4 富文本附件对象存储 | ✅ 已完成 |
| ⑤ | U5 题库复制内容去重复用 | ✅ 已完成 |

> **v1.8 五项候选全部交付完成**（交付顺序：② U2 → ③ U3 → ① U1 → ④ U4 → ⑤ U5）。

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

> **实际实现与本节差异（见 §11）**：
> 1. 图片读取改为**双通道鉴权**——浏览器 `<img>` 无法携带 `Authorization` 头，故上传返回的 URL 带
>    `HMAC` 签名（`?t=`），否则作答图片会全部裂图；
> 2. 不做 `ref_count` 引用计数与孤儿清理（本期先保证「可读、可管、不可越权」，清理任务留待后续）；
> 3. `express.json` 上限**保持 8mb**（兼容历史内联 base64 数据的续考与编辑，下一版再降）。

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

---

## 9. U3 交付详情（③ 归档自动定时任务，已交付）

### 9.1 服务层（零依赖调度）

- `maintenance.service.archive(input, actor: { id, name? }, extraDetail = {})`：签名由 `operatorId: string` 改为 **actor 对象**，审计 detail 可展开 `extraDetail`（自动任务传 `{ auto: true }`）；`record()` 的 actor 名称解析链为 `actor?.name ?? entry.actorName ?? entry.actorId`。
- 新增内部 `SYSTEM_ACTOR = { id: 'system', name: '系统自动' }`；模块级状态 `running`（单飞互斥）/ `lastAutoDate`（本地时区 `YYYY-MM-DD` 去重）/ `lastAutoRun`（最近一次结果）。
- `runAutoArchive(now = new Date(), opts = {})`：设置关闭 → `{ triggered: false, reason: 'disabled' }`；`archiveRetentionDays ≤ 0` → `reason: 'retention-disabled'`；否则调 `archive({ days }, SYSTEM_ACTOR, { auto: true })` 并归一化返回 `ArchiveAutoRunDto`；**失败 fail-open 不崩进程**。
- `maybeRunAutoArchive(now)`：单飞 + 开关 + 保留天数 + 时点（`archiveAutoHour`） + 同日去重 五重门控。
- `startArchiveScheduler()`：`setInterval(60_000).unref()`，在 `index.ts` 的 `app.listen` 后注册（`unref` 保证不阻塞进程退出与测试）。

### 9.2 接口与设置

| 项 | 说明 |
| --- | --- |
| `GET /maintenance/stats` | 扩展返回 `autoEnabled` / `autoHour` / `lastAutoArchive`（`ArchiveAutoRunDto \| null`） |
| `POST /maintenance/archive/auto-run` | admin；**忽略开关与时点**立即执行一次（便于验证），审计带 `auto: true`、actor 为「系统自动」 |
| `archiveAutoEnabled` | 设置项，默认 **false**（安全默认，与引入前行为一致） |
| `archiveAutoHour` | 设置项，默认 **3**，校验 0~23 |
| `archiveRetentionDays` | 已有；为 0 时自动任务跳过（`retention-disabled`） |

`ArchiveAutoRunDto`：`{ at, triggered, reason: 'scheduled' | 'manual' | 'disabled' | 'retention-disabled' | 'error', days, archived, skipped, archiveTotal, ok, error? }`。

### 9.3 前端

| 位置 | 变更 |
| --- | --- |
| `views/admin/SystemMaintenancePage.vue` | 新增「自动归档（定时任务）」卡片：开关 + 执行时点下拉（00:00–23:00）+ 保存设置 + 「立即执行一次」+ 上次结果/原因标签（`AUTO_REASON_LABEL`）+ 说明 alert |
| `views/admin/SettingsPage.vue` | `FIELD_TAB` 登记 `archiveAutoEnabled` / `archiveAutoHour` |
| `api/maintenance.ts` / `types` / `constants` | 新增 `ArchiveAutoRun` 类型与 `autoRun()` 接口；`MaintenanceStats` 增三字段；`SystemSettings` 与 `SETTINGS_DEFAULTS` 增两字段 |

### 9.4 验证结论

- 后端 typecheck **0 错**；新增 `server/src/test/v18b.test.ts`（9 用例：默认值/键存在、stats 暴露、出题人 1003、关闭不执行、时点不符不执行、到点执行且同日不重复、`auto-run` 忽略开关时点并写系统审计、保留天数 0 跳过、出题人调 `auto-run` 1003）全通过；全量 **341/341（23 文件）**。
- 前端 typecheck **0 错**、vitest **28/28**、`vite build` **成功**；练题端 typecheck **0 错**。
- `db:init` 幂等复跑：**表数量 31**，「结构升级：无需变更（已是最新）」（本期无新表，纯行为扩展）。
- **已知限制**：调度为**进程内**定时器，多实例部署会重复执行（当前为单实例内网部署；后续可加 DB 乐观锁）。

---

## 10. U1 交付详情（① 实时监控 SSE 推送，已交付）

### 10.1 连接中心（零依赖）

- 新增 `server/src/modules/exams/examMonitor.stream.ts`：
  - **按考试聚合**：`Map<examId, Set<SseSink>>`；同一场考试的全部订阅者**共享一个 ticker**，
    每轮**只查库一次**再广播 → 从根上解决「N 个监考页 × 每 15s 一次 `GET /monitor`」的数据库压力。
  - 容量保护：`MAX_CLIENTS_PER_EXAM = 20`、`MAX_CLIENTS_TOTAL = 200`，超限返回失败原因
    （`exam-limit` / `total-limit`）。
  - 心跳：每 `SSE_HEARTBEAT_MS = 15_000` 发送一行注释帧（`: ping`），防止反向代理空闲断连；
    首个订阅者到来时惰性启动，最后一个离开时停止。
  - ticker 内查询失败 → 下发 `error` 事件且**保留连接**（下一轮自动重试），不崩进程。
  - `resetMonitorStream()` 供测试清理；`timer.unref()` 保证不阻塞进程退出与测试。

### 10.2 接口

`GET /api/exams/:id/monitor/stream`（admin）：

| 项 | 说明 |
| --- | --- |
| 响应头 | `Content-Type: text/event-stream; charset=utf-8`、`Cache-Control: no-cache, no-transform`、`Connection: keep-alive`、`X-Accel-Buffering: no` |
| 长连接 | `res.setTimeout(0)` + `req.socket.setTimeout(0)` + `setNoDelay(true)` |
| 事件 | `ready`（连接建立，载荷 `MonitorStreamInfoDto`）/ `monitor`（`ExamMonitorDto` 快照）/ `error`（本轮查询失败） |
| 首帧 | 连接即下发 `ready` + 一次 `monitor` 快照（前端无需等待第一个间隔） |
| 鉴权 | 仅 `Authorization: Bearer`（header）；**不提供** `?token=` 兜底（避免令牌进访问日志） |
| 开关关闭 | HTTP 503 + `code 1016`（新增 `ERROR_CODES.MONITOR_PUSH_DISABLED` + `monitorPushDisabled()`） |
| 错误返回 | 开关关闭 / 连接超限 / 考试不存在（1004）均在**写 SSE 头之前**判定，返回普通 JSON，便于前端识别与降级 |
| 清理 | `res.on('close'|'error')` → `removeClient`（最后一个订阅者离开时自动停 ticker） |

### 10.3 设置项

| 键 | 默认 | 范围 | 说明 |
| --- | --- | --- | --- |
| `monitorPushEnabled` | **true** | boolean | 推送总开关；关闭后接口返回 1016，前端自动回退 15s 轮询 |
| `monitorPushIntervalSeconds` | **5** | 3~60 | 推送间隔；同一场考试的全部监考页共享一次查库 |

> **与「安全默认」的说明**：`monitorPushEnabled` 默认 **开启**（其余开关一律默认关闭）。理由：用户明确要求
> 「实时监控升级为推送」，且**前端始终保留 15s 轮询降级**（推送不可用即自动回退），开启推送不存在可用性风险；
> 该开关的定位是「反向代理不支持长连接」等环境的**降级闸门**。`db:init` 不写设置（设置存 `system_settings` JSON 列，
> 旧数据缺字段由 `getSettings()` 逐字段回退默认值补齐），故无迁移成本。

### 10.4 前端

| 位置 | 变更 |
| --- | --- |
| `src/utils/monitorStream.ts`（新） | **fetch + ReadableStream** 的 SSE 客户端（原生 `EventSource` 无法带 header）：手写帧解析（`event`/`data`，忽略注释行，兼容 `\r\n`）、**指数退避重连**（1s→2s→4s…上限 30s，连接成功复位）、永久不可用判定（1016 / 401 / 403 → 触发降级）、`close()` 后不再重连 |
| `views/admin/ExamMonitorPage.vue` | 默认走推送（`onInfo` 后停止轮询）；不可用时**自动回退 15s 轮询**；顶部展示刷新方式徽标（`实时推送 · 每 N 秒` / `推送重连中 · 已降级轮询 15 秒` / `轮询 · 每 15 秒`）与失败原因；「自动刷新」关闭时断开推送并停表 |
| `views/admin/SettingsPage.vue` | 「考试规则」页新增「监考大屏实时推送（SSE）」开关与「监考推送间隔（秒）」 |
| `types` / `constants` | `SystemSettings` 与 `SETTINGS_DEFAULTS` 增两字段；新增 `MonitorStreamInfo` 类型 |

### 10.5 验证结论

- 后端 typecheck **0 错**；新增 `server/src/test/v18c.test.ts`（13 用例：设置默认值/越界校验、非 admin 1003、
  未认证 1002、考试不存在 1004、开关关闭 503/1016、真实 HTTP 连接验证 `text/event-stream` + `ready`/`monitor` 首帧
  与 `intervalSeconds` 生效、断开后连接与 ticker 全部回收、帧格式、订阅上限、广播隔离、共享 ticker 惰性启停、
  查询失败降级为 `error` 事件）全通过；全量 **354/354（24 文件）**。
- 前端 typecheck **0 错**、vitest **28/28**、`vite build` **成功**；练题端 typecheck **0 错**。
- `db:init` 幂等复跑：**表数量 31**，「结构升级：无需变更（已是最新）」（本期无新表）。
- **已知限制**：连接中心为**进程内**状态（多实例部署时各实例各自维护订阅，推送仍正确，仅容量计数不全局）；
  SSE 经 Nginx 时依赖 `X-Accel-Buffering: no` 关闭缓冲（已设置）。

---

## 11. U4 交付详情（④ 富文本附件对象存储，已交付）

### 11.1 存储抽象（可替换为云对象存储）

- 新增 `server/src/utils/attachmentStore.ts`：`AttachmentStore` 接口（`save` / `read` / `createStream` /
  `exists` / `remove`）+ **本地磁盘实现**；导出单例 `attachmentStore` 作为替换点。
- 目录规则：`<STORAGE_DIR>/yyyy/MM/<id>.<ext>`（`STORAGE_DIR` 默认 `storage/attachments`，相对路径以
  **server 根目录**为锚点；已加入 `.gitignore` 与 `.env.example`）。
- **文件名完全由服务端生成**（时间戳 base36 + 随机串 + 白名单扩展名），客户端不参与路径拼接；
  `isSafeStorageKey()` 以 `^\d{4}/\d{2}/[A-Za-z0-9_-]+\.[a-z0-9]{2,5}$` 强校验，**天然杜绝路径穿越**。

### 11.2 数据表（表 32）

```sql
attachments(id, owner_id, kind, mime, size, storage_key, created_at)
  PRIMARY KEY(id) · KEY idx_attachments_owner(owner_id) · KEY idx_attachments_created(created_at)
```

无外键（账号删除后记录自包含）；**不做引用计数**（孤儿文件清理留待后续）。

### 11.3 接口

| 方法 | 路径 | 权限 | 说明 |
| --- | --- | --- | --- |
| POST | `/api/attachments` | 登录 | multipart（字段 `file`）；类型白名单 `png/jpeg/gif/webp/bmp`；上限按设置 `richTextImageMaxMb` **每次请求动态构造 multer**（改设置即时生效）；返回 `{ id, url, kind, mime, size, createdAt }` |
| GET | `/api/attachments/:id` | **双通道** | 流式返回图片；`Content-Type` 取记录值、`Cache-Control: private, max-age=31536000, immutable`、`X-Content-Type-Options: nosniff` |

**双通道鉴权（本期关键设计）**：

1. `Authorization: Bearer`（新增 `authOptional` 可选鉴权中间件解析）→ 要求**本人**或角色为 `admin` / `author`（阅卷需要）；
2. URL 查询串 `?t=<签名>`：`HMAC-SHA256(JWT_SECRET, 'attachment:' + id)` 取前 32 位十六进制。
   原因：富文本以 `v-html` 渲染，浏览器 `<img>` **无法携带请求头**，仅靠 Bearer 会导致图片全裂；
   签名**不含用户信息**且确定性（附件不可变、无需轮换），校验用 `timingSafeEqual` 防时序侧信道。
   校验前置 `attachmentStore.exists()`，文件缺失直接 1004，**不产生半截流式响应**。

### 11.4 富文本净化扩展与作答链路

- `sanitizeRichText` 的 `img[src]` 白名单由「仅 data URI」扩为**两种**：
  a. `data:image/*;base64,`（历史数据兼容，仍校验体积）；
  b. 站内附件 URL `/api/attachments/<id>?t=<签名>`（正则严格锚定前缀，`//evil.com`、`/uploads/x.png`、
     路径穿越 `../` 一律拒绝，且计入图片张数上限）。
- `records.service.saveAnswers` 改为按**系统设置**传入 `{ maxImages, maxImageBytes }`
  （`richTextImageMaxCount` / `richTextImageMaxMb` 实时生效）。

### 11.5 设置项与前端

| 键 | 默认 | 范围 |
| --- | --- | --- |
| `richTextImageMaxMb` | 2 | 1~10（MB） |
| `richTextImageMaxCount` | 3 | 1~10（张） |

- `src/api/attachments.ts`（新）：`uploadImage(file)` → 复用 `http.upload`（自动带 multipart 边界）。
- `components/common/RichTextEditor.vue`：**改为上传后回填站内 URL**（不再 data URI 内联）；
  新增「**Ctrl+V 粘贴图片**（含截图工具）」、上传中禁用与「图片上传中…」提示、URL 属性转义。
- `views/exam/components/QuestionCard.vue`：从设置 store 注入 `maxImages` / `maxImageBytes`（与后端同源）。
- `views/admin/SettingsPage.vue`：「考试规则」页新增两个数字项。
- 渲染侧（`ReviewPage` / `ScoreDetailPage` 的 `v-html`）**无需改动**：站内 URL 带签名即可直接显示。

### 11.6 验证结论

- 后端 typecheck **0 错**；新增 `server/src/test/v18d.test.ts`（14 用例：设置默认值/越界、上传成功
  （落盘 + 落库 + 存储键形态）、未登录 1002、非图片 1006、超限 1006、**无 Authorization 头凭签名读取**
  并逐字节比对、无签名时本人/阅卷角色可读而他人与匿名 1003、篡改签名 1003、不存在 1004、文件被清理
  后 1004、净化保留站内 URL 而丢弃外链/协议相对/路径穿越、张数上限、作答链路端到端暂存即净化）
  全通过；全量 **368/368（25 文件）**。
- 前端 typecheck **0 错**、vitest **28/28**、`vite build` **成功**；练题端 typecheck **0 错**。
- `db:init` 幂等复跑：**表数量 32**（新增 `attachments`），「结构升级：无需变更（已是最新）」。
- **已知限制**：孤儿文件与附件清理任务未实现（不做引用计数）；本地磁盘为单机存储，
  多实例部署需共享存储或改接云对象存储（替换 `attachmentStore` 单例即可）。

---

## 12. U5 交付详情（⑤ 题库复制内容去重复用，已交付）

### 12.1 落地范围的说明（重要）

决策 D3 选定「**内容去重式复用**」而非引用计数/跨库引用表。需要说明的是：

- **跨库「共享同一条题目行」在无引用表的前提下不可实现**——题目的归属由 `questions.bank_id` 决定，
  题库列表/组卷/统计都按该列过滤；让 B 库复用 A 库的题目行而不写映射表，B 库将看不到该题。
  因此本期的「内容去重式复用」落地为：**在「题目写入某个题库」的路径上按内容指纹去重，同内容只保留一行**，
  这正是 D3 语义内可实现、且不引入引用计数与删除依赖的形态；
- 未来若确需「一题多库引用」，应回到 U5 原方案（`bank_question_refs` + 删除保护 + 统计口径拆分），
  作为独立特性评估（本 PRD §2⑤ 已保留该设计）。

### 12.2 内容指纹

新增 `server/src/utils/questionFingerprint.ts`（零依赖，仅用 `node:crypto`）：

- 口径 = **题型 + 规范化题干 + 规范化选项 + 规范化答案** → `sha256` 取前 40 位十六进制；
- 文本归一：折叠连续空白 + `trim`（`A  B` ≡ `A B`）；
- 答案归一：**客观题（纯数值）升序排序**（`[2,0]` ≡ `[0,2]`）；**填空/简答保持原序**（空位顺序有语义）；
- 选项按顺序参与（顺序不同视为不同题）；字段以 `\u0001` 分隔，避免拼接歧义。

### 12.3 题库复制（`POST /api/banks/:id/clone`）

- 复制源库题目时逐题计算指纹，**同一批内指纹相同者复用首个新建的题目 id**（不重复建行）；
- 返回值由 `BankDto` 改为 **`BankCloneResultDto { bank, copied, reused }`**；
- 审计 `bank.clone` 的 `detail` 增 `reused`（与既有 `copied` 并列）；
- 前端 `BankCloneDialog.vue` 按计数反馈（`新建题目 N 道，内容重复复用 M 道`），弹窗说明文案同步；
- 复制仍为「新 id 全量复制」，**不影响源题库与其试卷引用**（行为兼容）。

### 12.4 Excel 导入（`POST /api/questions/import/commit`）

- 新增可选入参 `dedupe?: boolean`，**默认 false（与引入前行为完全一致，安全默认）**；
- `dedupe=true` 时先加载目标题库既有题目的指纹集合，逐行比对：命中 → **跳过建行**并计入 `reused`；
  批内重复同样只建一行；
- `CommitResult` 增 `reused`，满足 `successCount + reused + failCount === totalRows`；
- 前端 `QuestionImportDialog.vue` 在确认页新增「跳过重复题目（内容去重）」开关（默认关闭）与完成页计数。

### 12.5 验证结论

- 后端 typecheck **0 错**；新增 `server/src/test/v18e.test.ts`（9 用例：指纹幂等/空白折叠/客观题答案
  顺序无关/填空顺序有关/字段差异可区分；复制去重计数与题库题目数、题目 id 全新、审计留痕；
  不复制试题时计数为 0；导入默认关闭行为不变；开启 dedupe 时既有重复被跳过且批内重复只建一行；
  `dedupe` 类型校验 1001）全通过；全量 **377/377（26 文件）**。
- 前端 typecheck **0 错**、vitest **28/28**、`vite build` **成功**；练题端 typecheck **0 错**。
- `db:init` 幂等复跑：**表数量 32**，「结构升级：无需变更（已是最新）」（本期无新表）。
- **兼容性**：`v17e` 的题库复制断言已同步为 `data.bank.*`（响应结构变更）；导入接口未传 `dedupe` 时行为不变。

