const fs=require('fs');function edit(p,f){fs.writeFileSync(p,f(fs.readFileSync(p,'utf8')));}
edit('src/styles/ui-refinement.scss',s=>s.replaceAll('.dashboard .dashboard__todo-ic--','.dashboard.dashboard .dashboard__todo-ic--').replaceAll('.bank-card .bank-card__','.bank-card.bank-card .bank-card__'));
edit('practice-web/src/styles/ui-refinement.scss',s=>s.replaceAll('.home .home__','.home.home .home__').replaceAll('.rpt .rpt__','.rpt.rpt .rpt__'));
edit('src/styles/index.scss',s=>s.replace('min-height: 46px;','min-height: 56px;').replace('font-size: 13.5px;\r\n    font-weight: 600;','font-size: 15px;\r\n    font-weight: 600;'));
edit('src/styles/globalStyle.test.ts',s=>s.replace("['header-height', 52]","['header-height', 56]").replace("['page-padding', 22]","['page-padding', 24]").replace('成绩趋势双线走单一主色系：及格率=主色实线 + 平均分=主色浅档虚线','成绩趋势使用蓝与青绿区分指标，并保留实线/虚线区分').replace('THEME\\.primaryLight\\s*\\}','THEME\\.categoryTeal\\s*\\}').replace('页头刻度：19px 标题 / -0.01em 字距 / 底部对齐 / 12.5px 描述','页头刻度：22px 标题 / 底部对齐 / 12px 描述').replace('expect(pageHeader).toMatch(/font-size:\\s*19px/)','expect(pageHeader).toMatch(/font-size:\\s*22px/)').replace('expect(pageHeader).toMatch(/font-size:\\s*12\\.5px/)','expect(pageHeader).toMatch(/font-size:\\s*12px/)').replace('卡片刻度：内容内距 16px + 卡头 46px 最小高 / 12px 16px / 13.5px 标题','卡片刻度：内容内距 20px + 卡头 56px / 16px 20px / 15px 标题').replace('--el-card-padding:\\s*16px','--el-card-padding:\\s*20px').replace('min-height:\\s*46px','min-height:\\s*56px').replace('padding:\\s*12px 16px','padding:\\s*16px 20px').replace('expect(header).toMatch(/font-size:\\s*13\\.5px/)','expect(header).toMatch(/font-size:\\s*15px/)'));
edit('src/constants/theme.test.ts',s=>s.replace("['color-success', 'success'],",`['category-blue', 'categoryBlue'],
    ['category-blue-soft', 'categoryBlueSoft'],
    ['category-teal', 'categoryTeal'],
    ['category-teal-soft', 'categoryTealSoft'],
    ['category-violet', 'categoryViolet'],
    ['category-violet-soft', 'categoryVioletSoft'],
    ['category-amber', 'categoryAmber'],
    ['category-amber-soft', 'categoryAmberSoft'],
    ['color-success', 'success'],`));
// Explicitly synchronize the CSS names shown in Figma with runtime aliases.
const tokens=JSON.parse(fs.readFileSync('docs/ui-redesign/tokens.json','utf8'));
let css='// Generated from docs/ui-redesign/tokens.json; Figma variable code syntax.\n:root {\n';
for(const [k,v]of Object.entries(tokens))css+=`  --ui-${k}: ${v};\n`;
for(const n of [4,8,12,16,20,24,32])css+=`  --ui-space-${n}: ${n}px;\n`;
for(const n of [4,6,8,10,12])css+=`  --ui-radius-${n}: ${n}px;\n`;
css+='}\n';
for(const pre of ['', 'practice-web/']){fs.writeFileSync(pre+'src/styles/ui-tokens.scss',css);edit(pre+'src/styles/ui-refinement.scss',s=>s.replace("@use './variables.scss' as *;","@use './variables.scss' as *;\n@use './ui-tokens.scss';"));}
