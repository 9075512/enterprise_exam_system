# 考试系统后端（server）

Node.js + Express + TypeScript（ESM/NodeNext）后端服务。本文档补充**公网练题模块**的部署与运维说明。

> 完整架构见 `docs/06-architecture-practice-increment.md`（不修改该文档）。本文件仅作部署落地参考。

## 1. 运行模式（环境变量）

公网练题通过环境变量切换**单实例（方案甲）**与**独立练题实例（方案乙）**：

| 变量 | 取值 | 说明 |
| --- | --- | --- |
| `ENABLE_PRACTICE` | `true` / `false`（默认 `true`） | 内网实例是否注册 `/api/practice` 练题路由（便于联调） |
| `PRACTICE_ONLY` | `true` / `false`（默认 `false`） | `true` = **只装配练题路由**（公网练题实例）：考试/用户/报表路由**不注册**，进程内物理不可达 |
| `PRACTICE_EDGE_SECRET` | 随机长串 / 空 | 方案甲的边界兜底：非公网路由须带 `X-Internal-Key` 才放行；空=不启用 |
| `PRACTICE_JWT_SECRET` | 随机长串 | 练题登录 JWT secret（**与内网 `JWT_SECRET` 分离**；缺省由内网密钥派生，生产务必显式设置） |
| `PRACTICE_JWT_EXPIRES_IN` | 如 `12h` | 练题登录有效期 |
| `PRACTICE_SESSION_SECRET` | 随机长串 | 无状态 `sessionToken` 签名密钥（缺省派生） |
| `PRACTICE_SESSION_TTL` | 秒（默认 `1800`） | 练习会话有效期 |
| `PRACTICE_LOGIN_MAX_FAILS` | 默认 `5` | 登录失败锁定阈值 |
| `PRACTICE_LOGIN_LOCK_MINUTES` | 默认 `15` | 锁定时长（分钟，指数退避封顶 24h） |
| `PRACTICE_CAPTCHA_AFTER_FAILS` | 默认 `3` | 失败多少次后要求验证码 |
| `PRACTICE_RATE_CHECK_PER_MIN` | 默认 `60` | `check` 每设备每分钟上限（≤0 关闭） |
| `PRACTICE_RATE_BANKS_PER_MIN` | 默认 `30` | 题库接口每设备每分钟上限 |
| `PRACTICE_RATE_LOGIN_PER_MIN` | 默认 `10` | 登录每设备每分钟上限 |

完整示例见 `server/.env.example`。

## 2. 启动方式

```bash
# 内网实例（含全部考试域路由 + 练题路由）
npm run dev            # 或 npm run build && npm start

# 公网练题实例（方案乙：仅练题路由）
PRACTICE_ONLY=true PORT=3001 npm start
```

- 公网实例连**同一 MySQL** `enterprise_exam_system`，但使用**最小权限账号 `practice_app`**（见 §4）。
- 公网实例的 `:3001` **不映射公网**，仅经公网 Nginx 反代（见 `deploy/nginx-practice.conf`）。

## 3. 数据库初始化（幂等）

```bash
npm run db:init        # 建表 + 加列 + 种子；可重复执行
```

- 幂等新增 `question_banks.allow_practice`（默认 `0`，安全默认）+ 8 张练题表
  （`practice_progress` / `practice_answers` / `practice_wrong_book` /
  `practice_favorites` / `practice_daily_tasks` / `practice_settings` /
  `practice_sessions` / `practice_session_answers`），
  并为 `practice_answers` 幂等补建复合索引 `idx_pa_user_answered (user_id, answered_at)`。
- **只作用于** `enterprise_exam_system`；**绝不触碰**同实例 `exam_system` 库。
- `db:init` **不执行授权**（职责单一）；`practice_app` 的授权由运维按下节执行。

## 4. 最小权限数据库账号

```bash
# 先替换脚本中的 <PRACTICE_DB_PASSWORD>，再以 root 执行（可复跑，幂等）
mysql -u root -p < deploy/db-grants-practice.sql
```

授权结果：

| 表 | 权限 |
| --- | --- |
| `users` | **仅列级 SELECT**（`id, username, password_hash, name, role, department_id, status`），**绝不写** |
| `departments` | **仅列级 SELECT**（`id, name`）——仅用于「我的」页回显本人科室名，**绝不写** |
| `questions` / `question_banks` / `bank_view_departments` / `bank_view_users` / `bank_authors` | `SELECT`（题目只读，应用层同时校验叶子、有效状态、`allow_practice=1` 与用户浏览权限） |
| `practice_progress` / `practice_answers` / `practice_wrong_book` | `SELECT, INSERT, UPDATE, DELETE` |
| `practice_favorites` / `practice_daily_tasks` | `SELECT, INSERT, UPDATE, DELETE` |
| `practice_sessions` | `SELECT, INSERT, UPDATE`（创建、心跳和结束会话） |
| `practice_session_answers` | `SELECT, INSERT`（逐题日志仅追加） |
| `question_feedback` | `SELECT, INSERT`（学员仅能通过服务端核验后追加纠错反馈） |
| `practice_settings` | **仅 `SELECT`**——练题配置由内网实例（管理端「系统设置 → 公网练题」）写入，练题实例只读 |
| `papers` / `paper_questions` / `paper_bank_refs` / `exams` / `exam_records` / `import_batches` / `system_settings` | **无任何权限**（物理隔离） |

> 说明：练题实例账号**无 `exam_system` 库任何权限**。

## 5. Nginx 公网边界

见 `deploy/nginx-practice.conf`。要点：

- 公网 `server` 块**仅放行** `/api/practice/**` 与 `/practice` 静态资源；其余 `/api/**` 一律 `404`；
- 强制 HTTPS（`301 → HTTPS`）+ HSTS；`Cache-Control: no-store`；
- 登录接口单独更严限流（`limit_req_zone practice_login`）；
- 方案甲下，内网 Nginx 需对 `/api/**` 注入 `X-Internal-Key: <PRACTICE_EDGE_SECRET>`，
  应用层 `practiceEdgeGuard` 拒绝无该头的非公网请求（防直连 `:3001` 绕过）。

## 6. 悬垂练题数据清理（可选）

内网删除用户后，其练题数据（弱关联 `user_id`）可能残留：

```bash
mysql -u root -p enterprise_exam_system < deploy/cleanup-orphan-practice.sql
```

## 7. 自检 / 测试

```bash
npm run typecheck      # 类型检查
npm run test           # 单测（含判分抽取回归）
```
