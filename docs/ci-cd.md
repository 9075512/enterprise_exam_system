# 分支与自动测试

- `dev` 为开发集成分支，功能和修复分支通过 PR 合入。
- `main` 为正式分支，只接受本仓库 `dev` 发起的发布 PR。
- 两个长期分支均禁止直接推送、强制推送和删除；管理员也必须遵守 PR 与测试规则。
- PR 的必需检查为 `ci-success`，必须在最新目标分支基础上通过。

## GitHub Actions

`.github/workflows/ci.yml` 在指向 `dev`、`main` 的 PR 和这两个分支更新时运行：

| 检查 | 内容 |
| --- | --- |
| branch-policy | 校验 main 的 PR 来源 |
| web | 管理端与考试端测试、TypeScript 检查、生产构建 |
| practice | 练题端测试、TypeScript 检查、生产构建 |
| server | MySQL 8 独立测试库中的后端测试、TypeScript 编译 |
| ci-success | 汇总上述检查，失败、取消或跳过均不允许合并 |

运行时使用 Node.js 24，依赖通过各目录中的 `package-lock.json` 和 `npm ci` 安装。
MySQL 服务只在当前测试任务内存在，使用专用 `_test` 数据库及测试凭据，不访问开发或生产数据库。
构建产物保存 7 天，不包含 `.env`、上传附件或数据库数据。
工作流只申请读取仓库权限；第三方 Actions 固定到官方版本的提交 SHA。

## 部署接入

开发环境应在 `dev` 合并后、该提交的所有测试成功后自动部署，PR 测试期间不部署。
正式环境发布仍通过 `dev → main` 的发布 PR 管理，不自动将开发版本发布到正式环境。

自动部署需要先确定开发环境平台、部署目录、应用服务管理方式及健康检查地址。
部署凭据应放入 GitHub `development` Environment 的 Secrets，不写入代码或聊天。
当前尚未接入部署目标，测试与构建成功不代表已经部署。
