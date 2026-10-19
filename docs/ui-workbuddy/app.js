const $ = (s, root = document) => root.querySelector(s);
const $$ = (s, root = document) => [...root.querySelectorAll(s)];
const escapeHtml = (value) => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const icons = {
  dashboard:'<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  folder:'<path d="M3 7V5a1 1 0 0 1 1-1h5l2 3h9a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1Z"/><path d="M3 9h18"/>',
  book:'<rect x="5" y="3" width="15" height="18" rx="2"/><path d="M9 3v18M12 7h5M12 11h5M3 7v12"/>',
  calendar:'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4M17 3v4M3 10h18M7 14h3M14 14h3M7 17h3"/>',
  review:'<path d="M13 3H5a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-8M8 7h5M8 11h3M15 4l3-2 4 4-7 7-4 1 1-4Z"/>',
  chart:'<path d="M3 3v18h18M7 16v-5M12 16V7M17 16v-8"/>',
  users:'<circle cx="9" cy="7" r="4"/><path d="M2 21v-3a7 7 0 0 1 14 0v3M17 4a4 4 0 0 1 0 8M19 15a6 6 0 0 1 3 6"/>',
  lock:'<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V6a4 4 0 0 1 8 0v4M12 14v3"/>',
  phone:'<rect x="6" y="2" width="12" height="20" rx="3"/><path d="M10 5h4M11 19h2"/>',
  design:'<path d="M3 3h7v7H3ZM14 3h7v7h-7ZM3 14h7v7H3ZM14 14h7v7h-7Z"/>',
  bell:'<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/>',
  plus:'<path d="M12 5v14M5 12h14"/>',
  refresh:'<path d="M20 10a8 8 0 1 0-1 8M20 4v6h-6"/>',
  search:'<circle cx="10" cy="10" r="6"/><path d="m15 15 6 6"/>',
  upload:'<path d="M12 16V3M7 8l5-5 5 5M4 15v5h16v-5"/>',
  download:'<path d="M12 3v13M7 11l5 5 5-5M4 17v4h16v-4"/>',
  clock:'<circle cx="12" cy="12" r="9"/><path d="M12 6v6l4 2"/>',
  check:'<path d="m5 12 4 4L19 6"/>',
  star:'<path d="m12 3 3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1Z"/>',
};
const ico = n => `<svg class="ico" viewBox="0 0 24 24" aria-hidden="true">${icons[n] || icons.book}</svg>`;
const btn = (text, action, style = '', icon = '') => `<button class="btn ${style}" data-action="${action}">${icon ? ico(icon) : ''}${text}</button>`;
const tag = (text, tone = '', dot = false) => `<span class="tag ${tone}">${dot ? '<i class="dot"></i>' : ''}${text}</span>`;
const pagination = (count, size = 20) => `<div class="pagination"><span>共 ${count} 条</span><span class="code">${size} 条 / 页</span><button aria-label="上一页" disabled>‹</button><span class="page-number">1</span><button aria-label="下一页" disabled>›</button></div>`;
const intro = (title, description, actions = '') => `<div class="intro"><div><h2>${title}</h2><p>${description}</p></div><div class="actions">${actions}</div></div>`;
const table = (headers, rows, cls = '') => `<div class="table-wrap"><table class="table ${cls}"><thead><tr>${headers.map(h=>`<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table></div>`;
const stat = (label, value, unit, note, icon = 'chart', extra = '') => `<div class="card stat ${extra}"><div class="stat-label">${label}</div><span class="stat-icon">${ico(icon)}</span><div class="stat-value">${value}<span>${unit}</span></div><div class="stat-note">${note}</div></div>`;
const exams = [
  ['2026 年度安全知识考核','安全知识 · 全员必修','进行中','success','研发部、市场部','10.18 09:00 — 10.18 21:00','60 分钟','王老师','ex-01'],
  ['新员工入职培训考试','企业文化 · 入职考核','未开始','','研发部','10.20 09:00 — 10.21 18:00','45 分钟','李老师','ex-02'],
  ['第三季度专业能力测评','岗位能力 · 阶段测评','已结束','neutral','研发部、市场部','10.12 09:00 — 10.12 18:00','90 分钟','王老师','ex-03'],
  ['信息安全专项考核','安全知识 · 专项考核','已结束','neutral','研发部','10.08 09:00 — 10.08 18:00','60 分钟','李老师','ex-04'],
];
const questions = [
  ['Q001','单选','简单','发现火灾时，应首先采取的措施是（ ）。','消防安全','A',2],
  ['Q002','多选','中等','下列属于安全生产管理基本原则的有（ ）。','安全生产','ABC',4],
  ['Q003','判断','简单','任何单位和个人都有维护消防安全的义务。','消防安全','正确',2],
  ['Q004','填空','中等','发生火灾时，应拨打火警电话 ____。','应急处置','119',4],
  ['Q005','简答','中等','请简述发现安全隐患后的报告及处置流程。','应急处置','按评分细则',10],
  ['Q006','单选','简单','以下哪一项属于正确的用电安全行为（ ）。','用电安全','C',2],
];
const cultureQuestions = [
  ['C001','单选','简单','企业文化培训的主要目的是（ ）。','文化认同','A',2],
  ['C002','多选','中等','团队协作中应遵循的原则包括（ ）。','团队协作','ABC',4],
  ['C003','判断','简单','工作沟通应及时、准确，并尊重事实。','职业素养','正确',2],
  ['C004','简答','中等','请结合岗位说明如何落实团队协作要求。','团队协作','按评分细则',10],
];
const currentQuestions = () => state.bank === '企业文化' ? cultureQuestions : questions;
const appeals = [
 ['AP2026101801','张三','zhangsan','研发部','第三季度专业能力测评','第 5 题 · 简答题得分有异议','10.18 10:36','待处理','warning',58],
 ['AP2026101802','李四','lisi','市场部','第三季度专业能力测评','第 8 题 · 评分细则核对','10.18 11:05','待处理','warning',76],
 ['AP2026101803','王五','wangwu','研发部','信息安全专项考核','第 5 题 · 简答题漏评','10.18 13:12','待处理','warning',64],
 ['AP2026101701','赵六','zhaoliu','市场部','信息安全专项考核','第 3 题 · 答案核查','10.17 15:28','已通过','success',82],
 ['AP2026101601','陈七','chenqi','研发部','第三季度专业能力测评','第 2 题 · 评分结果核查','10.16 09:18','已驳回','neutral',70],
];
const userRows = [
 ['张三','zhangsan','研发部','考生','技术专员','启用'],['李四','lisi','市场部','考生','市场专员','启用'],['王五','wangwu','研发部','考生','技术专员','启用'],['王老师','author','研发部','出题人','培训讲师','启用'],['系统管理员','admin','—','管理员','—','启用'],['陈七','chenqi','研发部','考生','技术专员','停用'],
];
let state = {page:'dashboard', bank:'安全知识', examStatus:'全部考试', appealStatus:'待处理', userTab:'users', practiceTab:'home', practiceAnswer:'', practiceSubmitted:false, selected:new Set()};
let drawerOrigin = null;
const titles = {
 dashboard:['数据总览','工作台 / 运营概览'],subjects:['科目管理','教学资源 / 科目管理'],banks:['题库管理','教学资源 / 科目题库'],exams:['考试管理','考试运营 / 考试与组题'],appeals:['成绩复核','考试运营 / 复核申请'],scores:['成绩报表','考试运营 / 成绩分析'],users:['用户管理','组织与系统 / 用户与角色'],login:['登录页设计','方案展示 / 管理端入口'],practice:['移动端延展','方案展示 / 考生练题端'],guide:['设计说明与落地清单','方案展示 / 参考分析与实施范围'],
};

function dashboard() {
 return intro('考试与教学，一目了然','全局资源概览与近期考务待办；以下均为设计示例',btn('刷新预览','refresh','','refresh')) +
 `<div class="stats">${stat('科室数量','8','个','组织结构与人员管理','folder')}${stat('用户数量','268','人','已创建的系统账号','users')}${stat('题库 / 题目','12 / 864','','有效叶子题库与题目总量','book')}${stat('考试数量','24','场','含未开始、进行中与已结束','calendar')}</div>
 <div class="split"><section class="card card-pad"><div class="card-title"><div><h3>考试及格率趋势</h3><p>最近 5 场考试 · 按考试展示，不作为日趋势</p></div><span class="tag neutral">示例数据</span></div>
 <div class="legend"><span><i></i>及格率</span><span>统计范围：已出分答卷</span></div>
 <svg class="chart" viewBox="0 0 620 205" role="img" aria-label="最近五场考试及格率示例分别为 78%、86%、82%、92%、88%"><defs><linearGradient id="chart-fill" x1="0" x2="0" y1="0" y2="1"><stop stop-color="#2563eb" stop-opacity=".13"/><stop offset="1" stop-color="#2563eb" stop-opacity="0"/></linearGradient></defs><path class="gridline" d="M35 30H600M35 75H600M35 120H600M35 165H600"/><text x="0" y="34">100%</text><text x="7" y="79">80%</text><text x="7" y="124">60%</text><text x="7" y="169">40%</text><path d="M55 80 185 61 315 70 445 48 575 57V165H55Z" fill="url(#chart-fill)"/><path d="M55 80 185 61 315 70 445 48 575 57" fill="none" stroke="#2563eb" stroke-width="2.5" stroke-linejoin="round"/>${[[55,80,78],[185,61,86],[315,70,82],[445,48,92],[575,57,88]].map(([x,y,v])=>`<circle cx="${x}" cy="${y}" r="4" fill="#fff" stroke="#2563eb" stroke-width="2"/><text x="${x}" y="${y-13}" text-anchor="middle">${v}%</text>`).join('')}<text x="55" y="192" text-anchor="middle">入职培训</text><text x="185" y="192" text-anchor="middle">合规知识</text><text x="315" y="192" text-anchor="middle">信息安全</text><text x="445" y="192" text-anchor="middle">专业测评</text><text x="575" y="192" text-anchor="middle">安全考核</text></svg></section>
 <section class="card card-pad"><div class="card-title"><div><h3>考务待办</h3><p>按任务进入对应处理队列</p></div>${tag('待处理','warning')}</div>
 ${[['review','amber','人工阅卷','含简答题的待评答卷',12,'reviews'],['review','purple','成绩复核','等待处理的复核申请',3,'appeals'],['clock','','补考审批','等待审批的补考申请',2,'retakes']].map(([icon,tone,title,desc,n,action])=>`<button class="todo" style="width:100%;text-align:left" data-action="${action}"><span class="tone-icon ${tone}">${ico(icon)}</span><div><b>${title}</b><small>${desc}</small></div><strong>${n}</strong><span class="arrow">›</span></button>`).join('')}</section></div>
 <section class="card"><div class="card-title" style="padding:21px 23px 0"><div><h3>最近考试</h3><p>从考试进入监考、成绩与后续考务</p></div><button class="text-link" data-page="exams">全部考试 →</button></div>${examTable(exams.slice(0,3),true)}</section>`;
}
function tree() {
 return `<aside class="tree" aria-label="科目目录"><h3>科目目录 <span class="muted"> / 4</span></h3><input id="tree-search" placeholder="搜索科目" aria-label="搜索科目"><button data-bank="全部科目">${ico('folder')}全部科目<span>2 目录</span></button><button class="leaf ${state.bank==='安全知识'?'active':''}" data-bank="安全知识">${ico('book')}安全知识<span>${questions.length}</span></button><button class="leaf ${state.bank==='企业文化'?'active':''}" data-bank="企业文化">${ico('book')}企业文化<span>${cultureQuestions.length}</span></button><button data-bank="岗位培训">${ico('folder')}岗位培训<span>目录</span></button><div class="tree-note">目录科目用于组织层级。<br>仅叶子科目维护试题。<br><br>科目与题库名称保持一致。</div></aside>`;
}
function subjects() {
 const directory = ['全部科目','岗位培训'].includes(state.bank);
 return intro('清晰的科目结构，有序的题库资源','维护层级、开放范围和继承权限',btn('新增根科目','new-subject','primary','plus'))+
 `<div class="card workspace-card">${tree()}<section class="workspace-detail"><div class="card-title"><div><div class="small muted">科目 / ${directory?'目录':'通识培训'} / ${escapeHtml(state.bank)}</div><h2 style="margin:9px 0">${escapeHtml(state.bank)} ${tag(directory?'目录科目':'叶子科目','neutral')} ${tag('启用','success',true)}</h2><p>科目结构与访问权限在此统一维护</p></div><div class="actions">${!directory?btn('查看题目','go-banks','','book'):''}${btn('编辑科目','edit-subject','primary')}</div></div>
 <div class="mini-metrics"><div><span>直属下级</span><b>${directory?2:0}</b></div><div><span>题目数量</span><b>${directory?'—':currentQuestions().length}</b></div><div><span>练题开放</span><b class="textual">${directory?'由叶子科目设置':'已开放'}</b></div><div><span>排序值</span><b>10</b></div></div>
 <div class="inset-card"><h3>基本信息</h3><dl class="detail-list"><dt>上级科目</dt><dd>${directory?'根级':'通识培训'}</dd><dt>科目名称</dt><dd>${escapeHtml(state.bank)}</dd><dt>科目描述</dt><dd>${directory?'按岗位组织培训科目与题库资源':'面向企业员工的基础知识培训与考核'}</dd><dt>更新时间</dt><dd>2026-10-18 09:30</dd></dl></div>
 <div class="inset-card"><div class="card-title"><h3>有效权限</h3>${tag('继承上级')}</div><dl class="detail-list"><dt>权限来源</dt><dd>通识培训 / 上级科目</dd><dt>可浏览范围</dt><dd>${tag('研发部','neutral')} ${tag('市场部','neutral')}</dd><dt>编辑人员</dt><dd>${tag('王老师','purple')} ${tag('李老师','purple')}</dd></dl><p class="small muted" style="margin-top:17px">显示最终生效范围，并说明权限来自哪个节点。</p></div></section></div>`;
}
function questionRows(list) {
 return list.map(q=>`<tr><td><input class="table-checkbox question-check" type="checkbox" aria-label="选择 ${q[0]}" value="${q[0]}" ${state.selected.has(q[0])?'checked':''}></td><td><div class="question-meta">${tag(q[1],q[1]==='多选'?'purple':q[1]==='填空'?'success':q[1]==='判断'?'warning':'')}${tag(q[2],'neutral')}<span>${q[0]}</span></div><div class="question-title">${q[2] && escapeHtml(q[3])}</div><small>${q[4]}</small></td><td>${q[5]}</td><td class="num">${q[6]}</td><td class="operations"><button data-action="edit-question" data-id="${q[0]}">编辑</button><button data-action="question-preview" data-id="${q[0]}">预览</button></td></tr>`);
}
function banks() {
 const directory = ['全部科目','岗位培训'].includes(state.bank);
 return intro('题目维护，回归内容本身','先选科目，再管理试题；与现有程序的组织方式一致',btn('前往科目管理','go-subjects','','folder'))+
 `<div class="card workspace-card">${tree()}<section class="workspace-detail"><div class="card-title"><div><p>通识培训 / ${escapeHtml(state.bank)}</p><h2 style="margin-top:6px">${escapeHtml(state.bank)} <span class="small muted">${directory?'目录科目':`· ${currentQuestions().length} 道题`}</span></h2></div><div class="actions">${!directory?btn('批量导入','import','','upload')+btn('新增题目','new-question','primary','plus'):''}</div></div>
 ${directory?`<div class="notice">目录科目仅组织层级。请选择左侧叶子科目后维护试题。</div><div class="guide-grid">${['安全知识','企业文化'].map((n,i)=>`<button class="inset-card" data-bank="${n}" style="text-align:left">${ico('book')}<h3 style="margin-top:12px">${n}</h3><span class="muted small">${i?4:6} 道题 · 点击查看 →</span></button>`).join('')}</div>`:
 `<div class="notice">练题已开放 · 浏览范围：研发部、市场部 · 编辑人员：王老师、李老师</div><div class="filterbar" style="padding:0 0 16px;border:0"><input class="search" id="question-search" placeholder="搜索题干 / 题目编号" aria-label="搜索题目"><select id="question-type" aria-label="筛选题型"><option value="">全部题型</option>${['单选','多选','判断','填空','简答'].map(t=>`<option>${t}</option>`).join('')}</select><button class="text-link" data-action="reset-questions">重置</button></div><div class="batchbar" id="batchbar" ${state.selected.size?'':'hidden'}><span>已选择 <b id="selected-count">${state.selected.size}</b> 道题</span><button class="text-link" data-action="batch-edit">批量编辑</button><button class="text-link" data-action="clear-selection">取消选择</button></div><div id="questions-table">${table(['<input class="table-checkbox" type="checkbox" id="select-all" aria-label="全选当前结果">','题目','参考答案','分值','操作'],questionRows(questions))}</div><div id="question-pagination">${pagination(questions.length)}</div>`}</section></div>`;
}
function examTable(list, compact = false) {
 return table(['考试名称','考试状态','参与科室',...(compact?[]:['考试时间 / 时长']),'操作'], list.map(e=>`<tr><td><strong>${e[0]}</strong><small>${e[1]}</small></td><td>${tag(e[2],e[3],true)}</td><td>${e[4]}</td>${compact?'':`<td class="small">${e[5]}<small>${e[6]} · 出题人：${e[7]}</small></td>`}<td class="operations">${e[2]==='进行中'?'<button data-action="monitor">实时监考</button>':`<button data-action="exam-preview" data-id="${e[8]}">${e[2]==='未开始'?'编辑':'题目预览'}</button>`}<button data-page="scores">成绩</button><button data-action="exam-ops" data-id="${e[8]}">考务 ⋯</button></td></tr>`));
}
function examPage() {
 return intro('一次考试，串起完整考务流程','创建、组题、监考与结果处理，集中在同一工作空间',btn('创建考试','new-exam','primary','plus'))+
 `<div class="stats status-stats">${[['全部考试',4,'calendar'],['未开始',1,'clock'],['进行中',1,'chart'],['已结束',2,'check']].map(([name,n,icon])=>`<button class="card stat stat-button ${state.examStatus===name?'selected-stat':''}" data-exam-status="${name}"><span class="stat-label">${name}</span><span class="stat-icon">${ico(icon)}</span><div class="stat-value">${n}<span>场</span></div></button>`).join('')}</div>
 <div class="card"><div class="filterbar"><input class="search" id="exam-search" placeholder="搜索考试名称" aria-label="搜索考试"><span class="small muted">${state.examStatus==='全部考试'?'全部状态':state.examStatus}</span><button class="text-link" data-action="reset-exams">重置</button><span class="push small muted">按开始时间排序</span></div><div id="exam-table">${examTable(exams.filter(e=>state.examStatus==='全部考试'||e[2]===state.examStatus))}</div><div id="exam-pagination">${pagination(state.examStatus==='全部考试'?4:state.examStatus==='已结束'?2:1)}</div></div>
 <p class="small muted" style="margin-top:16px">考试设置 → 题目配置，两步完成创建。开考或已有作答后，题目与分值显示锁定原因。</p>`;
}
function appealTable(list) {
 return table(['申请人','考试 / 复核内容','原成绩','申请时间','处理状态','操作'],list.map(a=>`<tr><td><div class="avatar-name"><span class="avatar">${a[1].slice(0,1)}</span><div><strong>${a[1]}</strong><small>${a[3]} · ${a[2]}</small></div></div></td><td><strong>${a[4]}</strong><small>${a[5]}</small></td><td>${a[9]} <span class="tiny muted">分</span></td><td>${a[6]}</td><td>${tag(a[7],a[8],true)}</td><td class="operations"><button data-action="appeal-detail" data-id="${a[0]}">${a[7]==='待处理'?'查看并处理':'查看详情'} →</button></td></tr>`));
}
function appealPage() {
 const filtered = appeals.filter(a=>state.appealStatus==='全部申请'||a[7]===state.appealStatus);
 return intro('每一次复核，都有清晰依据','核对原答卷、评分与申请说明，并保留处理时间线',btn('刷新预览','refresh','','refresh'))+
 `<div class="card"><div class="tabs">${['待处理','已通过','已驳回','全部申请'].map(s=>`<button class="${state.appealStatus===s?'active':''}" data-appeal-status="${s}">${s} <span class="tiny">${s==='全部申请'?appeals.length:appeals.filter(a=>a[7]===s).length}</span></button>`).join('')}</div><div class="filterbar"><select id="appeal-exam" aria-label="按考试筛选复核"><option value="">全部考试</option><option>第三季度专业能力测评</option><option>信息安全专项考核</option></select><input class="search" id="appeal-search" placeholder="搜索姓名 / 账号" aria-label="搜索复核申请"><button class="text-link" data-action="reset-appeals">重置</button><span class="push small muted">按申请时间查看</span></div><div id="appeal-table">${appealTable(filtered)}</div><div id="appeal-pagination">${pagination(filtered.length)}</div></div>
 <div class="notice" style="margin-top:18px">从考试管理的「考务」进入时，保留当前考试筛选。处理面板统一呈现申请、原评分与审批记录。</div>`;
}
function scores() {
 return intro('把成绩，变成下一次教学的依据','成绩、科室对比、错题与切屏审查，保持统一统计范围',btn('导出成绩','export','primary','download'))+
 `<div class="card" style="margin-bottom:20px"><div class="filterbar" style="border:0"><span class="small muted">考试范围</span><select id="score-exam" aria-label="成绩报表考试范围"><option>第三季度专业能力测评</option><option>信息安全专项考核</option></select><span class="small muted">报表数值均为所选考试示例</span></div></div>
 <div class="stats">${stat('已出分答卷','48','份','该考试已完成评分的答卷','users')}${stat('平均成绩','82.6','分','已出分答卷总分 / 答卷数','chart')}${stat('及格率','87.5','%','及格 42 份 / 已出分 48 份','check')}${stat('切屏异常','2','份','达到已配置审查阈值的答卷','review')}</div>
 <div class="split"><section class="card card-pad"><div class="card-title"><div><h3>成绩分布</h3><p>按已出分答卷统计 · 示例满分 100 分</p></div>${tag('48 份答卷','neutral')}</div><div class="bar-chart">${[['0–59',6,35],['60–69',5,29],['70–79',8,47],['80–89',17,100],['90–100',12,71]].map(([l,n,h])=>`<div class="bar-col"><b>${n}</b><i style="height:${h}%"></i><span>${l} 分</span></div>`).join('')}</div></section><section class="card card-pad"><div class="card-title"><div><h3>科室及格率</h3><p>按当前考试参与科室对比</p></div></div><div class="chart-bars-horizontal">${[['研发部','90.0%',90],['市场部','83.3%',83.3]].map(([l,n,w])=>`<div class="hbar"><span>${l}</span><i><b style="width:${w}%"></b></i><span>${n}</span></div>`).join('')}</div><div class="notice" style="margin-top:25px;margin-bottom:0">人数较少的科室需结合样本量查看，保留原有科室下钻能力。</div></section></div>
 <section class="card"><div class="tabs">${['成绩列表','错题排行','切屏审查'].map((t,i)=>`<button class="${i===0?'active':''}" data-score-tab="${i}">${t}</button>`).join('')}</div><div id="score-tab-body">${scoreList()}</div></section>`;
}
function scoreList(){return table(['考生','科室','总分','成绩状态','切屏审查','操作'],[['张三','研发部',58,'未通过','danger','待核查'],['李四','市场部',76,'已通过','success','正常'],['王五','研发部',92,'已通过','success','正常']].map(([n,d,s,t,c,r])=>`<tr><td><strong>${n}</strong></td><td>${d}</td><td><strong>${s}</strong> <span class="tiny muted">分</span></td><td>${tag(t,c)}</td><td>${tag(r,r==='正常'?'neutral':'warning')}</td><td><button class="text-link" data-action="score-detail" data-name="${n}">查看答卷</button></td></tr>`))+pagination(3);}
function users(){
 const body = state.userTab==='users'?`<div class="card"><div class="filterbar"><input class="search" id="user-search" placeholder="搜索姓名 / 账号" aria-label="搜索用户"><select id="user-role" aria-label="筛选用户角色"><option value="">全部角色</option><option>管理员</option><option>出题人</option><option>考生</option></select><span class="push"></span>${btn('Excel 导入','user-import','','upload')}${btn('新增用户','new-user','primary','plus')}</div><div id="user-table">${usersTable(userRows)}</div><div id="user-pagination">${pagination(6)}</div></div>`:
 `<div class="notice">角色管理是独立页面。本处用切换方式展示其视觉延展；正式版本保留现有角色路由与菜单。</div><div class="role-grid">${[['管理员','完整的资源、考务和组织管理权限',1,'lock'],['出题人','维护获授权题库、分配考试的题目与阅卷',2,'book'],['考生','参加考试、在线练题并查看个人成绩',265,'users']].map(([n,d,c,i])=>`<section class="card role"><span class="tone-icon">${ico(i)}</span><h3>${n}</h3><p>${d}</p><div class="count"><span>${c} 位成员 · 内置身份</span><button class="text-link" data-action="role-detail" data-name="${n}">查看权限 →</button></div></section>`).join('')}</div>`;
 return intro('人员、角色与访问范围，清晰可管','每个账号选择一个角色；科室与岗位保持现有独立管理方式')+`<div class="seg" style="margin-bottom:20px"><button class="${state.userTab==='users'?'active':''}" data-user-tab="users">用户列表</button><button class="${state.userTab==='roles'?'active':''}" data-user-tab="roles">角色设计示例</button></div>`+body;
}
function usersTable(list){return table(['用户','科室','角色','岗位','状态','操作'],list.map(u=>`<tr><td><div class="avatar-name"><span class="avatar">${u[0][0]}</span><div><strong>${u[0]}</strong><small>${u[1]}</small></div></div></td><td>${u[2]}</td><td>${tag(u[3],u[3]==='管理员'?'purple':u[3]==='考生'?'neutral':'')}</td><td>${u[4]}</td><td>${tag(u[5],u[5]==='启用'?'success':'neutral',true)}</td><td><button class="text-link" data-action="edit-user" data-name="${u[0]}">编辑</button></td></tr>`));}
function login(){return intro('以清晰、可信的入口，开始一天工作','沿用参考站左右分屏，保留咱们的验证码和账号安全流程')+`<div class="login-preview"><div class="login-brand"><div class="brand"><span class="brand-mark">考</span><span><strong>企业考试</strong><small>EXAM MANAGEMENT</small></span></div><h2>让每一次考核<br>都有清晰的结果</h2><p>从题库管理到考试运营，从在线答题到成绩复核，<br>把教学与考务工作有序连接。</p><div class="login-points">01　科目题库与精细权限<br>02　考试、监考与人工阅卷<br>03　成绩分析与学习反馈</div><div class="login-bottom">企业内部在线考试系统 · 统一管理工作台</div></div><form class="login-form" id="login-form"><h2>登录管理后台</h2><p>使用工作账号进入考试管理系统</p><label class="field required"><span>账号</span><input autocomplete="off" placeholder="请输入账号" required aria-label="演示登录账号"></label><label class="field required"><span>密码</span><input type="password" autocomplete="off" placeholder="请输入密码" required aria-label="演示登录密码"></label><label class="field"><span>图形验证码</span><span class="captcha-line"><input placeholder="请输入验证码" aria-label="演示验证码"><span class="captcha-art" aria-hidden="true">A7C9</span></span><small>静态视觉示例，正式版本沿用实际验证码与二步验证流程。</small></label><button class="btn primary" type="submit">进入后台 →</button><span class="footnote">仅演示页面布局，不发送账号或密码</span></form></div>`;}
function practice(){
 return intro('同一套视觉语言，也适合每天练一点','这是配套移动端方向示意，底部导航沿用现有考生端结构',`<div class="seg"><button class="${state.practiceTab==='home'?'active':''}" data-practice-tab="home">练题首页</button><button class="${state.practiceTab==='answer'?'active':''}" data-practice-tab="answer">作答示例</button></div>`)+
 `<div class="practice-layout"><div class="phone"><div class="phone-status"><span>9:41</span><span>▮▮▮　Wi-Fi　▰</span></div><div class="phone-content">${state.practiceTab==='home'?`<div class="phone-head"><div><p>每天进步一点点</p><h2>你好，张三</h2></div><span class="avatar">张</span></div><div class="hero"><small>DAILY PRACTICE</small><h3>今天，也学有所得</h3><p>每日一练 · 示例 10 题 · 约 8 分钟</p><button data-practice-tab="answer">开始练习 →</button></div><div class="phone-shortcuts">${[['book','错题本'],['star','收藏夹'],['chart','学习报告'],['check','成就徽章']].map(([i,t])=>`<button data-action="mobile-feature" data-name="${t}"><span class="tone-icon">${ico(i)}</span>${t}</button>`).join('')}</div><div class="phone-section-title"><b>选择科目，开始练题</b><span class="tiny muted">按权限展示</span></div>${[['安全知识','6 道题 · 已练 4 道','book'],['企业文化','4 道题 · 已练 2 道','folder']].map(([n,d,i])=>`<button class="subject-card" style="width:100%;text-align:left" data-practice-tab="answer"><span class="tone-icon">${ico(i)}</span><div><b>${n}</b><small>${d}</small><div class="progress"><i></i></div></div><span class="arrow">›</span></button>`).join('')}<p class="tiny muted" style="margin-top:20px">以上为展示示例，实际科目与入口按权限、练题配置下发。</p>`:
 `<div class="phone-head"><button class="text-link" data-practice-tab="home">‹ 返回练题</button><span class="small muted">安全知识</span><button class="text-link" data-action="answer-card">答题卡</button></div><div class="phone-question"><div class="selection-row">${tag('单选题')}<span class="small muted">01 / 10</span></div><h3>发现火灾时，应首先采取的措施是（ ）。</h3>${[['A','立即报警，并确保自身安全'],['B','直接进入火场救援'],['C','继续工作，等待通知'],['D','乘坐电梯离开']].map(([v,t])=>`<button class="option ${state.practiceAnswer===v?'selected':''}" data-option="${v}" ${state.practiceSubmitted?'disabled':''}>${v}　${t}</button>`).join('')}<div class="analysis" ${state.practiceSubmitted?'':'hidden'}>${state.practiceAnswer==='A'?'回答正确':'本题参考答案为 A'}<br>解析：及时报警、保持安全距离，并按疏散指引撤离。</div></div>${btn(state.practiceSubmitted?'返回练题首页':'提交本题',state.practiceSubmitted?'practice-home':'submit-answer','primary')}<p class="tiny muted" style="margin-top:14px">解析仅作示例。正式版本尊重「作答后展示答案 / 解析」设置。</p>`}</div>${state.practiceTab==='home'?`<nav class="bottom-nav" aria-label="考生端底部导航">${[['dashboard','首页'],['calendar','考试'],['book','练题'],['chart','成绩'],['users','我的']].map(([i,t])=>`<button class="${t==='练题'?'active':''}" data-action="mobile-nav" data-name="${t}">${ico(i)}${t}</button>`).join('')}</nav>`:''}</div>
 <div class="practice-notes"><div class="eyebrow">MOBILE EXTENSION</div><h2 style="font-size:22px;margin-top:8px">轻一点的学习界面，<br>统一的品牌感受。</h2><div class="annotation"><b>把主任务放到第一屏</b><p>每日一练用一张蓝色卡片承接；科目列表和学习记录使用白色轻卡片，避免连续多块高饱和色。</p></div><div class="annotation"><b>保留现有端的导航与配置</b><p>考生端保持首页、考试、练题、成绩、我的五个入口。错题本、收藏、学习报告与徽章是否展示，仍由配置与权限决定。</p></div><div class="annotation"><b>答题保持专注</b><p>作答页隐藏通用底栏，题干字号 16 px，选项触控高度至少 44 px；提交后才根据配置展示答案与解析。</p></div><div class="notice">移动端是延展方向。优先实施管理端全局框架与核心工作流，再同步考生与独立练题端。</div></div></div>`;
}
const section = (n,title,body,id='')=>`<section class="card guide-section" ${id?`id="${id}"`:''}><div class="section-heading"><span>${n}</span><h3>${title}</h3></div>${body}</section>`;
function guide(){
 const mapping = [
 ['数据中心','数据总览','4 张资源卡 + 考试及格率趋势 + 考务待办 + 最近考试。保留科室、时间筛选与统计口径提示。','完整样例'],
 ['教学资源','科目管理、题库管理','保留同源科目树、叶子题库约束、继承 / 覆盖权限；科目管结构，题库管试题。','完整样例'],
 ['教学资源','模板管理、题目反馈、重复题审计','沿用筛选 + 表格 + 详情抽屉；反馈带题目上下文，重复题带并排比对。','后续按规范扩展'],
 ['考试运营','考试管理、实时监考','保留「考试设置 → 题目配置」两步组题；考试行操作连接成绩、监考和考务。监考沿用 SSE / 回退轮询。','考试完整样例 / 监考摘要'],
 ['考试运营','人工阅卷、补考管理、成绩复核','三张独立队列，统一考试范围筛选；复核详情包含原答卷、原评分、申请说明和处理记录。','复核完整样例 / 其余摘要'],
 ['考试运营','成绩报表','成绩列表 / 错题排行 / 切屏审查页签；分数分布与科室对比保留；导出承接现有 Excel / PDF。','完整样例'],
 ['考试运营','公告与轮播、首页配置','运营内容使用列表；编辑使用宽抽屉；保留双端发布、预约时间窗和科室个性化配置。','后续按规范扩展'],
 ['练题运营','练题端设置、练题监控','配置页分组卡片 + 吸底保存；监控为指标、筛选、会话明细表，保持现有统计定义。','后续按规范扩展'],
 ['学习中心','练题','保留现有学习中心 → 练题入口；科目树、每日一练、错题、收藏、报告、成就按配置展示。','移动端方向样例'],
 ['组织与系统','科室、用户、角色、岗位、菜单权限','用户用列表，科室用树，角色与岗位维持独立入口。菜单权限继续按角色授权，禁止把示例角色卡片当作新权限模型。','用户完整样例 / 角色视觉样例'],
 ['组织与系统','系统设置、审计日志、登录日志、系统维护','设置保持现有七类；日志用紧凑表格；维护页显式操作范围、执行状态和操作反馈。','后续按规范扩展'],
 ['考生中心','首页、我的考试、我的成绩、我的补考、消息中心','与管理端共享品牌色和控件规范。保留现有考生首页、权限入口及移动导航。','后续按规范扩展'],
 ];
 return `<section class="card guide-lead"><div><div class="eyebrow">UI PROPOSAL / DIRECTION 01</div><h2>练题云的清爽感，<br>咱们考试系统的完整度。</h2><p>根据实际登录参考站观察到的登录、看板、题库、题目管理、编辑抽屉和统计报表，提炼白色侧栏、浅灰蓝背景、蓝色操作与圆角卡片。结合本项目当前菜单、科目树、考试组题和复核流程，形成这一版可落地的设计方向。</p><p style="margin-top:12px">交付：10 个可切换样例页面、局部交互与下方落地规范。所有数字、账号和图表均为方案示例；本次只新增设计文件。</p></div><span class="guide-number">01</span></section>
 <nav class="guide-toc"><a href="#direction">参考与适配</a><a href="#tokens">视觉规范</a><a href="#coverage">功能覆盖</a><a href="#states">状态规范</a><a href="#delivery">实施顺序</a></nav>
 ${section('01','参考什么，如何适配',`<div class="guide-grid"><div class="principle"><h4>白色侧栏与蓝色选中态</h4><p>参考站侧栏实测 232 px，按钮主色为 #2563EB。本方案采用相同基础尺度；将现有深色侧栏改成白底，并用小标题保留业务分组。</p></div><div class="principle"><h4>柔和卡片与清晰表格</h4><p>保留参考站的浅灰蓝背景、大圆角和轻阴影。题库和考务使用紧凑表格，避免为了视觉留白隐藏关键操作。</p></div><div class="principle"><h4>适应更完整的业务</h4><p>参考站主要服务练题运营；咱们还需考试、阅卷、复核、科室与角色。保留现有菜单 key、路由与权限校验，仅调整展示与交互组织。</p></div></div><div class="notice" style="margin-top:17px;margin-bottom:0">信息架构建议：沿用「数据中心 / 教学资源 / 考试运营 / 练题运营 / 学习中心 / 组织与系统 / 考生中心」，按账号权限显示。正式侧栏可折叠分组，当前组默认展开。本原型仅导航重点样例，不代表删减其他菜单。</div><p style="margin-top:16px">参考来源：<a href="https://practice-quiz-admin.app.workbuddy.host/" target="_blank" rel="noreferrer">练题云管理后台 ↗</a>（2026-10-18 实际观察）。本方案不复用其品牌名称、业务数据或账号信息。</p>`,'direction')}
 ${section('02','视觉与组件规范',`<div class="swatches">${[['主色','#2563EB','按钮、链接、选中态'],['页面底色','#F4F6FB','整页背景'],['卡片与侧栏','#FFFFFF','内容承载'],['主要文字','#172338','标题与核心数据'],['次要文字','#66758A','说明与标签']].map(([n,c,d])=>`<div class="swatch"><i style="background:${c}"></i><b>${n} · ${c}</b><small>${d}</small></div>`).join('')}</div><div class="table-wrap" style="margin-top:22px">${table(['项目','建议规格','使用规则'],[
 '<tr><td>页面骨架</td><td>侧栏 232 px；顶栏 88–96 px；页边距 24–32 px</td><td>1366 / 1440 / 1920 桌面优先；低于 1200 时收紧间距，不压缩文字到难读。</td></tr>',
 '<tr><td>卡片与容器</td><td>圆角 16 px；间距 16–24 px；边框 #E7EBF2</td><td>卡片使用低强度阴影；表格与表单内部用边框分区。</td></tr>',
 '<tr><td>文字</td><td>标题 22–24 / 分区 16 / 正文 14 / 次要 12 px</td><td>正式实现优先现有 Noto Sans SC 字体；数字使用等宽数字特性；题干支持自然换行。</td></tr>',
 '<tr><td>按钮与输入</td><td>按钮 36 px；表单输入 36–40 px；圆角 8 px</td><td>每个任务区一个突出主操作。查询可用次级强调；不可用操作说明原因。</td></tr>',
 '<tr><td>列表密度</td><td>默认单行 48–56 px；紧凑 40 px；题干行 76–92 px</td><td>保留现有密度切换；主列左对齐，数值右对齐；操作列固定，低频操作进入更多。</td></tr>',
 '<tr><td>编辑与复杂流程</td><td>普通抽屉 480–560 px；复杂题目 720–840 px</td><td>编辑底部操作固定；考试两步创建使用独立页，保留页面返回与未保存提示。</td></tr>',
 '<tr><td>语义色</td><td>成功 #147855 / 警告 #A35B0E / 错误 #B83E42</td><td>颜色配合状态文案。题型允许蓝 / 紫 / 橙 / 绿辅助识别，避免整页多色装饰。</td></tr>',
 ].map(x=>x),'guide-table')}</div><p style="margin-top:14px">本原型缩小了部分辅助文字以展示整页布局；正式产品按上方字号实施，并复核可读性、键盘焦点及文本对比度。</p>`,'tokens')}
 ${section('03','功能覆盖与页面模板',table(['现有分组','功能范围','设计处理','本次交付深度'],mapping.map(r=>`<tr>${r.map(c=>`<td>${c}</td>`).join('')}</tr>`),'guide-table'),'coverage')}
 ${section('04','五种状态与交互约定',`<div class="guide-grid"><div class="state-preview"><div class="skeleton"></div><div class="skeleton short"></div><div class="skeleton"></div><b>加载中</b><span>保留版式，分区加载，避免整页反复闪白</span></div><div class="state-preview">${ico('search')}<b>没有匹配结果</b><span>区别「尚无数据」与「筛选无结果」</span><button class="text-link" data-action="state-reset">清空筛选</button></div><div class="state-preview">${ico('refresh')}<b>数据暂时加载失败</b><span>保留筛选条件，在当前区块重试</span><button class="text-link" data-action="state-retry">重新加载</button></div></div><p style="margin-top:16px">无权限：说明当前角色缺少相应权限，隐藏无权执行的操作。成功：轻提示并更新列表，保留搜索、分页与选中上下文。失败不可显示为 0 或空列表。</p><div class="notice amber" style="margin-top:15px;margin-bottom:0">高影响操作：删除、强制交卷、复核改分、权限调整需显示对象、影响范围与确认内容。复核通过和改分由现有业务规则约束，提交后保留审计与审批记录。</div><p style="margin-top:14px">原型可体验：题库关键字 / 题型筛选、多选、题目编辑与预览；考试状态筛选和创建流程预览；成绩复核的筛选、时间线与处理表单；成绩页签；用户角色筛选；移动练题作答。本地修改仅在当前页内存中模拟。</p>`,'states')}
 ${section('05','对齐现有代码的实施顺序',`<div class="steps"><div class="step"><b>PHASE 01 / 全局基础</b><h4>先统一框架和组件</h4><p>统一颜色变量、侧栏、顶栏、PageHeader、StatCard、表格、状态标签、抽屉与空态。登录和权限加载反馈同步调整。</p><small>验收：同一状态只有一套颜色；菜单按原权限过滤；1440 与 1366 无异常横向溢出。</small></div><div class="step"><b>PHASE 02 / 核心业务</b><h4>沿真实工作流逐页落地</h4><p>数据总览 → 科目与题库 → 考试创建 / 监考 → 阅卷、补考、复核 → 成绩报表。复用现有接口，保留冻结、锁定与审批规则。</p><small>验收：题库导入、组题、开考、交卷、阅卷、复核、导出链路完整；统计口径不被视觉稿改变。</small></div><div class="step"><b>PHASE 03 / 全面延展</b><h4>补齐运营、系统与考生端</h4><p>扩展内容、配置、日志、组织和权限页面；再同步考生首页、答题、独立练题端。小屏后台以导航抽屉和表格横向滚动承接。</p><small>验收：桌面 / 390 px 手机、键盘操作、加载 / 空 / 错误 / 权限 / 成功五态以及已有回归检查。</small></div></div><div class="inset-card"><h3>建议改动入口</h3><p class="small muted"><span class="code">src/styles/variables.scss</span>、<span class="code">src/styles/ui-tokens.scss</span>、<span class="code">src/styles/element/index.scss</span>、<span class="code">src/layouts/AppLayout.vue</span>、<span class="code">src/components/common/</span>，然后逐个迁移 <span class="code">src/views/</span>。颜色先统一来源，避免在现有覆盖层上继续追加相互冲突的规则。</p></div><p style="margin-top:16px">现有实现依据：menuConfig.ts、SubjectManagePage.vue、QuestionBankListPage.vue、ExamManagePage.vue、DashboardPage.vue 及项目 README。正式实施时，菜单 key、路由、科室隔离、出题人授权、后端鉴权和评分逻辑均沿用当前实现。</p>`,'delivery')}
 ${section('06','本轮建议确认的设计方向',`<p>以这版「白侧栏 + 浅灰蓝底 + 蓝色操作 + 16 px 圆角卡片」作为管理端主方向。先落地全局框架与科目题库、考试、复核四条核心工作流；其余页面按同一规范延展。统计必须显示真实数据范围，保留现有题型、权限、考务与安全能力。</p><div class="actions" style="margin-top:18px"><button class="btn primary" data-page="dashboard">看数据总览</button><button class="btn" data-page="banks">看科目题库</button><button class="btn" data-page="exams">看考试管理</button><button class="btn" data-page="appeals">看成绩复核</button></div>`)}
 `;
}

const pages = {dashboard, subjects, banks, exams:examPage, appeals:appealPage, scores, users, login, practice, guide};
function render(scroll = true){
 const previousFilters = !scroll ? Object.fromEntries($$('#main input[id],#main select[id]').filter(e=>e.type!=='checkbox').map(e=>[e.id,e.value])) : {};
 $('#page-title').textContent=titles[state.page][0]; $('#breadcrumb').textContent=titles[state.page][1];
 document.title=`${titles[state.page][0]} · 企业考试 UI 提案`;
 $('#main').innerHTML=pages[state.page]();
 const pendingCount = appeals.filter(a=>a[7]==='待处理').length;
 $('.nav-count').textContent=pendingCount;
 $$('[id]',$('#main')).forEach(e=>{if(Object.hasOwn(previousFilters,e.id)&&'value' in e)e.value=previousFilters[e.id];});
 if(state.page==='banks'&&$('#questions-table'))filterQuestions();
 if(state.page==='appeals')filterAppeals();
 if(state.page==='exams')filterExams();
 if(state.page==='users'&&state.userTab==='users')filterUsers();
 $$('.nav-item').forEach(b=>{b.classList.toggle('active',b.dataset.page===state.page); if(b.dataset.page===state.page)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');});
 $$('[data-icon]').forEach(e=>{if(!e.querySelector('svg'))e.insertAdjacentHTML('afterbegin',ico(e.dataset.icon));});
 if(scroll)window.scrollTo(0,0);
}
function navigate(page){if(!pages[page])return; closeDrawer(); state.page=page; history.replaceState(null,'',`#${page}`); render();}
function toast(message){$('#toast').textContent=message;$('#toast').hidden=false;clearTimeout(toast.timer);toast.timer=setTimeout(()=>$('#toast').hidden=true,4200);}
function openDrawer(title,body,footer,eyebrow='方案交互预览',wide=false){
 drawerOrigin=document.activeElement; $('#drawer-title').textContent=title;$('#drawer-eyebrow').textContent=eyebrow;$('#drawer-body').innerHTML=body;$('#drawer-footer').innerHTML=footer||btn('关闭','close');$('#drawer').style.width=wide?'760px':'';$('#overlay').hidden=false;$('#drawer').setAttribute('open','');$('#drawer').setAttribute('role','dialog');$('#drawer').setAttribute('aria-modal','true');document.body.style.overflow='hidden';$('.close-drawer').focus();
}
function closeDrawer(){if(!$('#drawer').open)return;$('#drawer').removeAttribute('open');$('#overlay').hidden=true;document.body.style.overflow='';drawerOrigin?.focus?.();}
const field=(label,input,required=false)=>`<label class="field ${required?'required':''}"><span>${label}</span>${input}</label>`;
function questionDrawer(id,preview=false){
 const q=[...questions,...cultureQuestions].find(x=>x[0]===id)||['','单选','简单','','','',2];
 if(preview){openDrawer('题目预览',`<div class="question-meta">${tag(q[1])}${tag(q[2],'neutral')}<span>${q[0]}</span></div><h3 style="font-size:17px;margin:20px 0">${escapeHtml(q[3])}</h3><div class="quote">参考答案：${escapeHtml(q[5])}<br>知识点：${q[4]}<br>分值：${q[6]} 分</div><div class="notice">预览用于核对内容；正式版本保留现有题干、选项、答案、解析及评分细则。</div>`,btn('关闭','close'));return;}
 openDrawer(q[0]?'编辑题目':'新增题目',`<form id="question-form" data-id="${q[0]}"><div class="notice">当前科目：${escapeHtml(state.bank)}。题目归属沿用当前叶子科目。</div><div class="field-row">${field('题型',`<select name="type">${['单选','多选','判断','填空','简答'].map(t=>`<option ${t===q[1]?'selected':''}>${t}</option>`).join('')}</select>`)}${field('难度',`<select name="difficulty">${['简单','中等','困难'].map(t=>`<option ${t===q[2]?'selected':''}>${t}</option>`).join('')}</select>`)}</div>${field('题干',`<textarea name="stem" required placeholder="请输入题干">${escapeHtml(q[3])}</textarea>`,true)}${field('知识点',`<input name="tag" value="${escapeHtml(q[4])}" placeholder="例如：消防安全">`)}<div class="field-row">${field('参考答案',`<input name="answer" required value="${escapeHtml(q[5])}" placeholder="填写答案或评分要点">`,true)}${field('分值',`<input type="number" name="score" min="1" max="100" value="${q[6]}" required>`,true)}</div><p class="small muted">原型演示字段与保存反馈；正式题型表单复用现有选项、逐空答案、富文本与 rubric。</p><div id="form-error" class="form-error"></div></form>`,btn('取消','close')+'<button class="btn primary" type="submit" form="question-form">保存到原型</button>','教学资源 / 科目题库');
}
function appealDrawer(id){
 const a=appeals.find(x=>x[0]===id);if(!a)return;
 const pending=a[7]==='待处理';
 openDrawer('复核申请详情',`<div class="selection-row"><span class="small muted">${a[0]}</span>${tag(a[7],a[8],true)}</div><h3 style="font-size:16px;margin:18px 0 4px">${a[4]}</h3><p class="small muted">${a[1]} · ${a[2]} · ${a[3]}</p><div class="review-summary" style="margin-top:20px"><div><small>原总分</small><b>${a[9]}</b> <span class="small muted">分</span></div><div><small>申请题目</small><b style="font-size:15px">${a[5].split(' · ')[0]}</b></div><div><small>当前状态</small><span class="small">${a[7]}</span></div></div><h3 style="font-size:13px">申请说明</h3><div class="quote">我的作答已包含评分要点中的相关内容，希望重新核对本题评分。</div><h3 style="font-size:13px">原答卷与评分依据</h3><div class="quote">题目：请简述安全隐患的报告与处置流程。<br>原作答：发现隐患后停止相关作业，报告负责人，设置警示，并组织整改和复查。<br>评分要点：报告、现场防护、整改、复查。<br><b>本题原得分：6 / 10 分</b><p class="tiny muted" style="margin-top:8px">以上答卷为统一展示样例。</p></div><button class="text-link" data-action="score-detail" data-name="${a[1]}">查看完整答卷 →</button><h3 style="font-size:13px;margin-top:24px">处理时间线</h3><div class="timeline"><div>考生提交申请<small>2026-${a[6]} · ${a[1]}</small></div><div>${pending?'等待管理员核对评分':a[7]}<small>${pending?'暂未处理':'2026-10-18 15:20 · 系统管理员'}</small></div></div>${pending?`<form id="appeal-form" data-id="${a[0]}">${field('处理结论','<select id="appeal-decision" name="decision"><option value="approve">通过复核</option><option value="reject">驳回复核</option></select>')}${field('复核后总分',`<input id="appeal-score" name="score" type="number" min="0" max="100" value="${a[9]}" required><small>示例满分 100 分。正式提交沿用现有服务端校验与改分规则。</small>`)}${field('处理说明','<textarea name="reason" required placeholder="说明核对依据及处理结果"></textarea>',true)}<p class="tiny muted">提交后会先展示影响范围确认；本原型只修改内存中的示例状态。</p></form>`:`<div class="notice">${a[10]||'已按评分细则完成核对。处理记录用于说明审批依据。'}</div>`}`,btn('关闭','close')+(pending?'<button class="btn primary" form="appeal-form" type="submit">核对并提交</button>':''),'考试运营 / 成绩复核');
}
function newExam(step=1){
 const saved = state.examDraft || {};
 openDrawer('创建考试',`<div class="stepper"><span class="${step===1?'active':''}"><b>1</b>考试设置</span><span class="${step===2?'active':''}"><b>2</b>题目配置</span></div>${step===1?`<form id="exam-form">${field('考试名称',`<input name="name" value="${escapeHtml(saved.name||'')}" required placeholder="例如：第四季度安全知识考核">`,true)}${field('参与科室','<select name="department"><option>研发部、市场部</option><option>研发部</option><option>市场部</option></select>')}<div class="field-row">${field('开始时间','<input name="start" type="datetime-local" value="2026-10-20T09:00" required>')}${field('结束时间','<input name="end" type="datetime-local" value="2026-10-20T18:00" required>')}</div><div class="field-row">${field('考试时长（分钟）',`<input name="duration" type="number" min="1" value="${saved.duration||60}" required>`)}${field('及格分数','<input name="pass" type="number" min="0" value="60" required>')}</div>${field('出题人','<select><option>王老师、李老师</option></select>')}<div class="notice">正式版本保留多科室选择、作答次数、题目 / 选项乱序、防作弊及其他现有设置。</div></form>`:
 `<h3 style="font-size:15px">${escapeHtml(saved.name||'第四季度安全知识考核')}</h3><p class="small muted" style="margin:5px 0 18px">选择来源题库，再按题型抽题或手动选题。</p><div class="inset-card"><label><input type="checkbox" checked> 安全知识</label><br><label><input type="checkbox" checked> 企业文化</label></div><div class="inset-card"><div class="selection-row"><h3>按题型抽题</h3>${tag('预览示例')}</div><div class="field-row">${field('单选题','<input type="number" value="4" min="0">')}${field('多选题','<input type="number" value="2" min="0">')}${field('判断题','<input type="number" value="2" min="0">')}${field('简答题','<input type="number" value="1" min="0">')}</div></div><div class="notice" style="margin-top:20px">正式版本使用已有组题服务校验题量、分值与权限；题量不足须明确提示并阻止创建。独立试卷管理入口不重新引入。</div>`}`,btn(step===1?'取消':'上一步',step===1?'close':'exam-back')+(step===1?'<button class="btn primary" type="submit" form="exam-form">下一步：题目配置 →</button>':btn('完成流程预览','finish-exam','primary')),'考试运营 / 创建流程',true);
}

