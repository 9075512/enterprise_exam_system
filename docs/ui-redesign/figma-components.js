await figma.setCurrentPageAsync(await figma.getNodeByIdAsync(STATE.pageId));
const page=figma.currentPage;
const components={};
let y=100;
async function family(name,axes,w,h,build){
 const result=await createComponentWithVariants({name,variantAxes:axes,baseProps:{width:w,height:h,layoutMode:'HORIZONTAL'},page});
 const set=result.componentSet;track(set);set.x=1700;set.y=y;y+=set.height+60;
 for(const c of result.variants){track(c);const values=Object.fromEntries(c.name.split(', ').map(s=>s.split('=')));await build(c,values);components[name+'/'+Object.values(values).join('/')]=c.id;}
 return set;
}
await family('Button',{Style:['primary','secondary','danger'],State:['default','hover','disabled','loading']},112,36,(c,v)=>{
 space(c,12);rounded(c,6);gap(c,8);const disabled=v.State==='disabled';fill(c,disabled?'neutral':v.Style==='primary'?(v.State==='hover'?'primary-dark':'primary'):'surface');if(v.Style!=='primary')border(c,v.Style==='danger'?'error':'line-strong');
 property(c,text(c,v.State==='loading'?'处理中…':'操作','label',disabled?'text-disabled':v.Style==='primary'?'surface':v.Style==='danger'?'error':'text-body'),'Label');
 c.description='36px 默认高 / 28px 紧凑 / 44px 触控；主操作用品牌蓝，危险操作需确认。';
});
await family('Input',{State:['default','focus','error','disabled']},240,36,(c,v)=>{space(c,12);rounded(c,6);fill(c,v.State==='disabled'?'neutral':'surface');border(c,v.State==='focus'?'primary':v.State==='error'?'error':'line-strong');c.primaryAxisAlignItems='MIN';property(c,text(c,'请输入内容','table','text-secondary'),'Label');});
await family('Badge',{Tone:['primary','teal','violet','amber','error','neutral']},84,24,(c,v)=>{rounded(c,4);const k=['teal','violet','amber'].includes(v.Tone)?'category-'+v.Tone:v.Tone;fill(c,k==='neutral'?'neutral':k+'-soft');property(c,text(c,'状态标签','caption',k==='neutral'?'text-secondary':k),'Label');});
await family('Navigation',{State:['default','active']},192,38,(c,v)=>{rounded(c,6);space(c,12);fill(c,v.State==='active'?'sidebar-active':'sidebar');c.primaryAxisAlignItems='MIN';property(c,text(c,'导航菜单','label',v.State==='active'?'surface':'sidebar-text'),'Label');});
await family('StatCard',{Tone:['blue','teal','violet','amber']},274,116,(c,v)=>{c.layoutMode='VERTICAL';c.primaryAxisAlignItems='MIN';c.counterAxisAlignItems='MIN';space(c,16);gap(c,8);rounded(border(c));fill(c,'category-'+v.Tone+'-soft');property(c,text(c,'统计指标','label','text-secondary'),'Label');property(c,text(c,'128','metric'),'Value');});
await family('Option',{State:['default','selected','correct','wrong']},500,48,(c,v)=>{space(c,16);rounded(c,8);fill(c,v.State==='selected'?'primary-soft':v.State==='correct'?'success-soft':v.State==='wrong'?'error-soft':'surface');border(c,v.State==='selected'?'primary':v.State==='correct'?'success':v.State==='wrong'?'error':'line-strong');c.primaryAxisAlignItems='MIN';property(c,text(c,'A   选项内容','body','text-body'),'Label');});
await family('TableCell',{State:['heading','body']},180,48,(c,v)=>{space(c,12);fill(c,v.State==='heading'?'page':'surface');c.primaryAxisAlignItems='MIN';property(c,text(c,'表格内容',v.State==='heading'?'label':'table','text-body'),'Label');});
return {createdNodeIds:ids,components,componentFamilies:7,variantCount:Object.keys(components).length};
