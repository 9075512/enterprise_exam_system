// DATA: source-derived page manifest. GROUP: desktop/mobile. OFFSET: layout index.
let page=figma.root.children.find(p=>p.name===GROUP);
if(!page){page=track(figma.createPage());page.name=GROUP;}
await figma.setCurrentPageAsync(page);
const frames=[];
const tones=['blue','teal','violet','amber'];
function stats(parent,labels,values,w){const r=row(parent,'关键指标',w,116);gap(r,16);labels.forEach((label,i)=>{const n=use(r,'StatCard/'+tones[i%4],label,(w-16*(labels.length-1))/labels.length);const prop=Object.keys(n.componentProperties).find(k=>k.startsWith('Value#'));n.setProperties({[prop]:values[i]||'—'});});return r;}
function button(parent,label,primary=false,w){return use(parent,'Button/'+(primary?'primary':'secondary')+'/default',label,w||Math.max(84,label.length*14+28));}
function field(parent,label,w=240,value){const f=frame(parent,label,w,66,null);gap(f,8);text(f,label,'label','text-body',w);use(f,'Input/default',value||'请输入'+label,w);return f;}
function table(parent,columns,w,rows=5){const c=frame(parent,'数据表格',w,48*(rows+1)+52,null);const widths=columns.map((x,i)=>i===0?Math.min(240,w*.24):(w-Math.min(240,w*.24))/(columns.length-1));
 for(let j=0;j<=rows;j++){const r=row(c,j===0?'表头':'记录 '+j,w,48);gap(r,0);columns.forEach((col,i)=>{let v=j===0?col:sample(col,j);const cell=use(r,'TableCell/'+(j===0?'heading':'body'),v,widths[i]);const label=cell.findOne(n=>n.type==='TEXT');if(label){label.resize(Math.max(40,widths[i]-24),20);label.textAutoResize='HEIGHT';}if(j>0&&/状态|结果|是否及格/.test(col)){const label=cell.findOne(n=>n.type==='TEXT');if(label)fill(label,j===2?'warning':'success');}});}
 const foot=row(c,'分页',w,52);text(foot,`共 ${rows} 条记录`,'caption','text-secondary');const spacer=frame(foot,'弹性间距',Math.max(10,w-330),1,null);button(foot,'上一页');button(foot,'1',true,36);button(foot,'下一页');return c;}
