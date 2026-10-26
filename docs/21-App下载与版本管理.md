# App 下载与版本管理

下载页 `/download` 对未登录与已登录用户均可见；后台入口为「组织与系统 → App 管理」(`/admin/apps`)，只允许管理员操作。此模块接入现有 Vue / Express / MySQL，不使用独立的前端本地存储模拟版本。

下载页采用已确认的「精致品牌展示」：白底与蓝色展示区组合，桌面端左侧为标题、下载操作及二维码，右侧为真实登录界面的直立手机预览；手机端优先呈现下载按钮，下方提供三项功能、安装步骤与更新说明。设计选稿入口仅在开发环境可用，正式访问 `/download` 即可使用新版。

## 使用

1. 在 App 管理点击「上传新版本」，选择不超过 200 MB 的 APK，填写与打包配置一致的版本名、内部版本号 versionCode、最低安卓版本和逐行更新说明。
2. 保存后处于草稿状态，公网无法下载；确认后点击「发布」，下载页立即采用最高 versionCode 的已发布版本。
3. 可编辑应用名称、最低安卓要求和更新说明。版本号与安装包不可原位替换，需要上传新版本；覆盖安装必须保持应用 ID、发布签名一致并递增 versionCode。
4. 下架后对应文件下载立即返回 404；下载页回退至上一已发布版本，没有其他版本时显示待发布。
5. 分享下载页链接或二维码，二维码始终指向 `/download`，不需要随着版本更改。

下载次数仅统计完成的完整文件传输，不代表用户/安装设备数；HEAD、失败传输、Range 分段请求不计数。iPhone 只显示安卓版本提示与网页版入口，微信内会提示在浏览器打开。

## 初始化与部署

先构建前后端，再在部署服务器为新模块创建表：

```sh
npm run build
npm --prefix server run build
npm --prefix server run app:setup
```

`app:setup` 幂等创建 `app_releases`，不会重置已有业务数据。新建环境的 `db:init` 同样包含此表。首个版本可以通过后台上传，也可在项目根目录导入现有 APK：

首次建表需要数据库维护账号的 CREATE 权限；生产应用账号可继续只持有原有读写权限。维护账号可执行 `apps.ddl.ts` 导出的建表语句，或在受控迁移会话中使用维护凭据运行 `app:setup`。已有表时 `app:setup` 只读检查，不重复发送 CREATE，因此普通应用账号可以正常导入安装包。

```sh
npm --prefix server run app:setup -- --file ../mobile/releases/zhuoda-learner-1.0.2-release.apk --version 1.0.2 --code 10002 --publish
```

服务端构建部署后如不保留 tsx 开发依赖，可在 server 目录使用等价命令 `node dist/scripts/setupAppDistribution.js`，参数相同。

自动部署在切换 `current` 前执行 `node dist/scripts/checkAppDistribution.js`，只读校验版本表及接口所需字段。该检查独立于 `RUN_DB_MIGRATIONS=false`；缺表、缺列或无读取权限会停止部署并保留旧版本。同一活动版本重试部署时也会执行检查。它不创建表、不导入或发布 APK；HTTP `/api/health` 返回成功不能代替该模块的数据结构检查。

默认安装包存放于 `server/storage/app-releases`，可用 `APP_RELEASES_DIR` 设置持久化绝对路径。发布切换时应保留整个 `storage` 共享目录，并与数据库一同备份。文件由服务端生成 UUID 名称，不接受客户端存储路径。

使用已更新的 `deploy/nginx-exam.conf`，其中仅 `/api/apps/manage` 允许 201 MB 请求体；其余接口保持原有限制。下载走同源 `/api/apps/releases/:id/download`，无需对磁盘目录设置静态公开访问。

本地开发运行现有 Vite 与后端即可：下载页 `http://localhost:5173/download`，后台 `http://localhost:5173/admin/apps`。上线到现有服务器后，对应地址为 `http://139.9.134.68/download` 与 `http://139.9.134.68/admin/apps`；这些地址在完成前后端部署和新表初始化后生效。

## 校验与权限

- 上传采用有大小限制的磁盘流式接收，检查 ZIP 中央目录与 AndroidManifest.xml 存在性，计算 SHA-256，校验失败清理临时文件。
- 此处提供 APK 结构检查和完整性摘要，**不自动解析 versionCode 或验证 APK 发布证书**；维护人员应核对打包信息与签名。
- 管理接口同时校验登录态、管理员角色及 `app-management` 菜单权限；版本变更复用系统审计记录。
- 配置 `PRACTICE_EDGE_SECRET` 的考试服务仅额外公开 App 版本读取和 APK 下载的 GET/HEAD；管理接口仍须通过原有边界。`PRACTICE_ONLY` 独立练题实例不注册本模块。
- 编辑与发布校验 revision，拒绝过期覆盖；发布操作加数据库事务锁，阻止低版本覆盖当前下载版本。
