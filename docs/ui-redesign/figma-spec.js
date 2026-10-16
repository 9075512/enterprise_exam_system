await figma.setCurrentPageAsync(await figma.getNodeByIdAsync(STATE.pageId));
const p=figma.currentPage;
const doc=frame(p,'设计规范 / Foundations',1440,2800,'page');space(doc,32);gap(doc,24);
text(doc,SPEC.version,'label','primary');text(doc,SPEC.title,'display');text(doc,SPEC.principles.join('\n'),'body','text-body',1376);
const palette=frame(doc,'分类配色',1376,112,null,false);gap(palette,16);
for(const [i,tone]of ['blue','teal','violet','amber'].entries()){const n=use(palette,'StatCard/'+tone,['科室与考试','账号与学习','题库与内容','试卷与待办'][i],332);const key=Object.keys(n.componentProperties).find(k=>k.startsWith('Value#'));n.setProperties({[key]:TOKENS['category-'+tone]});}
for(let i=0;i<SPEC.sections.length;i+=2){const r=row(doc,'规范章节',1376,250);gap(r,24);r.counterAxisAlignItems='MIN';for(const s of SPEC.sections.slice(i,i+2)){const box=rounded(border(frame(r,s.title,676,250)));space(box,24);gap(box,16);text(box,s.title,'section');text(box,s.body,'body','text-body',628);}}
const showcase=frame(doc,'控件状态展示',1376,620,'surface');space(showcase,24);gap(showcase,16);text(showcase,'组件与交互状态','heading');
for(const family of ['Button','Input','Badge','Navigation','Option']){text(showcase,family,'section');const r=row(showcase,family+'状态',1328,48);gap(r,16);for(const [key]of Object.entries(COMP).filter(([k])=>k.startsWith(family+'/')).slice(0,family==='Button'?8:6)){const label=key.split('/').slice(1).join(' / ');use(r,key,label,family==='Input'?280:family==='Option'?300:undefined);}}
doc.resize(1440,doc.children.reduce((s,n)=>s+n.height,0)+doc.itemSpacing*(doc.children.length-1)+64);
return {createdNodeIds:ids,frames:[{id:doc.id,name:doc.name,width:doc.width,height:doc.height}]};