function sample(col,j){if(/操作/.test(col))return '查看   编辑';if(/名称|标题|考试|试卷|题库/.test(col))return ['基础知识培训','岗位能力测评','业务规范考核'][j%3];if(/姓名|考生|操作者/.test(col))return ['张宁','李明','王琳'][j%3];if(/账号/.test(col))return 'user00'+j;if(/状态|结果|是否及格/.test(col))return j===2?'待处理':'已完成';if(/科室/.test(col))return j%2?'市场部':'研发部';if(/时间/.test(col))return '10-16 09:30';if(/分|数|率|时长|加时|排名/.test(col))return String([84,65,92,78,88][(j-1)%5]);if(/角色/.test(col))return '考生';if(/邮箱/.test(col))return 'user@example.com';if(/IP/.test(col))return '192.168.1.12';if(/客户端/.test(col))return 'Chrome / Windows';if(/题型/.test(col))return '单选题';if(/难度/.test(col))return '中等';if(/描述|摘要|说明|目标/.test(col))return '按计划完成';return '—';}
function barChart(parent,title,w,h=270){const p=panel(parent,title,w,h);const plot=frame(p,'图表（示例数据）',w-40,h-92,null,false);plot.counterAxisAlignItems='MAX';gap(plot,24);space(plot,16);[72,126,92,160,106,142].forEach((v,i)=>{const col=frame(plot,'分类 '+(i+1),(w-130)/6,h-124,null);col.primaryAxisAlignItems='MAX';gap(col,8);const bar=rounded(frame(col,'数据柱',Math.min(36,(w-130)/6),v,i===3?'primary':'primary-border'),4);text(col,['基础','业务','安全','规范','技能','综合'][i],'caption','text-secondary');});return p;}
function note(parent,title,body,w,color='primary'){const p=rounded(frame(parent,title,w,88,color+'-soft'));space(p,16);gap(p,4);text(p,title,'label',color);text(p,body,'caption','text-body',w-32);return p;}
function formPanel(parent,title,fields,w){const p=panel(parent,title,w,Math.max(168,68+Math.ceil(fields.length/2)*90));for(let i=0;i<fields.length;i+=2){const r=row(p,'表单分组',w-40,74);gap(r,24);fields.slice(i,i+2).forEach(label=>field(r,label,(w-64)/2,/时长|分钟/.test(label)?'60':/次数|阈值/.test(label)?'3':/名称/.test(label)?'考试系统':undefined));}return p;}
function question(parent,w,answered=false){const p=panel(parent,'01  ·  单选题',w,414);const tags=row(p,'题目信息',w-40,24);use(tags,'Badge/violet','单选题');text(tags,'本题 5 分 · 基础知识','caption','text-secondary');text(p,'开展业务操作前，以下哪一项是正确的准备步骤？','section','text-primary',w-40);['核对任务要求与操作规范','跳过准备，直接执行任务','完成后再补充核对记录','仅依赖上一次的经验'].forEach((v,i)=>use(p,'Option/'+(i===0&&answered?'correct':'default'),String.fromCharCode(65+i)+'   '+v,w-40));return p;}
function listCards(parent,title,w,count=3){const p=panel(parent,title,w,76+count*104);for(let i=0;i<count;i++){const r=rounded(border(frame(p,title+' '+i,w-40,88)));space(r,16);gap(r,4);const rr=row(r,'标题与状态',w-72,24);text(rr,['基础知识培训','岗位能力测评','业务规范考核'][i%3],'label');use(rr,'Badge/'+['primary','teal','amber'][i%3],['进行中','已完成','即将开始'][i%3]);text(r,'10 月 16 日 09:00 — 18:00 · 60 分钟 · 100 分','caption','text-secondary');}return p;}
const navGroups=[['工作台','数据总览'],['组织与账号','科室管理','用户管理'],['考试管理','考试管理','监考监控','人工阅卷','补考管理','成绩复核','成绩报表'],['题库与试卷','题库管理','试卷管理'],['配置与安全','公告与轮播','首页配置','练题端设置','系统设置','菜单权限','审计日志','登录日志','系统维护']];
function desktopShell(d,index){const root=frame(page,d.title+' · '+d.route,1440,960,'page',false);root.x=(index%3)*1520;root.y=Math.floor(index/3)*1600;root.clipsContent=false;
 const side=frame(root,'侧边导航',216,960,'sidebar');space(side,12);gap(side,4);const brand=row(side,'品牌',192,56);text(brand,'考  /  考试系统','section','surface');
 const groups=d.route.startsWith('/exam/')||d.route.startsWith('/score-detail')?[['考生工作台','首页','我的考试','我的成绩','我的补考','消息中心']]:navGroups;
 for(const group of groups){text(side,group[0],'caption','sidebar-text');for(const label of group.slice(1)){const n=use(side,'Navigation/'+(label===d.title?'active':'default'),label);n.name='导航/'+label;}}
 const main=frame(root,'主工作区',1224,960,'page');const header=row(main,'顶栏',1224,56);fill(header,'surface');space(header,24);text(header,'工作台  /  '+d.title,'table','text-body');const filler=frame(header,'留白',Math.max(30,620-d.title.length*13),1,null);use(header,'Input/default','搜索菜单  Ctrl K',220);text(header,'消息    帮助    管理员','caption','text-secondary');
 const content=frame(main,'页面内容',1224,880,null);space(content,24);gap(content,20);const head=row(content,'页面标题',1176,58);const titles=frame(head,'标题与说明',880,58,null);gap(titles,4);text(titles,d.title,'heading');text(titles,d.description&&!/header|bank\?|paper\?/.test(d.description)?d.description:'统一管理，清晰掌握每一步进展','caption','text-secondary',860);const action=d.buttons.find(x=>/新建|保存|导出|刷新|返回/.test(x));if(action)button(head,action,/新建|保存/.test(action));
 return {root,content,w:1176,side,main};}
