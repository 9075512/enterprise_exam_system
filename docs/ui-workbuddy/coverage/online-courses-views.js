// 在线看课补充设计，画面与数量均为功能演示。
Object.assign(window.DESIGN_ORG_VIEWS, {
  CourseManagePage: () => card('课程管理', '<p>草稿 / 已上架 / 已下架真实数量，关键词及状态筛选、服务端分页。</p><button>新增课程</button>')
    + card('课程列表', '<p>封面、标题、简介、分类、讲师、章节数、展示排序与更新时间。</p><button>预览</button><button>编辑</button><button>上架 / 下架</button><button>删除</button><p class="scope">已上架课程必须先下架再编辑或删除。错误保留上下文，保存成功但列表刷新失败时不重复创建。</p>'),
  CourseEditorDrawer: () => card('课程编辑', '<p>基本信息 / 课程详情 / 章节与视频三页签；新课程存草稿，上架前校验完整资料。</p><input placeholder="课程标题"><input placeholder="分类下拉与讲师"><textarea placeholder="课程简介"></textarea><p>封面上传或图片地址、难度与展示排序。</p><button>生成封面</button><p>未上传封面时，填写标题后一键生成深色网格封面；分类决定强调色，长标题自动换行。</p><button>添加章节</button><button>添加小节</button><p class="scope">章节与小节支持增删、上下排序；上传视频或填写视频地址。上传与生成均可取消，处理中锁定保存；失败保留草稿，未保存关闭需确认。</p>'),
  CourseListPage: () => card('把好奇，变成你的下一项能力', '<p>浅蓝学习引导区、书本插画与继续学习入口。</p>')
    + card('学习概览', '<p>3 门课程 / 已开始学习 / 已完成课程；按当前账号的数据库记录计算。</p>')
    + card('发现好课程', '<input class="input" placeholder="搜索课程"><p>全部课程 / 影像表达 / 自然观察 / 学习中 / 已完成</p><div class="split">'
      + ['影像观察与视觉叙事', '自然中的色彩与细节', '动画里的故事语言'].map(title => `<article class="card"><h3>${title}</h3><p>本地封面插画、最多两行的课程简介、难度、章节数、完成进度；完整说明和出处保留在详情页。</p><button>开始学习</button></article>`).join('')
      + '</div><p class="scope">桌面三列，平板两列，手机单列；无结果可重置筛选。存储失败显示明确提示。</p>'),
  CourseStudyPage: () => card('课程学习', '<p>全部课程返回入口、课程名称、分类、完整简介。</p>')
    + card('视频播放器', '<div style="aspect-ratio:16/9;background:#101b2d;color:white;display:grid;place-items:center">公开样片 · 点击播放</div><p>播放 / 暂停　00:23 / 09:56　只读进度条　1.0×　全屏</p><p class="scope">元数据就绪后续播，不自动出声。禁止拖动及倍速修改，播放结束标记完成；加载失败和20秒超时支持重试。</p>')
    + card('小节说明与章节目录', '<p>当前章节 / 第2小节 / 已完成状态，上一小节与下一小节。</p><details open><summary>01 从观察开始</summary><p>✓ 发现日常中的光与色彩 · 已完成</p><p>▷ 认识画面的构成 · 当前小节</p></details><details><summary>02 让画面讲述故事</summary><p>节奏与观察练习</p></details><p class="scope">桌面右侧目录，1050px及以下改为底部目录抽屉。进度本机暂存并同步数据库，换设备可续播，断网提供重试，暂停、隐藏及退出时补存。</p>'),
});
Object.assign(window.DESIGN_ORG_DRAWERS, {
  CourseManagePage: () => card('视频预览', '<p>完整课程标题与简介、当前小节选择、受控播放器；未配置视频时显示空态。</p><p class="scope">预览不保存学员进度，关闭销毁播放器；手机宽度94vw。</p>'),
  CourseEditorDrawer: () => card('课程编辑抽屉', '<p>桌面880px右侧抽屉，手机全宽；正文独立滚动，固定底部保存/取消。</p><p>JPG/PNG/WebP封面最大8MB，MP4/WebM视频最大200MB，上传进度可见且可取消。</p><p class="scope">并发修改返回版本冲突，保留草稿并提供重新加载；更换视频后生成新小节ID，旧进度不复用。</p>'),
  CourseStudyPage: () => card('课程目录', '<p>移动端底部78%高度抽屉，显示课程完成比例、可折叠章节及各小节状态。</p><button>✓ 发现日常中的光与色彩 · 已完成</button><button>▷ 认识画面的构成 · 当前小节</button><p class="scope">选择后切换视频并收起；支持遮罩、关闭按钮及Escape，焦点由抽屉组件管理。</p>'),
});

Object.assign(window.DESIGN_ORG_VIEWS, { CourseCategoriesDialog: () => card('课程分类维护', '<p>分类名称与排序，添加 / 编辑 / 删除；显示关联课程数量，使用中的分类禁止删除。加载、空态、错误重试和权限由课程管理入口控制。</p>') });
Object.assign(window.DESIGN_ORG_DRAWERS, { CourseCategoriesDialog: () => card('课程分类维护弹窗', '<p>桌面680px，手机94vw；表单单列，名称换行，操作锁定与未保存确认。改名同步关联课程；重复及并发冲突保留输入。</p>') });

Object.assign(window.DESIGN_ORG_VIEWS, { CourseDetailPage: () => card('课程介绍', '<p>封面、标题、分类、讲师、三行简介与展开、章节数量及完成进度。</p><button>开始 / 继续 / 再次学习</button>') + card('课程介绍与目录', '<p>桌面左侧完整富文本介绍，右侧折叠目录；手机介绍/目录页签和底部固定学习按钮。空图文回退简介，空目录禁用学习，加载失败重试；图片自适应，失败明确提示。浏览不产生观看记录，点击小节进入对应视频。</p>') });
