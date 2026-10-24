// App 分发设计：示例值仅用于展示，实际页面从已发布版本接口加载。
Object.assign(window.DESIGN_ORG_PRIMARY, { AppManagePage: '上传新版本' });
Object.assign(window.DESIGN_ORG_VIEWS, {
  AppDownloadPage: () => '<section class="card app-distribution-design"><p>卓达学习 · ANDROID APP</p><h1>把学习，<br>装进口袋。</h1><p>课程、练题、考试、成绩，用原有工作账号随时进入学习。</p><button class="primary">下载 Android 版</button><p>v1.0.2 · 27.9 KB · Android 8.0 及以上（设计示例）</p><p class="scope">桌面左右分栏，右侧为真实移动登录截图的手机预览；手机改为上下布局。蓝色下载按钮高54px，iPhone显示网页版入口。</p></section>'
    + card('从学习到考试，都在这里', '<div class="split"><p>学习课程 · 视频与课程目录</p><p>在线练题 · 错题与收藏</p><p>考试测评 · 作答与交卷</p><p>成绩查询 · 成绩与解析</p></div>')
    + card('三步开始学习', '<p>01 下载安装包 → 02 按系统提示安装 → 03 使用原有账号登录</p><p class="scope">微信内显示“在浏览器打开”提示；不提供虚假的 iOS 安装入口。</p>')
    + card('扫码下载与更新说明', '<p>二维码指向稳定的 /download 地址，版本更新无需更换分享链接。</p><p>更新说明按纯文本逐行显示；SHA-256 放入可展开的完整性说明。</p><p class="scope">加载时禁用下载，未发布显示“暂未发布”，接口失败显示重试。公开页面不依赖登录和菜单权限。</p>'),
  AppManagePage: () => card('卓达学习 v1.0.2 · 正在分发', '<p>当前版本、发布日期及最低安卓版本。</p><div class="split"><p>1 个版本记录</p><p>1 个已发布版本</p><p>0 次完成下载</p></div><p class="scope">以上为设计示例；完整下载次数不等同于安装设备数。</p>')
    + card('一个链接，持续更新', '<input readonly value="https://exam.example.com/download"><button>复制链接</button><p>右侧为下载页二维码；手机改为单列。</p>')
    + card('版本与安装包', '<input placeholder="搜索版本号或更新说明"><select aria-label="筛选版本状态"><option>全部状态</option><option>已发布</option><option>草稿</option><option>已下架</option></select><button>刷新</button><div class="table-scroll"><table><thead><tr><th>应用版本</th><th>更新说明</th><th>状态</th><th>下载次数</th><th>发布时间</th><th>操作</th></tr></thead><tbody><tr><td>卓达学习 v1.0.2<br>versionCode 10002 · 27.9 KB</td><td>移动登录与学习体验更新<br><button>复制 SHA-256</button></td><td>当前版本</td><td>0</td><td>2026年10月23日</td><td><button>编辑</button><button>下架</button><button>下载</button></td></tr></tbody></table></div><p class="scope">加载、无版本、无筛选结果、失败重试分别显示；无管理员权限显示无权限页，服务端拒绝管理请求。低版本发布与过期 revision 拒绝并提示刷新。</p>'),
});
Object.assign(window.DESIGN_ORG_DRAWERS, {
  AppManagePage: () => card('上传新版本 / 编辑版本信息', '<p>桌面640px任务弹窗；手机左右16px安全边距、单列表单，正文内部滚动。</p><p>拖放或选择 APK（最大200 MB）、应用名称、最低安卓版本、展示版本号、内部版本号、逐行更新说明。</p><p>编辑时锁定版本号，安装包不可原位替换。创建先存为草稿，再独立发布。</p><p class="scope">必填错误聚焦；保存时显示上传进度并锁定关闭与重复提交。失败保留输入与文件；成功关闭并刷新。发布与下架独立确认，下架后下载失效。</p><button>取消</button><button class="primary">保存草稿 / 保存修改</button>'),
});
