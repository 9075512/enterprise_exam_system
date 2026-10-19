// 导入/导出的专用任务稿；仅切换设计示例，不连接业务接口。
const workflowSteps = '<div class="wf-steps"><span>① 模板 / 题库</span><b>② 上传文件</b><span>③ 预览结果</span><span>④ 完成</span></div>';
function importWorkflowDesign(question) {
  return `<div class="wf-design"><div class="wf-preview-tabs"><button data-wf-stage="upload" class="active">上传步骤设计</button><button data-wf-stage="preview">预览步骤设计</button></div>${workflowSteps}<section class="wf-panel" data-wf-panel="upload">${question?'<div class="wf-context"><small>目标题库</small><strong>安全知识与应急处置的完整题库名称</strong></div>':''}<div class="wf-upload">选择或拖入.xlsx文件<p class="scope">大小和行数按系统配置校验；选择后点击解析预览。</p></div><div class="wf-file"><div><small>已选文件</small><strong>长文件名示例ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789.xlsx</strong></div><button>移除</button></div></section><section class="wf-panel" data-wf-panel="preview" hidden><div class="wf-counts"><span>可导入2条</span><span>校验失败1条</span><span>共3行</span></div><p class="scope">设计示例 · 预览通过的行在确认后才写入。</p><div class="table-scroll"><table><thead><tr><th>行号</th><th>列</th><th>原始值</th><th>原因</th></tr></thead><tbody><tr><td>4</td><td>示例字段</td><td>完整原始内容</td><td>根据模板要求检查此行，失败行跳过。</td></tr></tbody></table></div>${question?'<p class="wf-dedupe">☑ 跳过重复题目（内容去重）</p>':''}<p class="scope">解析与导入期间锁定文件、返回及关闭；失败保留选择并允许重试。</p></section></div>`;
}
window.DESIGN_WORKFLOW_VIEWS = {
  UserImportDialog: () => importWorkflowDesign(false),
  QuestionImportDialog: () => importWorkflowDesign(true),
  ScoreExportDialog: () => `<div class="wf-design"><div class="wf-context"><small>当前考试</small><strong>安全知识与应急处理的完整考试名称</strong></div><p class="scope">按系统最近一次 / 最高分成绩口径导出，具体规则保留说明。</p><h3>导出格式</h3><div class="wf-format"><button class="active">Excel（.xlsx）</button><button>PDF（.pdf）</button></div><h3>导出字段</h3><p class="scope">已选8 / 13 · 全选支持部分选中状态</p><div class="wf-fields">${['考生姓名','登录账号','科室','作答次数','开考时间','交卷时间','得分','是否及格','及格线','用时（分钟）','切屏次数','切屏时长（秒）','交卷方式'].map((text,i)=>`<label>${[0,2,3,5,6,7,10,11].includes(i)?'☑':'□'} ${text}</label>`).join('')}</div><p class="scope">导出期间锁定格式、字段与关闭；失败保留选择，成功后关闭。</p></div>`
};
window.DESIGN_WORKFLOW_ACTIONS = {UserImportDialog:'解析预览',QuestionImportDialog:'解析预览',ScoreExportDialog:'导出'};

// 五种题型共用编辑框架；切换仅改变设计样例。
function questionEditorDesign(type='single') {
  const types=['single','multiple','judge','fill','short'],names=['单选题','多选题','判断题','填空题','简答题'];
  const field=(name,value)=>`<div class="field"><label>${name}</label><div class="input qe-text">${value}</div></div>`;
  const objective=['single','multiple','judge'].includes(type),judge=type==='judge';
  return `<div class="qe-design"><div class="qe-types">${types.map((t,i)=>`<button data-qe-type="${t}" class="${t===type?'active':''}">${names[i]}</button>`).join('')}</div>${field('题干','题干完整显示，填空可用 ___ 标记；长内容自动换行。')}${objective?`<h3>选项</h3>${(judge?['正确','错误']:['完整的长选项内容，使用多行输入，避免遗漏重要信息。','其他选项完整内容']).map((v,i)=>`<div class="qe-option"><b>${String.fromCharCode(65+i)}</b><div class="input qe-text">${v}</div><button ${judge?'disabled':''}>删除</button></div>`).join('')}${judge?'':'<button>＋ 添加选项</button>'}<h3>正确答案</h3><div class="qe-answers"><label>${type==='multiple'?'☑':'◉'} A · ${judge?'正确':'完整的长选项内容，换行显示'}</label><label>${type==='multiple'?'☑':'○'} B · ${judge?'错误':'其他选项完整内容'}</label></div>`:type==='fill'?`${field('第 1 空参考答案','逐空填写完整答案；保留现有匹配规则。')}<button>＋ 添加空</button>`:`${field('参考答案','供阅卷参考，支持长文本和换行。')}<h3>评分细则（选填）</h3><div class="qe-band"><small>档位 1</small><div class="grade-number"><button>−</button><span>10.0</span><button>＋</button></div><div class="input">完全正确</div><div class="input qe-text">评分要点说明独立成行，保留完整内容；每档得分不超过本题分值。</div><button>删除档位</button></div><button>＋ 添加档位</button><p class="scope">最多 10 档；未设置时由阅卷人员自由打分。</p>`}${field('难度','未标注 / 简单 / 中等 / 困难')}${field('解析','答案解析，可留空。')}<p class="scope">保存期间锁定表单与关闭，失败保留输入；题型切换沿用原有答案重置规则。</p></div>`;
}
window.DESIGN_WORKFLOW_VIEWS.QuestionFormDialog=()=>questionEditorDesign();
window.DESIGN_WORKFLOW_ACTIONS.QuestionFormDialog='保存';
document.addEventListener('click',event=>{const button=event.target.closest('[data-qe-type]');if(button)button.closest('.qe-design').outerHTML=questionEditorDesign(button.dataset.qeType);});
document.addEventListener('click', event => {
  const button=event.target.closest('[data-wf-stage]');if(!button)return;
  const view=button.closest('.wf-design'),stage=button.dataset.wfStage;
  view.querySelectorAll('[data-wf-stage]').forEach(b=>b.classList.toggle('active',b===button));
  view.querySelectorAll('[data-wf-panel]').forEach(panel=>{panel.hidden=panel.dataset.wfPanel!==stage;});
  view.querySelector('.wf-steps').innerHTML=stage==='preview'?'<span>① 模板 / 题库</span><span>② 上传文件</span><b>③ 预览结果</b><span>④ 完成</span>':workflowSteps.replace(/^<div[^>]*>|<\/div>$/g,'');
  view.closest('.overlay').querySelector('footer button.primary').textContent=stage==='preview'?'确认导入':'解析预览';
});
