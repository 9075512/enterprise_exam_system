// 系统维护的专用设计；内容为示例，不连接或执行维护接口。
function maintenanceDesign(){
  const field=(label,value)=>`<div class="field"><label>${label}</label><div class="input">${value}</div></div>`;
  return card('服务端统计快照','<div class="maintenance-design-stats"><div>业务表考试记录<br><strong>1200</strong></div><div>历史成绩归档<br><strong>320</strong></div><div>保留天数设置<br><strong>90天</strong></div><div>统计时间<br>示例日期与时间</div></div><p class="scope">全系统统计，以上均为设计示例；缺少的数量显示 —，刷新失败保留上次成功快照并标明状态。</p>')+
  card('当前生效策略','<div class="maintenance-design-stats"><div>归档保留天数<br><strong>90天</strong></div><div>每日执行时点<br><strong>03:00</strong></div><div>自动归档<br><strong>未启用</strong></div></div><p class="scope">只读展示已保存策略；下方未保存的修改与本次手动参数不会改变此处。</p>')+
  '<div class="maintenance-design-tasks">'+card('自动归档（定时任务）','<p class="scope">已保存：未开启　·　有未保存修改</p><div class="filters">'+field('启用自动归档','开关（至少44px）')+field('每日执行时点','03:00')+'</div><button class="primary">保存设置</button> <button>恢复已保存设置</button><p class="scope">读取设置失败时提供重试，避免提交未知配置。保存失败保留填写。</p><button>按已保存策略立即执行一次</button>')+card('历史成绩归档','<p class="scope">以下参数仅用于本次手动任务。</p><div class="filters">'+field('保留天数','90（1–3650）')+field('单次上限','2000（1–5000）')+'</div><button class="primary">执行归档</button><p class="scope">确认框说明截止条件、上限和复核跳过规则；确认和请求期间锁定相关操作，失败保留参数。</p>')+'</div>'+
  card('核心表行数统计','<div class="table-scroll"><table><thead><tr><th>数据对象</th><th>表名</th><th>行数</th></tr></thead><tbody><tr><td>示例业务对象</td><td>example_table</td><td>1200</td></tr></tbody></table></div>')+
  card('执行记录与其他维护能力','<p>执行记录仅含本次会话手动结果与服务端最近一次自动结果，完整展示时间、成功 / 失败和跳过原因。</p><p class="scope">未开放的能力仅展示说明，不提供可执行按钮；不展示未经测量的耗时预测。</p>');
}
window.DESIGN_ORG_VIEWS.SystemMaintenancePage=maintenanceDesign;