function filterQuestions(){
 const keyword=($('#question-search')?.value||'').trim().toLowerCase();const type=$('#question-type')?.value||'';
 const list=currentQuestions().filter(q=>(!keyword||`${q[0]} ${q[3]}`.toLowerCase().includes(keyword))&&(!type||q[1]===type));
 $('#questions-table').innerHTML=list.length?table(['<input class="table-checkbox" type="checkbox" id="select-all" aria-label="全选当前结果">','题目','参考答案','分值','操作'],questionRows(list)):`<div class="empty">${ico('search')}<h3>没有匹配的题目</h3><p>试试其他关键词，或清空筛选。</p><button class="text-link" data-action="reset-questions">清空筛选</button></div>`;
 $('#question-pagination').innerHTML=pagination(list.length);
}
function updateSelection(){const n=state.selected.size;$('#selected-count').textContent=n;$('#batchbar').hidden=!n;const visible=$$('.question-check');const all=$('#select-all');if(all){all.checked=visible.length>0&&visible.every(x=>x.checked);all.indeterminate=visible.some(x=>x.checked)&&!all.checked;}}
function filterExams(){const k=($('#exam-search')?.value||'').trim();const list=exams.filter(e=>(state.examStatus==='全部考试'||e[2]===state.examStatus)&&e[0].includes(k));$('#exam-table').innerHTML=list.length?examTable(list):'<div class="empty"><h3>没有匹配的考试</h3><p>调整状态或关键词后重试。</p></div>';$('#exam-pagination').innerHTML=pagination(list.length);}
function filterAppeals(){const k=($('#appeal-search')?.value||'').trim();const e=$('#appeal-exam')?.value||'';const list=appeals.filter(a=>(state.appealStatus==='全部申请'||a[7]===state.appealStatus)&&(!e||a[4]===e)&&(!k||`${a[1]} ${a[2]}`.includes(k)));$('#appeal-table').innerHTML=list.length?appealTable(list):'<div class="empty"><h3>没有匹配的复核申请</h3><p>调整考试范围或关键词后重试。</p></div>';$('#appeal-pagination').innerHTML=pagination(list.length);}
function filterUsers(){const k=($('#user-search')?.value||'').trim();const r=$('#user-role')?.value||'';const list=userRows.filter(u=>(!r||u[3]===r)&&(!k||`${u[0]} ${u[1]}`.includes(k)));$('#user-table').innerHTML=list.length?usersTable(list):'<div class="empty"><h3>没有匹配的用户</h3><p>调整姓名、账号或角色筛选后重试。</p></div>';$('#user-pagination').innerHTML=pagination(list.length);}
function scoreTab(index){
 if(index==='0')return scoreList();
 if(index==='1')return table(['题目','题型','错误人次','知识点','操作'],questions.slice(0,3).map((q,i)=>`<tr><td>${q[3]}</td><td>${tag(q[1])}</td><td>${[18,12,8][i]}</td><td>${q[4]}</td><td><button class="text-link" data-action="question-preview" data-id="${q[0]}">查看题目</button></td></tr>`));
 return `<div class="notice amber" style="margin:18px">切屏异常依据系统已配置阈值标记，需人工结合事件时间线核查。</div>`+table(['考生','切屏次数','累计时长','状态','操作'],['张三','赵六'].map((n,i)=>`<tr><td>${n}</td><td>${[5,4][i]} 次</td><td>${[180,145][i]} 秒</td><td>${tag('待核查','warning')}</td><td><button class="text-link" data-action="cheat-detail" data-name="${n}">事件时间线 →</button></td></tr>`));
}
document.addEventListener('input',e=>{
 if(e.target.id==='question-search')filterQuestions();if(e.target.id==='exam-search')filterExams();if(e.target.id==='appeal-search')filterAppeals();if(e.target.id==='user-search')filterUsers();
 if(e.target.id==='tree-search'){const k=e.target.value.trim();$$('[data-bank]').forEach(b=>b.hidden=!b.textContent.includes(k));}
});
document.addEventListener('change',e=>{
 if(e.target.id==='question-type')filterQuestions();if(e.target.id==='appeal-exam')filterAppeals();if(e.target.id==='user-role')filterUsers();
 if(e.target.matches('.question-check')){if(e.target.checked)state.selected.add(e.target.value);else state.selected.delete(e.target.value);updateSelection();}
 if(e.target.id==='select-all'){$$('.question-check').forEach(b=>{b.checked=e.target.checked;if(b.checked)state.selected.add(b.value);else state.selected.delete(b.value);});updateSelection();}
 if(e.target.id==='appeal-decision'){const reject=e.target.value==='reject';$('#appeal-score').disabled=reject;$('#appeal-score').required=!reject;}
 if(e.target.id==='score-exam')toast('已切换考试范围；图表仍为视觉示例，正式版本重新请求所选考试数据。');
});
document.addEventListener('click',e=>{
 const el=e.target.closest('button,a');if(!el)return;
 if(el.dataset.page){navigate(el.dataset.page);return;}
 if(el.dataset.bank){state.bank=el.dataset.bank;state.selected.clear();render(false);return;}
 if(el.dataset.examStatus){state.examStatus=el.dataset.examStatus;render(false);return;}
 if(el.dataset.appealStatus){state.appealStatus=el.dataset.appealStatus;render(false);return;}
 if(el.dataset.userTab){state.userTab=el.dataset.userTab;render(false);return;}
 if(el.dataset.practiceTab){state.practiceTab=el.dataset.practiceTab;state.practiceAnswer='';state.practiceSubmitted=false;render(false);return;}
 if(el.dataset.option){state.practiceAnswer=el.dataset.option;render(false);return;}
 if(el.dataset.scoreTab){$$('[data-score-tab]').forEach(b=>b.classList.toggle('active',b===el));$('#score-tab-body').innerHTML=scoreTab(el.dataset.scoreTab);return;}
 if(el.classList.contains('close-drawer')){closeDrawer();return;}
 const action=el.dataset.action;
 switch(action){
 case 'close':closeDrawer();break;
 case 'refresh':toast('预览已刷新；当前展示方案示例数据。');break;
 case 'go-banks':if(['全部科目','岗位培训'].includes(state.bank))state.bank='安全知识';navigate('banks');break;
 case 'go-subjects':navigate('subjects');break;
 case 'appeals':navigate('appeals');break;
 case 'notifications':openDrawer('消息中心样例',`<div class="notice">3 条待处理考务消息</div><div class="timeline"><div>收到新的成绩复核申请<small>10:36 · 第三季度专业能力测评</small></div><div>待评答卷提醒<small>12 份答卷等待人工阅卷</small></div></div>`,btn('关闭','close')+'<button class="btn primary" data-page="appeals">查看复核</button>');break;
 case 'account':openDrawer('账号区域',`<div class="avatar-name"><span class="avatar">管</span><div><b>系统管理员</b><p class="small muted">管理员 · 设计示例</p></div></div><div class="notice" style="margin-top:24px">正式版本沿用现有个人资料、账号安全、修改密码、帮助与退出登录入口。</div>`,btn('关闭','close'));break;
 case 'new-subject':case 'edit-subject':openDrawer(action==='new-subject'?'新增根科目':'编辑科目',`<form id="subject-form">${field('科目名称',`<input name="name" required value="${action==='new-subject'?'':escapeHtml(state.bank)}" placeholder="请输入科目名称">`,true)}${field('上级科目','<select><option>根级</option><option>通识培训</option></select>')}${field('科目说明','<textarea placeholder="说明科目范围与适用人员"></textarea>')}${field('权限方式','<select><option>继承上级权限</option><option>完整覆盖当前节点权限</option></select>')}<div class="notice">完整实现沿用现有科目抽屉中的状态、排序、练题开放和浏览 / 编辑授权字段。</div></form>`,btn('取消','close')+'<button class="btn primary" type="submit" form="subject-form">预览保存反馈</button>','教学资源 / 科目管理');break;
 case 'new-question':questionDrawer('');break;
 case 'edit-question':questionDrawer(el.dataset.id);break;
 case 'question-preview':questionDrawer(el.dataset.id,true);break;
 case 'reset-questions':$('#question-search').value='';$('#question-type').value='';filterQuestions();break;
 case 'clear-selection':state.selected.clear();$$('.question-check').forEach(b=>b.checked=false);updateSelection();break;
 case 'batch-edit':openDrawer('批量编辑题目',`<div class="notice">本次已选 ${state.selected.size} 道题：${[...state.selected].join('、')}</div>${field('统一难度','<select><option>保持不变</option><option>简单</option><option>中等</option><option>困难</option></select>')}<p class="small muted">样例展示批量面板。正式版本接入现有批量编辑能力，显示具体变更与影响题量。</p>`,btn('关闭','close'));break;
 case 'import':case 'user-import':openDrawer(action==='import'?'批量导入题目':'批量导入用户',`<div class="stepper"><span class="active"><b>1</b>上传</span><span><b>2</b>校验</span><span><b>3</b>完成</span></div><div class="state-preview" style="min-height:230px">${ico('upload')}<b>将 Excel 文件拖到这里</b><span>${action==='import'?'.xlsx · 不超过 5 MB / 2000 行':'使用现有用户导入模板'}</span><button class="btn" data-action="sample-import">查看校验预览</button></div><div class="notice" style="margin-top:20px">导入保留现有「上传 → 服务端逐行校验 → 预览 → 确认写入」流程。错误按行号、字段和原因展示。</div>`,btn('关闭','close'));break;
 case 'sample-import':openDrawer('导入校验预览',`<div class="notice amber">以下为示例：总计 3 行，可导入 2 行，1 行存在错误。</div>${table(['行号','内容','校验结果'],['<tr><td>2</td><td>安全知识示例题</td><td>'+tag('通过','success')+'</td></tr>','<tr><td>3</td><td>参考答案为空</td><td>'+tag('请补充答案','danger')+'</td></tr>','<tr><td>4</td><td>应急处置示例题</td><td>'+tag('通过','success')+'</td></tr>'])}`,btn('关闭','close'));break;
 case 'reset-exams':state.examStatus='全部考试';render(false);break;
 case 'new-exam':state.examDraft={};newExam();break;
 case 'exam-back':newExam();break;
 case 'finish-exam':closeDrawer();toast('两步创建流程预览完成，未创建真实考试。');break;
 case 'exam-preview':{const ex=exams.find(x=>x[8]===el.dataset.id);openDrawer(ex?.[0]||'考试题目预览',`<div class="notice">${ex?.[2]==='未开始'?'未开始且无作答时可编辑题目。':'考试已结束，题目与分值锁定；已开考答卷沿用冻结快照。'}</div>${table(['题型','题目','分值'],questions.slice(0,4).map(q=>`<tr><td>${tag(q[1])}</td><td>${q[3]}</td><td>${q[6]}</td></tr>`))}`,btn('关闭','close')+btn('PDF 导出示例','export','','download'),'考试运营 / 题目预览',true);break;}
 case 'exam-ops':openDrawer('本场考试的考务处理',`<div class="notice">${escapeHtml(exams.find(x=>x[8]===el.dataset.id)?.[0]||'当前考试')}</div><p class="small muted">正式版本按 examId 进入对应队列；本预览展示入口与处理面板。</p><div class="actions" style="margin-top:22px">${btn('人工阅卷','reviews')}${btn('补考审批','retakes')}${btn('成绩复核','appeals','primary')}</div>`,btn('关闭','close'));break;
 case 'monitor':openDrawer('实时监考',`<div class="notice">安全知识考核 · 进行中 · 示例监考数据</div><div class="stats" style="grid-template-columns:1fr 1fr">${stat('正在作答',18,'人','按考试更新')}${stat('已交卷',42,'人','按考试更新')}</div>${table(['考生','答题进度','剩余时间'],['<tr><td>张三</td><td>8 / 10</td><td>18:32</td></tr>','<tr><td>李四</td><td>5 / 10</td><td>22:15</td></tr>'])}<p class="small muted" style="margin-top:18px">正式版本沿用现有 SSE 更新、断线回退、加时和强制交卷确认流程。</p>`,btn('关闭','close'));break;
 case 'reviews':case 'retakes':openDrawer(action==='reviews'?'人工阅卷队列':'补考审批队列',`<div class="notice">按考试范围展示待处理任务；正式版本保留独立菜单与现有审批规则。</div>${table(['申请人 / 考生','考试','操作'],['<tr><td>张三</td><td>第三季度专业能力测评</td><td>'+tag(action==='reviews'?'待阅卷':'待审批','warning')+'</td></tr>'])}<div class="quote">${action==='reviews'?'阅卷：左侧原作答，中间参考答案与评分细则，右侧给分。分数不能超出题目分值。':'补考：显示原成绩、可申请条件、申请说明与审批记录。批准后沿用现有额外次数授予规则。'}</div>`,btn('关闭','close'));break;
 case 'appeal-detail':appealDrawer(el.dataset.id);break;
 case 'reset-appeals':$('#appeal-search').value='';$('#appeal-exam').value='';filterAppeals();break;
 case 'confirm-appeal':{const p=state.pendingAppeal;const a=appeals.find(x=>x[0]===p.id);a[7]=p.decision==='approve'?'已通过':'已驳回';a[8]=p.decision==='approve'?'success':'neutral';a[10]=p.reason;state.pendingAppeal=null;closeDrawer();render(false);toast('原型处理状态已更新；未修改真实成绩或发送业务请求。');break;}
 case 'cancel-appeal-confirm':appealDrawer(state.pendingAppeal.id);break;
 case 'export':toast('导出入口示意：正式版本沿用现有 Excel / PDF 导出与当前考试范围。');break;
 case 'score-detail':openDrawer('答卷与评分明细',`<p class="small muted">${escapeHtml(el.dataset.name||'张三')} · 第三季度专业能力测评</p><div class="quote">${questions[4][3]}<br><br>考生作答：停止作业，报告负责人，设置警示，完成整改后复查。<br><br>参考评分细则：报告 2 分，现场防护 3 分，整改 3 分，复查 2 分。<br><b>原得分：6 / 10 分</b></div><div class="notice">正式版本逐题展示冻结试卷、原始作答、自动判分 / 人工评分与评分记录。</div>`,btn('返回','close'));break;
 case 'cheat-detail':openDrawer('切屏事件时间线',`<p class="small muted">${escapeHtml(el.dataset.name)} · 示例事件</p><div class="timeline"><div>离开答题页面<small>09:15:20 · 持续 60 秒</small></div><div>返回答题页面<small>09:16:20 · 已记录</small></div><div>达到系统配置的审查阈值<small>仅标记待核查，由监考人员结合上下文判断</small></div></div>`,btn('关闭','close'));break;
 case 'new-user':case 'edit-user':{const u=userRows.find(x=>x[0]===el.dataset.name)||['','','研发部','考生','技术专员','启用'];openDrawer(action==='new-user'?'新增用户':'编辑用户',`<form id="user-form">${field('姓名',`<input value="${u[0]}" required>`,true)}${field('账号',`<input value="${u[1]}" required>`,true)}${field('科室',`<select>${['研发部','市场部'].map(x=>`<option ${x===u[2]?'selected':''}>${x}</option>`).join('')}</select>`)}${field('角色',`<select>${['管理员','出题人','考生'].map(x=>`<option ${x===u[3]?'selected':''}>${x}</option>`).join('')}</select><small>每个用户选择一个角色。角色可配置菜单与成员。</small>`)}${field('岗位','<select><option>技术专员</option><option>市场专员</option><option>培训讲师</option></select>')}<div class="notice">完整实现复用现有字段和校验，本原型不修改账号或权限。</div></form>`,btn('取消','close')+'<button class="btn primary" type="submit" form="user-form">预览保存反馈</button>');break;}
 case 'role-detail':openDrawer(`${el.dataset.name} · 权限示例`,`<div class="notice">内置身份与菜单授权继续使用现有权限模型。</div>${['数据中心','教学资源','考试运营','组织与系统'].map(t=>`<div class="selection-row" style="padding:14px 0;border-bottom:1px solid var(--border)"><span>${t}</span>${tag(el.dataset.name==='管理员'?'可管理':'按授权范围','neutral')}</div>`).join('')}<p class="small muted" style="margin-top:20px">自定义角色、成员分配和独立岗位管理保留现有实现；具体菜单以实际授权结果为准。</p>`,btn('关闭','close'));break;
 case 'mobile-feature':toast(`${el.dataset.name}入口样例；正式版本按练题设置展示。`);break;
 case 'mobile-nav':toast(`${el.dataset.name}为考生端现有入口；本页仅演示练题方向。`);break;
 case 'answer-card':openDrawer('答题卡样例',`<div class="actions">${Array.from({length:10},(_,i)=>`<span class="tag ${i===0?'':'neutral'}">${String(i+1).padStart(2,'0')}</span>`).join('')}</div><p class="small muted" style="margin-top:20px">正式版本区分当前、已答、未答与标记，点击题号直接定位。</p>`,btn('关闭','close'));break;
 case 'submit-answer':if(!state.practiceAnswer){toast('请先选择一个答案。');break;}state.practiceSubmitted=true;render(false);break;
 case 'practice-home':state.practiceTab='home';state.practiceSubmitted=false;state.practiceAnswer='';render(false);break;
 case 'state-reset':toast('正式版本清空当前筛选，并重新加载数据。');break;
 case 'state-retry':toast('正式版本只重试失败区块，保留已有页面内容。');break;
 }
});
document.addEventListener('submit',e=>{
 e.preventDefault();const form=e.target;const data=new FormData(form);
 if(form.id==='question-form'){
  const stem=String(data.get('stem')||'').trim(),answer=String(data.get('answer')||'').trim();if(!stem||!answer){$('#form-error').textContent='请填写题干与参考答案。';return;}
  const pool=currentQuestions();const id=form.dataset.id;const old=pool.find(q=>q[0]===id);const row=[id||`${state.bank==='企业文化'?'C':'Q'}${String(pool.length+1).padStart(3,'0')}`,data.get('type'),data.get('difficulty'),stem,String(data.get('tag')||''),answer,Number(data.get('score'))];if(old)pool.splice(pool.indexOf(old),1,row);else pool.push(row);closeDrawer();render(false);toast('已保存到当前原型内存，刷新浏览器后恢复示例。');
 }
 if(form.id==='subject-form'||form.id==='user-form'){closeDrawer();toast('保存反馈预览完成；未修改真实科目、用户或权限。');}
 if(form.id==='login-form')toast('登录反馈预览：正式页面接入现有登录、验证码与二步验证流程。');
 if(form.id==='exam-form'){state.examDraft=Object.fromEntries(data);if(state.examDraft.end<=state.examDraft.start){toast('结束时间必须晚于开始时间。');return;}newExam(2);}
 if(form.id==='appeal-form'){
  const a=appeals.find(x=>x[0]===form.dataset.id);const reason=String(data.get('reason')||'').trim();if(!reason){toast('请填写处理说明。');return;}
  state.pendingAppeal={id:a[0],decision:data.get('decision'),score:Number(data.get('score')??a[9]),reason};const p=state.pendingAppeal;
  openDrawer('确认本次复核处理',`<div class="notice amber">请核对对象、处理结论与成绩影响。</div><dl class="detail-list"><dt>考生</dt><dd>${a[1]} · ${a[2]}</dd><dt>考试</dt><dd>${a[4]}</dd><dt>处理结论</dt><dd>${p.decision==='approve'?'通过复核':'驳回复核'}</dd><dt>成绩影响</dt><dd>${p.decision==='approve'?`${a[9]} 分 → ${p.score} 分`:'保留原成绩'}</dd><dt>处理说明</dt><dd>${escapeHtml(reason)}</dd></dl><p class="small muted" style="margin-top:22px">本原型仅更新示例审批状态。正式版本改分提交后，刷新成绩与审批记录，并保留审计。</p>`,btn('返回核对','cancel-appeal-confirm')+btn('确认处理（原型）','confirm-appeal','primary'),'考试运营 / 影响范围确认');
 }
});
$('#overlay').addEventListener('click',closeDrawer);
document.addEventListener('keydown',e=>{
 if(e.key==='Escape')closeDrawer();
 if(e.key==='Tab'&&$('#drawer').open){const focusable=$$('button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),a[href]',$('#drawer'));const first=focusable[0],last=focusable.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}}
});
window.addEventListener('hashchange',()=>{const page=location.hash.slice(1);if(pages[page])navigate(page);});
state.page=pages[location.hash.slice(1)]?location.hash.slice(1):'dashboard';
render();
