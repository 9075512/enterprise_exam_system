# 卓达智学 Android 学员端

原生 Android 客户端，复用现有 Vue 手机页面和后端。默认连接 **http://139.9.134.68**，安装后打开学员首页，未登录时自动进入登录页。支持 Android 8.0 及以上。

## 安装与使用

1. 将 `mobile/releases/zhuoda-learner-1.0.4-release.apk` 传到安卓手机并打开安装；按手机提示允许该文件来源安装应用。已安装旧版的手机可直接覆盖升级，无需卸载。
2. 打开「卓达智学」，使用原有**学员账号**登录。
3. 在现有手机导航中使用首页、在线看课、练题、考试和个人中心；成绩入口沿用现有学员页面。
4. 网络异常时点击「重新连接」，或通过「检查服务器地址」检查或更改服务器根地址，变更后重新登录。

这是在线 App：课程视频、题库、考试时间、答卷和成绩由现有服务器提供；不提供离线考试。安装包不包含数据库、服务器密码或演示账号。当前服务器使用 HTTP，后续迁移 HTTPS 可直接修改连接地址。

## 已实现的原生适配

- 原生启动图标、应用名称、加载进度、连接失败/HTTP 错误/证书错误提示。
- 页面正常显示时仅保留网页的移动导航，不叠加原生标题栏；加载完成后进度条不占位。
- 移动登录使用独立品牌欢迎区、白色表单卡片、大号输入控件和账号帮助；`assets/mobile-login.css` 同时供 Vue 与安卓使用，App 内置兼容布局使当前已部署页面直接生效。
- 保留网页登录态，重启从学员首页恢复；更换服务器清理旧站点的本地登录数据。
- 学员入口限制：内置兼容脚本将管理/出题页面跳回登录；新前端通过 App UA 在路由和登录时明确拒绝非学员账号。**后端原有角色与菜单权限仍是数据授权依据。**
- 安卓返回键：二级页面回退，首页双按退出，考试作答页阻止返回误退出。
- 课程视频全屏、全屏时保持亮屏、系统选图器上传简答题图片，不申请相册/存储权限。
- 成绩 CSV / 准考证 PDF 的 Blob 下载通过系统文件保存器选择位置，单个文件上限 10 MB。
- Android 15 刘海、状态栏、键盘与底部手势区域适配；切到后台时暂停 WebView，回来恢复，沿用网页切屏检测与服务端考试计时。
- 外部网页由用户确认后交给系统浏览器；不提供 JavaScript 原生接口，不接受 `file://` 导航，不忽略 HTTPS 证书错误。

## 构建

需要 JDK 17、Android SDK Platform 35、Build Tools 35.0.0。Gradle wrapper 固定 8.11.1，Android Gradle Plugin 固定 8.9.2。

Windows 项目根目录：

```powershell
# 使用 JAVA_HOME / ANDROID_HOME，或本项目 .android-tools 下的本地工具
npm run android:build

# 调试包，或更换预置地址
npm run android:debug
powershell -ExecutionPolicy Bypass -File mobile/build-android.ps1 -ServerUrl https://exam.example.com
```

脚本会执行 Java 地址校验测试、Android lint、APK 构建和签名验证。首次发布构建创建本地专用签名，后续复用。

Windows 中文项目路径会自动从 `%LOCALAPPDATA%/ZhuodaLearner` 下的英文缓存目录构建，避免 Android 原生工具和 JVM 参数文件的编码问题；源码和发布密钥仍保留在本项目。脚本文件使用 UTF-8 BOM，以兼容系统自带 Windows PowerShell 5.1。

**请单独备份 `android/learner-release.keystore` 和 `android/signing.properties`。** 两者已加入 Git 忽略，签名丢失将无法覆盖升级现有安装包。更新时保留 applicationId 和签名，并递增 `app/build.gradle` 的 versionCode/versionName；构建脚本会从 APK 元数据读取输出版本号。

Android Studio 可直接打开 `mobile/android`，或设置环境后命令行：

```powershell
cd mobile/android
.\gradlew.bat testDebugUnitTest lintRelease assembleDebug
```

## 部署与验证范围

APK 内置的学员兼容脚本使**当前已部署的网站无需立即更新即可使用**。源码中的 `src/utils/appClient.ts`、登录和路由改动随以后正常前端部署生效；本次不自动修改服务器。

发布前建议在实际手机上用正式学员账号验证：登录/验证码/两步验证、课程播放与全屏、练题/错题/收藏、开考/暂存/续考/交卷、成绩、图片上传、切到后台再返回与断网恢复。构建和签名通过不能代替这些真机业务验收。
