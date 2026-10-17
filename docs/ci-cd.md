# CI/CD 自动测试与部署

- `dev` 为开发集成分支，功能和修复分支通过 PR 合入。
- `main` 为正式分支，只接受本仓库 `dev` 发起的发布 PR。
- 两个长期分支均禁止直接推送、强制推送和删除；管理员也必须遵守 PR 与测试规则。
- PR 的必需检查为 `ci-success`，必须在最新目标分支基础上通过。

## GitHub Actions

`.github/workflows/ci.yml` 在指向 `dev`、`main` 的 PR 和这两个分支更新时运行：

| 检查 | 内容 |
| --- | --- |
| branch-policy | 校验 main 的 PR 来源 |
| web | 管理端、考试端与内置练题模块测试、TypeScript 检查、生产构建 |
| server | MySQL 8 独立测试库中的后端测试、TypeScript 编译 |
| ci-success | 汇总上述检查，失败、取消或跳过均不允许合并 |

运行时使用 Node.js 24，依赖通过各目录中的 `package-lock.json` 和 `npm ci` 安装。
MySQL 服务只在当前测试任务内存在，使用专用 `_test` 数据库及测试凭据，不访问开发或生产数据库。
后端任务安装中文 TTF 字体并设置 `PDF_FONT_PATH`，覆盖真实 PDF 导出测试。
构建产物保存 7 天，不包含 `.env`、上传附件或数据库数据。
工作流只申请读取仓库权限；第三方 Actions 固定到官方版本的提交 SHA。

## 自动部署流程

`.github/workflows/cd.yml` 只接收 **push 触发且成功完成** 的 `CI` 工作流：

- `dev` 自动部署到 GitHub `development` Environment；
- `main` 自动部署到 GitHub `production` Environment；正式发布入口仍然只有 `dev → main` 的 PR；
- PR 工作流、失败的 CI、来自 fork 的运行均不会触发部署；
- CD 下载该次 CI 产生的前端和后端两个构建产物，不在部署阶段重新构建；
- 发布包通过 SSH 上传后，由 `deploy/remote-deploy.sh` 校验 SHA-256、安装后端生产依赖、原子切换 `current` 软链并重启服务；
- 后端健康检查通过才算成功；失败会切回上一版本并重启服务；
- 默认保留最近 5 个版本，附件与环境文件位于 `shared/`，不会随版本清理。

同一环境的部署不会互相取消，避免一个发布在切换过程中被后续提交打断。建议给 GitHub `production` Environment 配置 Required reviewers，使正式部署在合并 `main` 后仍需人工批准。

## 一次性服务器准备

目标为使用 systemd 与 Nginx 的 Linux 服务器，需要 Node.js 24、npm、curl、tar、sha256sum 和中文字体。以下以默认目录及账号为例：

```bash
sudo useradd --system --home /nonexistent --shell /usr/sbin/nologin examapp
sudo useradd --create-home --shell /bin/bash examdeploy
sudo usermod -aG examapp examdeploy
sudo install -d -m 2775 -o examdeploy -g examapp /opt/enterprise-exam/releases
sudo install -d -m 2750 -o root -g examapp /opt/enterprise-exam/shared
sudo install -d -m 2770 -o examapp -g examapp /opt/enterprise-exam/shared/storage/attachments
sudo install -m 640 -o root -g examapp deploy/server.env.example /opt/enterprise-exam/shared/server.env
```

编辑 `server.env`，替换所有示例口令，确认 `ENABLE_PRACTICE=true`，并确认 `STORAGE_DIR` 与实际 `DEPLOY_PATH` 一致。安装 systemd 服务：

```bash
sudo install -m 644 deploy/systemd/enterprise-exam.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable enterprise-exam
```

部署账号必须能写入 `/opt/enterprise-exam`，并仅被授予无密码重启该服务的权限。用 `sudo visudo -f /etc/sudoers.d/enterprise-exam-deploy` 创建：

```sudoers
examdeploy ALL=(root) NOPASSWD: /bin/systemctl restart enterprise-exam
```

不同发行版的 `systemctl` 可能位于 `/usr/bin/systemctl`，应以 `command -v systemctl` 的结果为准。Nginx 静态目录指向：

```text
/opt/enterprise-exam/current/web
```

`deploy/nginx-exam.conf` 是统一入口基线，`/exam/practice` 与其他页面由同一 SPA 提供。复制、替换域名和证书配置后，先运行 `sudo nginx -t` 再加载。首次数据库初始化步骤见 `docs/18-使用说明与部署教程.md`；首次部署前必须完成数据库初始化，自动迁移默认关闭。

从旧双端拓扑升级时，需要一次性停用旧 `enterprise-practice` 服务，移除原练题域名的 Nginx 站点，并删除服务器上的 `shared/practice.env`；确认不再回滚到旧版本后再清理旧 `current/practice` 产物。GitHub Environment 中遗留的 `PRACTICE_SERVICE` 和 `PRACTICE_HEALTHCHECK_URL` 变量也应删除。

## GitHub Environments 配置

分别创建 `development` 和 `production`，每个 Environment 配置以下同名项，因此两个环境可以使用不同服务器。

Secrets：

| 名称 | 必填 | 说明 |
| --- | --- | --- |
| `DEPLOY_HOST` | 是 | 服务器域名或 IP |
| `DEPLOY_PORT` | 否 | SSH 端口，默认 `22` |
| `DEPLOY_USER` | 是 | SSH 部署账号，如 `examapp` |
| `DEPLOY_SSH_KEY` | 是 | 专用私钥全文；公钥写入服务器 `authorized_keys` |
| `DEPLOY_KNOWN_HOSTS` | 是 | 预先核验过的主机公钥记录；不要在工作流中临时信任 `ssh-keyscan` 结果 |

Variables：

| 名称 | 默认值 | 说明 |
| --- | --- | --- |
| `APP_URL` | 空 | GitHub 部署页显示的访问地址 |
| `DEPLOY_PATH` | `/opt/enterprise-exam` | 服务器部署根目录，必须是绝对路径 |
| `API_SERVICE` | `enterprise-exam` | 完整后端 systemd 服务名；填 `-` 可跳过 |
| `API_HEALTHCHECK_URL` | `http://127.0.0.1:3001/api/health` | 在服务器本机执行的探活地址；填 `-` 可跳过 |
| `KEEP_RELEASES` | `5` | 保留的版本目录数量，最少为 `2` |
| `RUN_DB_MIGRATIONS` | `false` | 是否在切换前运行幂等 `dist/db/init.js` |

获取并人工核验主机公钥后，把整行记录存入 `DEPLOY_KNOWN_HOSTS`。如果使用非 22 端口，记录中的主机通常是 `[hostname]:port` 格式。

## 数据库变更与回滚边界

只有在已完成数据库备份、运行账号具备结构变更权限、且变更向后兼容时，才把 `RUN_DB_MIGRATIONS` 设为 `true`。代码健康检查失败会自动回滚 `current` 软链，但数据库结构不会自动逆向回滚；存在不兼容变更时必须采用独立迁移和人工回滚方案。

如需手工回退代码，可在服务器把 `current` 原子切到保留的版本目录，然后重启服务并执行健康检查。
