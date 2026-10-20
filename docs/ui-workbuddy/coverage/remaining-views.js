// 账号、岗位、公告及成绩反馈的补充设计；全部数量为设计示例。
Object.assign(window.DESIGN_ORG_VIEWS,{
PositionManagePage:()=>card('当前岗位范围','<p class="scope">全部岗位 · 3条匹配（设计示例）；加载失败显示数量未知。</p><input placeholder="搜索岗位名称、说明"><button>刷新</button>')+card('岗位列表','<div class="remaining-desktop table-scroll"><table><thead><tr><th>岗位名称</th><th>说明</th><th>操作</th></tr></thead><tbody><tr><td>医疗质量与安全管理岗位</td><td>完整岗位说明及原组织/考务用途</td><td><button>编辑</button><button>删除</button></td></tr></tbody></table></div><div class="remaining-mobile"><h3>医疗质量与安全管理岗位ABCDEFGHIJKLMNOPQRSTUVWXYZ</h3><p class="quality-wrap">岗位说明与原有组织、考试圈选用途完整展示。<br>保留段落</p><button>编辑</button><button>删除</button></div>'),
ScoreDetailPage:()=>card('原答卷结果','<p>考试名、原始交卷时间、五类题型与得分范围。待阅卷不显示最终结果。</p>')+card('完整题干与纠错','<p class="quality-wrap">原题干完整展示ABCDEFGHIJKLMNOPQRSTUVWXYZ<br>第二段原文</p><button>全部</button><button>仅答错</button><button>题目纠错</button><p class="scope">纠错弹窗冻结本题与原答卷来源；管理员保持无入口。</p>'),
AccountSecurityDialog:()=>card('账号安全','<p>密码策略 / 两步验证 / 恢复码 / 登录设备</p><p class="scope">仅显示真实策略及恢复码数量；失败保持未知。</p>'),
ChangePasswordDialog:()=>card('修改密码','<p>原有最短长度与服务端安全规则保持。必填、长度和两次一致性检查在提交前执行。</p>'),
ContentBoard:()=>card('公告与轮播','<p>按原发布范围读取，轮播支持键盘访问，公告列表支持完整详情。</p><p class="scope">重要公告在关闭动画和模型同步完成后逐条显示。</p>'),
PracticeNoticeCard:()=>card('练题公告','<p>仅练题生效内容；保持已读回执与一次提醒规则。</p>'),
QuestionFeedbackDialog:()=>card('题目纠错','<p>考试成绩与练题共用完整表单，调用各自原接口，归属和权限由服务端继续校验。</p>'),
AppLayout:()=>card('搜索与帮助','<p>当前账号可访问菜单 · 23条匹配（设计示例）</p><input placeholder="输入菜单名称或路径"><button>关闭搜索</button><p class="scope">手机全屏、正文独立滚动；菜单项44px；零匹配显示空状态。</p>')});
Object.assign(window.DESIGN_ORG_DRAWERS,{
PositionManagePage:()=>card('岗位编辑','<div class="field"><label>岗位名称 *</label><input class="input" placeholder="保留完整名称"></div><div class="field"><label>说明</label><textarea class="input">保留段落及原说明</textarea></div><p class="scope">保存失败保留草稿；确认与写入期间锁定重复操作。底部取消 / 保存。</p>'),
AccountSecurityDialog:()=>card('密码策略与TOTP','<p>当前策略来自接口，恢复码数量未知显示—。</p><button>开启两步验证</button><p class="scope">输入校验与失败提示原位展示；保留复制密钥、恢复码复制/下载和确认能力。</p>')+card('手机设备卡片','<strong>iOS · Safari　当前设备</strong><p class="quality-wrap">IP 2001:db8:85a3:0000:0000:8a2e:0370:7334</p><p>最后活跃时间完整显示</p><p class="scope">当前设备没有下线按钮。其他设备可确认下线；安全操作与设备操作互斥。</p>'),
ChangePasswordDialog:()=>card('修改密码表单','<div class="field"><label>旧密码 *</label><input class="input" type="password"></div><div class="field"><label>新密码 *</label><input class="input" type="password"></div><div class="field"><label>确认新密码 *</label><input class="input" type="password"></div><p class="scope">字段错误就地显示并聚焦。提交中禁止关闭和重复请求，失败输入保留。</p>'),
ContentBoard:()=>card('完整公告','<p class="quality-wrap">完整公告标题ABCDEFGHIJKLMNOPQRSTUVWXYZ</p><p>发布时间、重要标记、净化后的富文本完整阅读。</p><p class="scope">长正文内滚动；代码局部横滚；底部关闭公告 / 我知道了。</p>'),
PracticeNoticeCard:()=>card('重要公告与详情','<p>第1条 → 关闭动画完成并同步状态 → 第2条 → 第3条。</p><p class="scope">阅读全屏，固定底栏44px；保留原一次提醒和回执规则。</p>'),
QuestionFeedbackDialog:()=>card('冻结原题','<strong>第1题</strong><p class="quality-wrap">完整题干ABCDEFGHIJKLMNOPQRSTUVWXYZ<br>原始第二段</p><div class="field"><label>问题描述 *</label><textarea class="input" maxlength="1000">保留失败草稿</textarea></div><p class="scope">必填与1000字限制；提交锁定关闭和重复请求；考试沿用原答卷ID、练题沿用原会话ID。</p>'),
AppLayout:o=>o.title==='使用帮助'?card('使用帮助','<p>快捷键、权限、成绩与复核、联系管理员。</p><p class="scope">手机正文内部滚动，底部关闭帮助。</p>'):card('当前权限内菜单搜索','<input placeholder="输入菜单名称或路径"><p class="scope">当前账号可访问菜单 · 23条匹配（示例）</p><button style="min-height:44px">完整菜单名称</button><p>无结果时显示0条匹配与空状态。</p>')});
Object.assign(window.DESIGN_ORG_PRIMARY,{PositionManagePage:'新增岗位',AppLayout:'搜索菜单'});
