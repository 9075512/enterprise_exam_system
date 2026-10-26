# 下载页五版选稿

已选定 **A · 简洁下载中心**，正式入口为 [`/download`](http://127.0.0.1:5173/download)。正式页面与预览 A 共用同一组件；B / C / D / E 作为开发环境选稿保留。

正式构建截图：[桌面](screenshots/download-desktop.png)、[手机](screenshots/download-mobile.png)。生产构建浏览器验收记录见 [download-verification.json](screenshots/download-verification.json)，涵盖四种宽度、公开访问、真实版本与 APK 校验、待发布、错误重试、iPhone、微信、键盘操作及减少动态效果设置。

运行前端 `npm run dev` 和后端 `npm --prefix server run dev`，打开 [本地切换预览](http://127.0.0.1:5173/download-preview)。无需登录。

| 方案 | 视觉方向 | 独立页面 | 桌面截图 | 手机截图 |
| --- | --- | --- | --- | --- |
| A | 浅灰底、白色下载卡，下载优先 | [查看 A](http://127.0.0.1:5173/download-preview?design=a&standalone=1) | [1440px](screenshots/a-desktop.png) | [375px](screenshots/a-mobile.png) |
| B | 白底与品牌蓝分区，直立手机展示 | [查看 B](http://127.0.0.1:5173/download-preview?design=b&standalone=1) | [1440px](screenshots/b-desktop.png) | [375px](screenshots/b-mobile.png) |
| C | 深海军蓝、居中标题、横向下载面板 | [查看 C](http://127.0.0.1:5173/download-preview?design=c&standalone=1) | [1440px](screenshots/c-desktop.png) | [375px](screenshots/c-mobile.png) |
| D | 暖白与深绿、宋体标题、章节式排版 | [查看 D](http://127.0.0.1:5173/download-preview?design=d&standalone=1) | [1440px](screenshots/d-desktop.png) | [375px](screenshots/d-mobile.png) |
| E | 鲜明蓝底、大字号海报、白色下载卡 | [查看 E](http://127.0.0.1:5173/download-preview?design=e&standalone=1) | [1440px](screenshots/e-desktop.png) | [375px](screenshots/e-mobile.png) |

## 预览操作

- 顶部切换 A / B / C / D / E；桌面视图跟随可用宽度，最小 1024px；手机视图为真实的 375 × 812px iframe。
- `design=a|b|c|d|e` 和 `device=desktop|mobile` 保存在地址中，刷新保留选择。`standalone=1` 隐藏选稿工具栏，直接查看当前设计。
- 窄屏查看桌面方案时，在预览区域内横向滚动。新窗口按钮可独立打开方案，再自由调整窗口宽度。
- 五版使用同一发布接口和平台处理。二维码始终指向当前站点 `/download`，不带选稿参数。
- 本地回环地址生成的二维码用于核对展示；从手机访问时，应通过手机能访问到的站点地址打开页面。

## 实现边界

`/download-preview` 仅在 Vite 开发模式注册，生产构建不提供选稿入口。正式 `/download` 使用 A 版；其他布局及其样式独立放在预览组件中，生产入口仅引用简洁下载中心。五套布局共用 `useAppDownload`、下载动作、二维码、安装说明和更新说明，后端接口及 `AppRelease` 类型不变。方案标识、名称和展示色集中在 `designs.ts`。

截图记录本地接口实际发布的 v1.0.2。未发布、接口失败和 iPhone 访问时不会提供可用的 APK 下载动作；微信内点击下载会提示在浏览器打开。更新说明按纯文本渲染，二维码生成失败时仍保留正式下载页链接与重试入口。

## 验证

针对五套方案检查 375、768、1024、1440px：下载按钮位于首屏，按钮高度至少 44px，二维码不被裁切，页面无横向溢出。行为测试覆盖发布数据、加载、待发布、失败重试、iPhone、微信、二维码生成失败、查询参数恢复及方案切换。

另验证实际 APK 的 HEAD 请求返回 200、正确文件类型与文件长度，不增加下载计数。浏览器检查记录见 [verification.json](screenshots/verification.json)。
