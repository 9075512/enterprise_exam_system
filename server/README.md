# 考试系统后端（server）

Node.js + Express + TypeScript（ESM/NodeNext）后端服务。管理、考试和在线练题共用一个服务实例与主系统登录态。

## 1. 关键环境变量

| 变量 | 取值 | 说明 |
| --- | --- | --- |
| `ENABLE_PRACTICE` | `true` / `false`（默认 `true`） | 是否注册 `/api/practice` 练题路由；正式环境启用在线练题时必须为 `true` |
| `PRACTICE_SESSION_SECRET` | 随机长串 | 练习会话 `sessionToken` 的签名密钥 |
| `PRACTICE_SESSION_TTL` | 秒（默认 `1800`） | 练习会话有效期 |
| `PRACTICE_TZ_OFFSET` | 如 `+08:00` | 每日一练日期边界使用的时区偏移 |
| `PRACTICE_RATE_CHECK_PER_MIN` | 默认 `60` | 判题接口每设备每分钟上限（≤0 关闭） |
| `PRACTICE_RATE_BANKS_PER_MIN` | 默认 `30` | 题库接口每设备每分钟上限 |

完整示例见 `server/.env.example`。在线练题页面位于主前端 `/exam/practice`，不需要单独的前端、域名或后端进程。

## 2. 启动方式

```bash
npm run dev

# 或生产方式
npm run build
npm start
```

## 3. 数据库初始化（幂等）

```bash
npm run db:init
```

初始化会创建考试出题人关联表 `exam_authors`、考试内部试卷的一对一唯一约束，以及练题所需的进度、作答、错题、收藏、每日任务、设置和会话等表，并执行兼容性升级。脚本可重复执行，不会调用 `db:reset`。已有环境仅升级表结构、保留数据且不重新生成演示考试时，使用 `npm run db:init -- --schema-only`；`--skip-seed` 仅跳过种子数据，仍执行既有数据迁移。

## 4. 悬垂练题数据清理（可选）

删除用户后，其弱关联的练题数据可能残留。确认备份和目标库后可执行：

```bash
mysql -u root -p enterprise_exam_system < deploy/cleanup-orphan-practice.sql
```

## 5. 自检 / 测试

```bash
npm run typecheck
npm run test
npm run build
```

## 6. 管理员账号应急恢复

部署沿用已有数据库时，`db:init` 不会覆盖现有管理员密码。若所有管理员均无法登录，可在服务器上从标准输入传入一个符合当前密码策略的新密码：

```bash
read -rsp '请输入新的管理员密码：' NEW_ADMIN_PASSWORD && echo
printf '%s' "$NEW_ADMIN_PASSWORD" | npm run admin:recover -- --username admin --password-stdin
unset NEW_ADMIN_PASSWORD
```

命令会清除该账号的登录失败锁定、撤销旧会话并写入审计日志。它不会启用已停用账号，也不会关闭两步验证。


## 7. 考试内直接组题接口

- 管理员通过 `POST /api/exams`、`PUT /api/exams/:id` 一并提交考试设置、`authorIds`、`bankIds`、`questions: [{ questionId, score }]`，不再提交 `paperId`。
- `GET /api/exams`：管理员看全部，出题人仅看被分配考试；摘要含题数、总分、出题人、题库可读性和题目锁定原因。
- `GET/PUT /api/exams/:id/questions`：管理员或指定出题人读取/维护题目；PUT 仅接受题库和题目配置，其他字段拒绝。
- `POST /api/exams/draw-questions`：复用题型/知识点抽题规则，只返回选题草稿；`GET /api/exams/:id/export-pdf?withAnswer=1` 导出答案版，省略参数为考生版。
- 考试与内部试卷、出题人、名单使用同一事务保存；开考和修改共用考试行锁。到达开始时间或已有任意作答（含归档）后禁止改题、调分、更换题库或修改开始时间。
- 独立 `/api/papers` 接口已撤下；考生无法访问含答案的题目管理/导出接口。新库和空数据升级执行 `npm run db:init` 即可，不迁移历史共享试卷，也不执行清库。

## 考试抓拍

升级现有数据库：`npm run db:migrate:captures`。配置私有目录、HTTPS、安卓构建及验收见 [考试抓拍部署说明](../docs/exam-capture.md)。
