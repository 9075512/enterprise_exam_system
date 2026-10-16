// Run in Figma Plugin API; TOKENS and collection helper are supplied by runner.
const page=figma.root.children[0];
await figma.setCurrentPageAsync(page);
page.name='01 · 设计规范与组件';
const created=[page.id];
const primitive=(await createVariableCollection('Primitives',['Value'])).collection;
const colors=(await createVariableCollection('UI Colors',['Light'])).collection;
const metrics=(await createVariableCollection('UI Metrics',['Value'])).collection;
const variables={};
for(const [name,hex] of Object.entries(TOKENS)){
  const value=figma.util.rgb(hex);
  const p=figma.variables.createVariable(name,primitive,'COLOR');p.scopes=[];p.setValueForMode(primitive.defaultModeId,value);p.setVariableCodeSyntax('WEB',`var(--palette-${name})`);
  const v=figma.variables.createVariable('color/'+name,colors,'COLOR');
  v.scopes=name.startsWith('text-')?['TEXT_FILL']:['FRAME_FILL','SHAPE_FILL','STROKE_COLOR','TEXT_FILL'];
  v.setValueForMode(colors.defaultModeId,{type:'VARIABLE_ALIAS',id:p.id});v.setVariableCodeSyntax('WEB',`var(--ui-${name})`);variables[name]=v.id;
}
for(const [name,value] of Object.entries({'space/4':4,'space/8':8,'space/12':12,'space/16':16,'space/20':20,'space/24':24,'space/32':32,'radius/4':4,'radius/6':6,'radius/8':8,'radius/10':10,'radius/12':12})){
  const v=figma.variables.createVariable(name,metrics,'FLOAT');v.scopes=[name.startsWith('space')?'GAP':'CORNER_RADIUS'];v.setValueForMode(metrics.defaultModeId,value);v.setVariableCodeSyntax('WEB',`var(--ui-${name.replace('/','-')})`);variables[name]=v.id;
}
await Promise.all(['Regular','Medium','Bold'].map(style=>figma.loadFontAsync({family:'Noto Sans SC',style})));
const styles={};
for(const [name,size,weight,line] of [['display',32,'Bold',42],['heading',22,'Bold',32],['section',16,'Medium',24],['body',14,'Regular',22],['table',13,'Regular',20],['label',13,'Medium',20],['caption',12,'Regular',18],['metric',28,'Bold',36]]){
  const s=figma.createTextStyle();s.name='UI/'+name;s.fontName={family:'Noto Sans SC',style:weight};s.fontSize=size;s.lineHeight={unit:'PIXELS',value:line};styles[name]=s.id;
}
return {createdNodeIds:created,collections:{primitive:primitive.id,colors:colors.id,metrics:metrics.id},variables,styles,font:'Noto Sans SC',pageId:page.id};
