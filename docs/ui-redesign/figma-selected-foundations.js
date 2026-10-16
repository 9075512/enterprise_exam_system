// Selected screenshot reconciliation. Existing component IDs remain stable.
await figma.setCurrentPageAsync(await figma.getNodeByIdAsync('0:1'));
const mutated=[];
const colors={'primary':'#1268FF','primary-dark':'#0754DB','primary-soft':'#EDF4FF','category-blue':'#1268FF','category-blue-soft':'#F0F5FF','category-teal':'#00AAB5','category-teal-soft':'#EFFBFC','category-violet':'#773CFF','category-violet-soft':'#F5F1FF','category-amber':'#F29309','category-amber-soft':'#FFF8EF','text-primary':'#102247','text-body':'#354D76','text-secondary':'#6B7B9D','page':'#F3F7FD','border':'#E1EAF8','sidebar':'#142848','sidebar-text':'#C6D3E8','sidebar-active':'#1268FF'};
const all=await figma.variables.getLocalVariablesAsync();
for(const [name,hex] of Object.entries(colors)){const v=all.find(v=>v.name===name);if(!v)throw Error(name);v.setValueForMode(Object.keys(v.valuesByMode)[0],figma.util.rgb(hex));mutated.push(v.id);}
for(const [key,size,weight,height] of [['heading',28,'Bold',38],['section',16,'Bold',24],['metric',34,'Bold',44]]){const s=await figma.getStyleByIdAsync(STATE.styles[key]);await figma.loadFontAsync(s.fontName);s.fontName={family:'Noto Sans SC',style:weight};s.fontSize=size;s.lineHeight={unit:'PIXELS',value:height};mutated.push(s.id);}
function icon(parent,name,color,size=24){const n=track(figma.createNodeFromSvg(ICONS[name].replace('<svg ','<svg width="24" height="24" ')));n.name='icon/'+name;parent.appendChild(n);n.resize(size,size);for(const v of n.findAllWithCriteria({types:['VECTOR']})){fill(v,color);track(v);}return n;}
for(const [tone,ic] of [['blue','OfficeBuilding'],['teal','User'],['violet','Collection'],['amber','Document']]){
 const c=COMP['StatCard/'+tone];for(const t of c.findAllWithCriteria({types:['TEXT']}))for(const s of t.getStyledTextSegments(['fontName']))await figma.loadFontAsync(s.fontName);
 const label=c.findAllWithCriteria({types:['TEXT']}).find(t=>t.componentPropertyReferences?.characters?.startsWith('Label#'));const value=c.findAllWithCriteria({types:['TEXT']}).find(t=>t.componentPropertyReferences?.characters?.startsWith('Value#'));
 c.resize(274,110);space(c,12);c.paddingLeft=24;c.paddingRight=24;gap(c,0);
 const top=row(c,'指标标题与图标',226,40);top.layoutSizingHorizontal='FILL';gap(top,16);c.insertChild(0,top);
 const tile=rounded(frame(top,'图标底色',40,40,'category-'+tone+'-soft'));tile.primaryAxisAlignItems='CENTER';tile.counterAxisAlignItems='CENTER';icon(tile,ic,'category-'+tone);
 top.appendChild(label);label.layoutSizingHorizontal='HUG';label.textAutoResize='WIDTH_AND_HEIGHT';fill(label,'text-body');label.fontSize=14;label.lineHeight={unit:'PIXELS',value:22};
 c.appendChild(value);value.textStyleId=STATE.styles.metric;value.textAutoResize='WIDTH_AND_HEIGHT';
 const strip=frame(c,'左侧分类色条',3,110,'category-'+tone);absolute(strip,0,0);c.clipsContent=true;
 mutated.push(c.id,label.id,value.id);
}
const nav=COMP['Navigation/active'];fill(nav,'primary');mutated.push(nav.id);
return {mutatedNodeIds:mutated,createdNodeIds:ids,colors,statVariants:4,componentFamilies:7,variantCount:34};
