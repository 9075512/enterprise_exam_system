// Shared helpers: node hierarchy, tokens and type styles stay editable.
const ids=[];
const V={};
for(const [key,id] of Object.entries(STATE.variables))V[key]=await figma.variables.getVariableByIdAsync(id);
await Promise.all(['Regular','Medium','Bold'].map(style=>figma.loadFontAsync({family:'Noto Sans SC',style})));
const track=n=>(ids.push(n.id),n);
function paint(key){return figma.variables.setBoundVariableForPaint({type:'SOLID',color:{r:0,g:0,b:0}},'color',V[key]);}
function fill(n,key){n.fills=key?[paint(key)]:[];return n;}
function border(n,key='border'){n.strokes=[paint(key)];n.strokeWeight=1;return n;}
function space(n,size=16){for(const k of ['paddingTop','paddingBottom','paddingLeft','paddingRight']){n[k]=size;if(V['space/'+size])n.setBoundVariable(k,V['space/'+size]);}return n;}
function rounded(n,size=8){n.cornerRadius=size;n.setBoundVariable('cornerRadius',V['radius/'+size]);return n;}
function gap(n,size){n.itemSpacing=size;if(V['space/'+size])n.setBoundVariable('itemSpacing',V['space/'+size]);return n;}
function frame(parent,name,w,h,color='surface',vertical=true){const existing=parent.type==='PAGE'?parent.children.find(x=>x.name===name):null;const n=track(existing||figma.createAutoLayout(vertical?'VERTICAL':'HORIZONTAL'));n.layoutMode=vertical?'VERTICAL':'HORIZONTAL';n.name=name;n.resize(w,h);n.primaryAxisSizingMode='FIXED';n.counterAxisSizingMode='FIXED';fill(n,color);if(!existing)parent.appendChild(n);n.clipsContent=false;return n;}
function text(parent,value,style='body',color='text-primary',width){const n=track(figma.createText());n.name=String(value).slice(0,50);n.fontName={family:'Noto Sans SC',style:'Regular'};n.textStyleId=STATE.styles[style];n.characters=String(value);fill(n,color);parent.appendChild(n);if(width){n.resize(width,22);n.textAutoResize='HEIGHT';}return n;}
function absolute(n,x,y){n.layoutPositioning='ABSOLUTE';n.x=x;n.y=y;return n;}
function property(c,n,name){const owner=c.parent?.type==='COMPONENT_SET'?c.parent:c;const existing=Object.keys(owner.componentPropertyDefinitions).find(k=>k.startsWith(name+'#'));const id=existing||owner.addComponentProperty(name,'TEXT',n.characters);n.componentPropertyReferences={characters:id};return id;}
function use(parent,key,label,w){const c=COMP[key];if(!c)throw Error('Missing '+key);const n=track(c.createInstance());parent.appendChild(n);if(label!==undefined){const prop=Object.keys(n.componentProperties).find(k=>k.startsWith('Label#'));if(prop)n.setProperties({[prop]:String(label)});}if(w)n.resize(w,n.height);n.layoutSizingHorizontal='FIXED';n.layoutSizingVertical='FIXED';return n;}
function row(parent,name,w,h=36){const n=frame(parent,name,w,h,null,false);gap(n,8);n.counterAxisAlignItems='CENTER';return n;}
function panel(parent,title,w,h){const n=rounded(border(frame(parent,title,w,h)));space(n,20);gap(n,16);text(n,title,'section');return n;}
const COMP={};
if(STATE.components)for(const [k,id]of Object.entries(STATE.components))COMP[k]=await figma.getNodeByIdAsync(id);