function finish(root,content,main,side){const used=content.children.reduce((s,n)=>s+n.height,0)+content.itemSpacing*Math.max(0,content.children.length-1)+48;content.resize(content.width,used);const height=Math.max(960,used+56);main.resize(main.width,height);side.resize(side.width,height);root.resize(1440,height);frames.push({id:root.id,name:root.name,width:root.width,height:root.height,source:root.name});}
for(let idx=0;idx<DATA.length;idx++){
 const d=DATA[idx];const index=OFFSET+idx;
 if(d.app==='practice'){mobile(d,index);continue;}
 if(d.id==='Login'||d.id==='common-NoAccess'){landing(d,index);continue;}
 if(d.id==='exam-ExamTaking'){taking(d,index);continue;}
 const {root,content:c,w,side,main}=desktopShell(d,index);
 if(d.id==='admin-Dashboard'){
  const filter=row(c,'全局筛选',w,36);text(filter,'科室','label');use(filter,'Input/default','全部科室',180);text(filter,'考试开始时间','label');use(filter,'Input/default','开始日期  至  结束日期',260);button(filter,'查询',true);button(filter,'重置');
  stats(c,['科室数量','系统用户','题库 / 试题','试卷数量'],['2','7','2 / 10','1'],w);
  const r=row(c,'总览与待办',w,300);r.counterAxisAlignItems='MIN';gap(r,20);barChart(r,'参考人数对比',760,300);const todos=panel(r,'待办事项',396,300);['人工阅卷','切屏异常','成绩复核','补考申请'].forEach((label,i)=>{const rr=row(todos,label,356,42);use(rr,'Badge/'+['amber','error','violet','teal'][i],label,108);text(rr,String([0,3,0,0][i]),'section');});
  const recent=panel(c,'最近考试',w,318);table(recent,['考试名称','关联试卷','参与科室','时间窗','状态'],w-40,3);
  const r2=row(c,'分析数据',w,280);gap(r2,20);barChart(r2,'成绩趋势 · 及格率 / 平均分',578,280);barChart(r2,'科室通过率',578,280);
 }else if(d.id==='admin-Department'){
  const r=row(c,'组织结构与列表',w,580);r.counterAxisAlignItems='MIN';gap(r,20);const tree=panel(r,'组织结构',270,580);['全部科室','  市场部','  研发部'].forEach(x=>text(tree,x,'body'));const p=panel(r,'科室列表',886,580);table(p,d.columns,846,5);
 }else if(d.id==='author-QuestionBankList'){
  stats(c,['题库总数','累计题目','开放练习','待完善题库'],['2','10','2','0'],w);const rr=row(c,'搜索与筛选',w);use(rr,'Input/default','搜索题库名称',300);button(rr,'查询',true);button(rr,'重置');
  const cards=row(c,'题库卡片',w,240);gap(cards,20);['基础知识题库','岗位技能题库'].forEach((title,i)=>{const p=panel(cards,title,578,240);use(p,'Badge/'+(i?'teal':'violet'),i?'岗位技能':'基础知识');text(p,'5 道试题 · 单选 / 多选 / 判断','body','text-body');text(p,'持续沉淀专业知识，支持按科目和知识点筛选。','caption','text-secondary');const a=row(p,'题库操作',538);button(a,'查看题目',true);button(a,'组卷');});
  note(c,'题库健康度','检查知识点覆盖、题型比例和低正确率题目，持续完善题目质量。',w);
 }else if(d.id==='author-PaperComposer'){
  formPanel(c,'基本信息',d.fields,w);const r=row(c,'组卷方式',w);use(r,'Badge/primary','随机组卷');use(r,'Badge/neutral','手动选题');
  const p=panel(c,'题型与分值',w,366);table(p,['题型','抽题数量','每题分值','合计分值'],w-40,4);note(c,'试卷预览','题目数、总分与难度目标随组卷方案实时更新。',w);button(c,'生成试卷草稿',true);
 }else if(d.id==='admin-Settings'){
  const tab=d.tabDetails?.[0];const rr=row(c,'设置分类',w,36);d.tabs.forEach((x,i)=>button(rr,x,i===0,Math.max(100,x.length*13+24)));formPanel(c,tab?.title||'通知与模板',tab?.fields.filter(x=>x.trim())||d.fields.slice(0,10),w);note(c,'保存与生效','修改后点击「保存设置」，系统校验通过后统一生效。',w);
 }else if(d.variantFields){formPanel(c,d.variantTitle,d.variantFields,w);button(c,'保存设置',true);
 }else if(d.id==='admin-Review'){
  const filter=row(c,'阅卷筛选',w);use(filter,'Input/default','选择考试',280);use(filter,'Input/default','待阅卷',180);const r=row(c,'阅卷工作区',w,520);gap(r,20);r.counterAxisAlignItems='MIN';const queue=panel(r,'待阅考生',260,520);['张宁 · 待阅卷','李明 · 待阅卷','王琳 · 已完成'].forEach(x=>text(queue,x));const p=panel(r,'考生作答',896,520);use(p,'Badge/violet','简答题');text(p,'请简述规范操作的主要步骤。','section');note(p,'考生答案','准备与核对 → 执行操作 → 复核结果 → 记录与归档',856);field(p,'本题评分',240,'0 — 10 分');field(p,'评语',856,'请输入评分说明');button(p,'提交阅卷',true);
 }else if(d.id==='admin-HomeConfig'){
  const filter=row(c,'配置范围',w);use(filter,'Input/default','全局默认',280);note(c,'继承规则','未单独配置的科室继承全局默认设置。',w);formPanel(c,'首页展示',['快捷入口','推荐题库'],w);const p=panel(c,'科室配置',w,366);table(p,d.columns,w-40,4);
 }else if(d.id==='admin-PracticeSettings'){
  formPanel(c,'练题功能',['开放练题','每日一练','错题本','收藏夹','每次练习题量','允许查看解析'],w);const p=panel(c,'题库开放范围',w,366);table(p,d.columns,w-40,4);
 }else if(d.id==='admin-SystemMaintenance'){
  stats(c,['考试记录','作答明细','历史归档','审计记录'],['128','1,280','96','268'],w);formPanel(c,'自动归档设置',d.fields,w);const p=panel(c,'数据体量统计',w,318);table(p,d.columns,w-40,3);note(c,'手动归档','执行前展示预计归档范围；确认后操作进入处理状态。',w,'warning');
 }else if(d.id==='admin-MenuPermission'){
  note(c,'权限说明','管理员必授菜单不可关闭；修改后角色仅可访问被授权的页面。',w);const p=panel(c,'角色与菜单权限',w,510);table(p,['分组','菜单名称','管理员','出题人','考生'],w-40,7);
 }else if(d.id==='exam-ExamHome'){
  stats(c,['可参加考试','进行中','已完成','平均成绩'],['2','1','6','84'],w);note(c,'今天也向前一步','按计划完成考试，及时查看成绩与复核通知。',w);listCards(c,'即将开始',w,2);const r=row(c,'成绩与快捷入口',w,280);gap(r,20);barChart(r,'成绩趋势',760,280);const p=panel(r,'快捷入口',396,280);['我的考试','我的成绩','我的补考','在线练题'].forEach(x=>button(p,x));
 }else if(d.id==='exam-MyExam'){
  const r=row(c,'考试筛选',w);['全部','进行中','未开始','已结束'].forEach((x,i)=>button(r,x,i===0));listCards(c,'可参加的考试',w,3);note(c,'考试须知','进入前检查网络与设备。考试期间保持页面开启，交卷前检查漏答题目。',w);
 }else if(d.id==='author-PaperPreview'||d.id==='exam-ScoreDetail'){
  stats(c,d.id==='exam-ScoreDetail'?['最终得分','正确题数','作答时长','结果']:['题目数量','试卷总分','单选题','简答题'],d.id==='exam-ScoreDetail'?['84','16 / 20','32 分钟','及格']:['20','100','16','4'],w);question(c,w,d.id==='exam-ScoreDetail');note(c,'知识点掌握','结合逐题解析定位薄弱点，继续巩固练习。',w);
 }else if(d.id==='common-NotificationCenter'){
  stats(c,['全部消息','未读消息','考试通知','成绩通知'],['12','3','6','4'],w);const r=row(c,'消息筛选',w);['全部','未读','考试','成绩','补考'].forEach((x,i)=>button(r,x,i===0));listCards(c,'最新通知',w,4);
 }else{
  if(d.id==='admin-ExamMonitor')stats(c,['参加人数','正在作答','已交卷','异常提醒'],['32','18','14','3'],w);
  if(d.id==='admin-ScoreReport'||d.id==='exam-MyScore')stats(c,['考试人数','平均分','及格率','最高分'],['32','84','87.5%','98'],w);
  const p=panel(c,d.id==='admin-ContentView'?'公告管理':d.title+'列表',w,Math.max(420,468));
  const filter=row(p,'筛选工具栏',w-40);use(filter,'Input/default','搜索'+(d.columns[0]||d.title),260);use(filter,'Input/default','全部状态',180);button(filter,'查询',true);button(filter,'重置');
  table(p,d.columns.length?d.columns:['名称','类型','状态','更新时间','操作'],w-40,5);
  if(d.id==='admin-ScoreReport'){const r=row(c,'统计分析',w,280);gap(r,20);barChart(r,'分数段分布',578,280);barChart(r,'科室对比',578,280);}
 }
 finish(root,c,main,side);
}
function landing(d,index){const root=frame(page,d.title+' · '+d.route,1440,900,'page',false);root.x=(index%3)*1520;root.y=Math.floor(index/3)*1600;const brand=frame(root,'品牌区',640,900,'sidebar');space(brand,32);gap(brand,32);text(brand,'考  /  考试系统','section','surface');const intro=frame(brand,'品牌文案',576,580,null);space(intro,32);gap(intro,24);text(intro,'专业学习\n有据可循','display','surface',500);text(intro,'统一考试 · 在线练习 · 成绩追踪','body','sidebar-text');['blue','teal','violet','amber'].forEach(x=>{const r=rounded(frame(intro,x,300,6,'category-'+x),6);});const form=frame(root,'账号登录',800,900,'surface');space(form,32);gap(form,24);const box=frame(form,'登录内容',400,560,null);absolute(box,200,170);gap(box,24);text(box,d.id==='Login'?'欢迎回来':'暂无页面权限','display');text(box,d.id==='Login'?'使用账号登录，继续学习与管理工作':'当前账号尚未分配可访问的菜单，请联系管理员。','body','text-secondary',400);if(d.id==='Login'){field(box,'账号 / 工号',400);field(box,'登录密码',400,'请输入密码');button(box,'登录',true,400);text(box,'账号安全验证 · 支持两步验证','caption','text-secondary');}else button(box,'退出并切换账号',true,400);frames.push({id:root.id,name:root.name,width:1440,height:900,source:d.source});}
function taking(d,index){const root=frame(page,'在线答题 · '+d.route,1440,960,'page');root.x=(index%3)*1520;root.y=Math.floor(index/3)*1600;const top=row(root,'考试顶栏',1440,64);fill(top,'surface');space(top,24);text(top,'基础知识培训考试','section');text(top,'剩余时间  42:36','section','primary');button(top,'暂存退出');button(top,'交卷',true);const body=row(root,'答题工作区',1392,830);space(body,24);gap(body,24);body.counterAxisAlignItems='MIN';question(body,1030);const sheet=panel(body,'答题卡',290,540);text(sheet,'已答 4 / 20 题','body');for(let j=0;j<4;j++){const r=row(sheet,'题号',250,36);for(let i=0;i<5;i++)button(r,String(j*5+i+1),j===0,40);}note(sheet,'交卷提醒','请检查漏答题目后提交。',250,'warning');frames.push({id:root.id,name:root.name,width:1440,height:960,source:d.source});}
function mobile(d,index){const root=rounded(frame(page,d.title+' · '+d.route,390,844,'page'),12);root.x=(index%5)*450;root.y=Math.floor(index/5)*1240;space(root,20);gap(root,20);text(root,'9:41                                      ▰','caption');const head=row(root,'移动端顶栏',350,40);text(head,d.title,'heading');const c=frame(root,'页面内容',350,640,null);gap(c,16);
 if(d.id.includes('Login')){text(c,'随时练习\n持续进步','display','text-primary',350);text(c,'使用考试系统账号登录','body','text-secondary');field(c,'账号',350);field(c,'密码',350,'请输入密码');button(c,'登录',true,350);}
 else if(d.id.includes('Session')){const r=row(c,'练习进度',350,24);use(r,'Badge/violet','单选题');text(r,'1 / 10','label','text-secondary');text(c,'开展业务操作前，以下哪一项是正确的准备步骤？','section','text-primary',350);['核对任务要求与操作规范','跳过准备，直接执行任务','完成后再补充核对记录','仅依赖上一次的经验'].forEach((x,i)=>use(c,'Option/'+(d.id.includes('reans')&&i===0?'correct':'default'),String.fromCharCode(65+i)+'   '+x,350));if(d.id.includes('reans'))note(c,'答案解析','规范操作应先核对任务要求，再开展操作。',350);button(c,'提交答案',true,350);}
 else if(d.id.includes('Home')){note(c,'今日练习','保持学习节奏，每天积累一点。',350);const r=row(c,'练习指标',350,116);gap(r,12);['已练题数','正确率'].forEach((x,i)=>{const n=use(r,'StatCard/'+tones[i],x,169);const p=Object.keys(n.componentProperties).find(k=>k.startsWith('Value#'));n.setProperties({[p]:i?'86%':'128'});});const quick=row(c,'快捷入口',350,40);button(quick,'错题本',false,108);button(quick,'收藏夹',false,108);button(quick,'学习报告',false,118);listCards(c,'可练习题库',350,2);}
 else if(d.id.includes('Report')){note(c,'学习概况','累计练习 128 题 · 正确率 86%',350,'category-teal');barChart(c,'近 7 天练习趋势',350,260);listCards(c,'科目掌握度',350,2);}
 else if(d.id.includes('Profile')){const p=panel(c,'学习者',350,144);text(p,'张宁 · 市场部','section');text(p,'继续保持你的学习习惯','caption','text-secondary');['学习报告','错题本','我的收藏','账号安全','退出登录'].forEach(x=>button(c,x,false,350));}
 else {const r=row(c,'题库筛选',350);use(r,'Input/default','全部题库',350);note(c,d.id.includes('Favorites')?'我的收藏':'错题复习',d.id.includes('Favorites')?'把有价值的题目留在这里，随时回顾。':'把错误变成进步，按知识点逐步巩固。',350,d.id.includes('Favorites')?'category-violet':'warning');for(let i=0;i<3;i++){const p=panel(c,'单选题 · 基础知识',350,120);text(p,'开展业务操作前，应优先完成哪一步？','body','text-body',310);}button(c,d.id.includes('Favorites')?'练收藏题':'全部复习',true,350);}
 const used=c.children.reduce((s,n)=>s+n.height,0)+c.itemSpacing*Math.max(0,c.children.length-1);c.resize(350,used);const tabs=row(root,'底部导航',350,64);fill(tabs,'surface');['首页','错题','报告','我的'].forEach(x=>button(tabs,x,x===d.title,80));root.resize(390,Math.max(844,used+236));frames.push({id:root.id,name:root.name,width:390,height:root.height,source:d.source});}
return {pageId:page.id,createdNodeIds:ids,frames};
