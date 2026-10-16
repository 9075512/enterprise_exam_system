/* Behavior refinements for the design preview; no production API calls. */
const renderBeforePolish = render;
function syncMobileNavigation(){
 const sidebar=document.querySelector('.command-rail');
 if(!sidebar)return;
 const mobile=window.matchMedia('(max-width:740px)').matches;
 const open=sidebar.classList.contains('open');
 sidebar.inert=mobile&&!open;
 sidebar.setAttribute('aria-hidden',String(mobile&&!open));
 const trigger=document.querySelector('[data-action="menu"]');
 if(trigger)trigger.setAttribute('aria-expanded',String(mobile&&open));
 document.body.style.overflow=mobile&&open?'hidden':'';
}
render=function(){
 renderBeforePolish();
 document.body.style.overflow='';
 syncMobileNavigation();
 const heading=document.querySelector('main h1');
 if(heading)heading.setAttribute('tabindex','-1');
 const title=document.querySelector('.command-heading h1');
 if(title)title.setAttribute('aria-label','考务总览');
};
const responsiveNavigation=window.matchMedia('(max-width:740px)');
responsiveNavigation.addEventListener('change',()=>{
 const sidebar=document.querySelector('.command-rail');
 if(sidebar&&!responsiveNavigation.matches)sidebar.classList.remove('open');
 syncMobileNavigation();
});
document.addEventListener('keydown',event=>{
 const sidebar=document.querySelector('.command-rail.open');
 if(!sidebar||!responsiveNavigation.matches)return;
 if(event.key==='Escape'){
  event.preventDefault();sidebar.classList.remove('open');syncMobileNavigation();
  document.querySelector('[data-action="menu"]')?.focus();return;
 }
 if(event.key==='Tab'){
  const items=[...sidebar.querySelectorAll('a[href],button:not([disabled])'),document.querySelector('[data-action="close-menu"]')].filter(Boolean);
  const first=items[0],last=items[items.length-1];
  if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus()}
  else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus()}
 }
});
document.addEventListener('click',event=>{
 const action=event.target.closest('[data-action]');
 if(action?.dataset.action==='menu'){
  syncMobileNavigation();
  document.querySelector('.command-rail [aria-current="page"]')?.focus();
 }
 if(action?.dataset.action==='close-menu'){
  syncMobileNavigation();document.querySelector('[data-action="menu"]')?.focus();
 }
 if(event.target.closest('[data-nav]')||['previous','next'].includes(action?.dataset.action)){
  if(!document.querySelector('#dialog[open]'))document.querySelector('main h1')?.focus({preventScroll:true});
 }
 if(action?.dataset.action==='task-exams'){
  document.querySelector('#dialog').close();
  state.keyword='';state.filter='全部考试';state.department='全部科室';navigate('exams');
  document.querySelector('main h1')?.focus({preventScroll:true});
 }
 if(action?.dataset.action==='create'){
  const form=document.getElementById('create-form');
  if(form){
   const input=form.elements.name;
   input.insertAdjacentHTML('afterend','<div class="field-error" id="name-error" role="alert" hidden></div>');
   input.setAttribute('aria-describedby','name-error');
   input.focus();
  }
 }
});
document.addEventListener('invalid',event=>{
 const input=event.target;
 if(input.closest('#create-form')&&input.name==='name'){
  const error=document.getElementById('name-error');
  if(error){event.preventDefault();error.textContent='请输入考试名称';error.hidden=false;input.setAttribute('aria-invalid','true');input.focus()}
 }
},true);
document.addEventListener('input',event=>{
 if(event.target.closest('#create-form')&&event.target.name==='name'){
  const error=document.getElementById('name-error');
  if(error){error.hidden=true;event.target.removeAttribute('aria-invalid');event.target.setCustomValidity('')}
 }
});
// Intercept queue actions before the initial prototype's placeholder handler.
document.addEventListener('click',event=>{
 const trigger=event.target.closest('.queue-row[data-todo]');
 if(!trigger)return;
 event.stopImmediatePropagation();
 const title=trigger.dataset.todo;
 const rows=title==='待人工阅卷'?
  [['年度信息安全考核','简答题待评分',6],['第三季度专业能力测评','主观题待评分',4],['企业文化与行为规范','简答题待评分',2]]:
  title==='补考申请'?
  [['第三季度专业能力测评','待审核补考资格',3],['企业文化与行为规范','待审核补考资格',1]]:
  [['第三季度专业能力测评','待核查评分明细',1],['企业文化与行为规范','待核查评分明细',1]];
 modal(title,`<div class="task-summary"><span>按考试汇总 · 示例数据</span><strong>${trigger.dataset.count} <span>项</span></strong></div>${rows.map(([name,desc,count])=>`<div class="task-line"><div><strong>${esc(name)}</strong><small>${desc}</small></div><span>${count}</span></div>`).join('')}<p class="task-local-note">此处用于演示考务待办的信息组织；正式的审批与阅卷流程需连接业务接口。</p>`,`<button class="btn" data-action="close-dialog">关闭</button><button class="btn primary" data-action="task-exams">进入考试管理 ${icon('arrow')}</button>`);
},true);
const specBeforePolish=spec;
spec=function(){return specBeforePolish()
 .replaceAll('28 / 1.4 / 600（总览 36）','28 / 1.4 / 600（总览 34）')
 .replaceAll('指标 32；核心进度 80','指标 32；核心进度 72')
 .replaceAll('日程默认行高 84px','日程默认行高 82px')
 .replaceAll('保留键盘焦点；减少动态效果设置下关闭过渡。','保留键盘焦点；窄屏导航支持焦点约束与 Escape 关闭；表单错误紧贴字段；减少动态效果设置下关闭过渡。')};
