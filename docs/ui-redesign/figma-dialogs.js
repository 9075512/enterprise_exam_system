await figma.setCurrentPageAsync(await figma.getNodeByIdAsync(PAGEID));
const page=figma.currentPage,frames=[];
const dialogs=[
 ['新建 / 编辑考试',['考试名称','关联试卷','参与科室（可多选）','开始时间','截止时间','考试时长（分钟）','及格分数线','考试形式','答题次数（每人最多）','人手一卷','选项乱序','补考申请','成绩复核']],
 ['新建 / 编辑用户',['登录账号','姓名','角色','所属科室','邮箱','状态','初始密码']],
 ['新建 / 编辑科室',['科室名称','上级科室','描述']],
 ['新建 / 编辑题库',['题库名称','分类','描述','授权出题人']],
 ['新建 / 编辑试题',['题型','题干','选项','正确答案 / 参考答案','分值','评分细则','科目','难度','知识点标签','解析']],
 ['考试特殊安排',['考生','加时','额外次数','免考','备注']],
 ['成绩复核通过',['考生与考试','原始成绩','调整后分数','复核意见']],
 ['驳回复核 / 补考申请',['申请人','申请原因','处理意见']],
 ['提交复核 / 补考申请',['考试名称','当前成绩','申请说明']],
 ['新建 / 编辑公告',['公告标题','公告内容','发布范围','公告级别','生效时间','置顶','启用']],
 ['新建 / 编辑轮播图',['标题','图片','跳转地址','发布范围','排序','生效时间','启用']],
 ['导出成绩',['导出范围','导出格式','导出字段']],
 ['批量编辑题目',['科目','难度','知识点标签','分值']],
 ['克隆题库 / 试卷',['来源','新名称','描述']],
 ['批量授权',['选择出题人','授权范围']],
 ['修改密码',['当前密码','新密码','确认新密码']],
 ['账号安全',['两步验证','身份验证器','当前设备','登录设备管理']],
 ['全局菜单搜索',['搜索菜单名称']],
 ['批量导入账号 / 题目',['1 下载模板','2 上传文件','3 预览与校验','4 完成']],
 ['确认交卷',['已答题数','未答题数','剩余时间']],
 ['危险操作确认',['操作对象','影响范围','操作后果']]
];
for(let i=0;i<dialogs.length;i++){
 const [title,fields]=dialogs[i];const height=Math.max(420,fields.length*78+160);const root=rounded(border(frame(page,title,680,height)));root.x=(i%4)*740;root.y=2800+Math.floor(i/4)*1300;space(root,24);gap(root,16);text(root,title,'heading');
 if(/导入/.test(title))text(root,'支持模板校验；错误逐行定位，成功后保留导入历史。','body','text-secondary',632);
 for(const label of fields){const f=frame(root,label,632,62,null);gap(f,6);text(f,label,'label','text-body');use(f,'Input/default',/密码/.test(label)?'••••••••':/启用|置顶|乱序|免考|人手/.test(label)?'启用 / 关闭':'请选择或填写'+label,632);}
 const r=row(root,'弹窗操作',632,36);r.primaryAxisAlignItems='MAX';use(r,'Button/secondary/default','取消');use(r,'Button/'+(/危险/.test(title)?'danger':'primary')+'/default',/导入/.test(title)?'下一步':/交卷/.test(title)?'确认交卷':'确认保存');root.resize(680,root.children.reduce((s,n)=>s+n.height,0)+16*(root.children.length-1)+48);frames.push({id:root.id,name:title,width:680,height:root.height});
}
return {createdNodeIds:ids,frames};
