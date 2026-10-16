# AGENTS.md

本文件用于约束 Codex 在本项目中的核心开发行为。

## 1. 基本原则

- 先理解问题，再修改代码。
- 一个任务只处理一个逻辑目标。
- 遵循最小修改原则，不擅自扩大任务范围。
- 不修改与当前任务无关的代码。
- 不覆盖用户已有的未提交修改。
- 修改完成后必须检查 Diff，并执行相关测试。
- 不得伪造测试结果。
- 用户当前明确指令优先于本文件。

## 2. 分支规范

长期分支：

- `main`：稳定生产分支
- `dev`：开发集成分支

默认禁止直接在 `main` 和 `dev` 上进行业务开发。

普通任务必须基于最新 `dev` 创建独立分支：

```bash
git fetch origin
git switch dev
git pull --ff-only origin dev
git switch -c feat/plugin-installer
```

原则：

```text
一个独立任务 = 一个独立分支
```

分支命名统一使用：

```text
feat/<name>       新功能
fix/<name>        Bug 修复
hotfix/<name>     生产紧急修复
refactor/<name>   重构
perf/<name>       性能优化
docs/<name>       文档
test/<name>       测试
chore/<name>      工程维护
```

要求：

- 使用小写英文
- 使用 kebab-case
- 名称简短明确

例如：

```text
feat/plugin-installer
fix/task-timeout
refactor/task-scheduler
perf/database-query
docs/plugin-guide
```

## 3. Commit 规范

Commit 使用 Conventional Commits：

```text
<type>(<scope>): <中文描述>
```

允许的 type：

```text
feat
fix
refactor
perf
docs
test
build
ci
chore
revert
```

要求：

- `type` 使用标准英文
- `scope` 使用简短英文模块名
- Commit 描述必须使用中文
- 一个 Commit 对应一个逻辑修改
- Commit 信息必须明确说明实际修改内容

正确示例：

```text
feat(plugin): 新增插件在线安装功能
fix(task): 修复任务执行超时问题
refactor(scheduler): 重构任务调度流程
perf(database): 优化任务列表查询性能
docs(plugin): 更新插件开发文档
test(plugin): 增加插件安装测试
```

禁止使用：

```text
update
fix
fix bug
test
done
修改代码
优化
修复
feat: update
```

## 4. 修改范围

未经用户明确要求，不得顺便进行：

- 无关重构
- 全项目格式化
- 文件批量重命名
- 目录结构调整
- 依赖升级
- 数据库结构修改
- API 结构修改
- Docker 或 CI/CD 调整
- 无关文档修改

如果发现其他问题：

- 只报告
- 不顺手修改

如果其他问题会直接阻塞当前任务，可以进行当前任务所必需的最小修改，并说明原因。

## 5. 开发前与提交前检查

开始任务前至少检查：

```bash
git status
git branch --show-current
```

提交前至少检查：

```bash
git status
git diff
git diff --cached
```

必须确认：

- 当前分支正确
- 修改属于当前任务
- 没有混入用户无关修改
- 没有调试代码和临时文件
- 没有密码、Token、API Key、私钥、生产 `.env` 等敏感信息
- 已执行与当前修改相关的测试

测试没有实际执行时，不得声称“测试通过”。

## 6. Git 操作权限

Codex 默认可以：

- 查看 Git 状态和 Diff
- 查看 Git 历史
- Fetch / Pull
- 创建任务分支
- 修改代码
- 执行测试
- `git add`
- `git commit`

未经用户明确授权，禁止：

```bash
git push --force
git push -f
git push --force-with-lease
git reset --hard
git clean -fd
git clean -fdx
```

同时禁止：

- 删除 `main` 或 `dev`
- 删除远程分支
- 重写公共分支历史
- 覆盖用户未提交修改
- 直接向 `main` Push
- 擅自 Merge 到 `main` 或 `dev`

如果用户只说：

```text
提交代码
```

默认表示：

```text
git commit
```

不代表自动 `git push`。

只有用户明确要求“推送”时才执行 Push。

只有用户明确要求“合并”时才执行 Merge。

## 7. 完成标准

任务完成前必须确认：

- 功能已实现或问题已修复
- 修改范围没有超出任务
- Git Diff 已检查
- 相关测试已执行
- 没有敏感信息
- 没有覆盖用户修改
- Commit 信息符合中文规范

完成后简要汇报：

```text
已完成。

主要修改：
- xxx
- xxx

测试：
- xxx：通过

Git：
- 当前分支：feat/xxx
- Commit：a23bc91 feat(xxx): 中文提交说明
```

如果尚未 Commit，应明确说明：

```text
代码修改已完成，目前尚未提交 Git。
```

## 8. 核心规则

始终遵守：

```text
先检查，后修改。
一个任务，一个分支。
普通任务基于最新 dev 创建分支。
main 和 dev 默认禁止直接开发。
最小修改，不顺手重构。
Commit 描述必须中文。
一个 Commit 一个逻辑修改。
提交前检查 Diff 和测试。
不覆盖用户未提交修改。
默认可以 Commit。
默认不 Push。
默认不 Merge。
禁止 Force Push。
禁止 reset --hard。
禁止 git clean。
```
