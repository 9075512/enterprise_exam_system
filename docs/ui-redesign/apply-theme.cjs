// One-time migration from the saved baseline; fails on unexpected source drift.
const fs=require('fs');
function edit(file,transform){const before=fs.readFileSync(file,'utf8');const after=transform(before);if(before===after)throw Error('No changes: '+file);fs.writeFileSync(file,after);}
function replace(s,from,to){if(!s.includes(from))throw Error('Missing anchor: '+from.slice(0,70));return s.replace(from,to);}
const categories=`
// UI 2026.10：业务分类色；不替代成功、警告、错误状态。
$category-blue: #356BFA;
$category-blue-soft: #EFF4FF;
$category-teal: #138A8A;
$category-teal-soft: #EAF8F6;
$category-violet: #7A5AE8;
$category-violet-soft: #F3EFFF;
$category-amber: #B77915;
$category-amber-soft: #FFF6E7;
`;
for(const prefix of ['', 'practice-web/']){
 edit(prefix+'src/styles/variables.scss',s=>s.replaceAll('#0D1220','#15223B').replaceAll('#E9ECF1','#E3E8F0').replaceAll('#F7F8FA','#F5F7FB').replaceAll('#F4F6F9','#F5F7FB').replace('$sidebar-bg: #0b0f19','$sidebar-bg: #15223B').replace('$sidebar-text: #9aa5b8','$sidebar-text: #BBC7DC').replace('$sidebar-active-bg: rgba($color-primary, 0.16)','$sidebar-active-bg: #25436D').replace('$header-height: 52px','$header-height: 56px').replace('$page-padding: 22px','$page-padding: 24px')+categories);
 edit(prefix+'src/styles/index.scss',s=>s.replaceAll('#f7f8fa','#f5f7fb').replaceAll('#f4f6f9','#f5f7fb').replaceAll('#0d1220','#15223b').replaceAll('#e9ecf1','#e3e8f0').replace("font-family: -apple-system, 'PingFang SC', 'Microsoft YaHei', sans-serif;","font-family: 'Noto Sans SC Variable', 'PingFang SC', 'Microsoft YaHei', sans-serif;").replace('--el-card-padding: 16px','--el-card-padding: 20px').replace('padding: 12px 16px;\r\n    border-bottom-color','padding: 16px 20px;\r\n    border-bottom-color'));
 edit(prefix+'src/styles/element/index.scss',s=>replace(s,"\"'-apple-system', 'PingFang SC', 'Microsoft YaHei', sans-serif\"","\"'Noto Sans SC Variable', 'PingFang SC', 'Microsoft YaHei', sans-serif\""));
 edit(prefix+'src/main.ts',s=>"import '@fontsource-variable/noto-sans-sc';\n"+s+"\nimport './styles/ui-refinement.scss';\n");
}
edit('src/constants/theme.ts',s=>s.replaceAll('#0D1220','#15223B').replaceAll('#E9ECF1','#E3E8F0').replace('export const THEME = {',`export const THEME = {
  /** 业务分类与多指标图表配色，和状态色保持独立。 */
  categoryBlue: '#356BFA', categoryBlueSoft: '#EFF4FF',
  categoryTeal: '#138A8A', categoryTealSoft: '#EAF8F6',
  categoryViolet: '#7A5AE8', categoryVioletSoft: '#F3EFFF',
  categoryAmber: '#B77915', categoryAmberSoft: '#FFF6E7',`));
edit('src/components/common/PageHeader.vue',s=>s.replace('font-size: 19px','font-size: 22px').replace('font-size: 12.5px','font-size: 12px').replace('font-weight: 600','font-weight: 700').replace('margin-bottom: 16px','margin-bottom: 20px'));
edit('src/layouts/AppLayout.vue',s=>replace(s,'const route = useRoute();',`const route = useRoute();
const moduleTone = computed(() => {
  const path = route.path;
  if (/users|departments|home-config/.test(path)) return 'teal';
  if (/author\\/banks|content|appeals|notifications/.test(path)) return 'violet';
  if (/author\\/papers|reviews|retakes/.test(path)) return 'amber';
  return 'blue';
});
const searchShortcut = /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘ K' : 'Ctrl K';`)
 .replace('<div class="layout">','<div class="layout" :data-module-tone="moduleTone">').replace('min-width: 1280px','min-width: 0').replace('<kbd class="layout__kbd">⌘K</kbd>','<kbd class="layout__kbd">{{ searchShortcut }}</kbd>'));
edit('src/components/common/StatCard.vue',s=>s.replace("tone?: 'primary' | 'success' | 'warning' | 'error';","tone?: 'primary' | 'success' | 'warning' | 'error' | 'blue' | 'teal' | 'violet' | 'amber';").replace('font-size: 26px','font-size: 28px').replace('line-height: 1.1','line-height: 1.3'));
edit('src/views/admin/DashboardPage.vue',s=>{
 s=s.replace("icon: OfficeBuilding }","icon: OfficeBuilding, tone: 'blue' }").replace("icon: User }","icon: User, tone: 'teal' }").replace("icon: Collection }","icon: Collection, tone: 'violet' }").replace("icon: Document }","icon: Document, tone: 'amber' }");
 s=replace(s,'<el-card class="stat-card" shadow="never">','<el-card class="stat-card" :class="`stat-card--${card.tone}`" shadow="never">');
 s=s.replace('itemStyle: { color: THEME.primaryLight }','itemStyle: { color: THEME.categoryTeal }').replace('<span>考试场次趋势</span>','<span>参考人数对比</span>').replace('font-size: 26px','font-size: 28px');
 s=s.replace('<el-icon class="dashboard__todo-ic"><Flag />','<el-icon class="dashboard__todo-ic dashboard__todo-ic--violet"><Flag />').replace('<el-icon class="dashboard__todo-ic"><Refresh />','<el-icon class="dashboard__todo-ic dashboard__todo-ic--teal"><Refresh />');
 const start=s.indexOf('          <el-card v-loading="todoLoading"');const end=s.indexOf('          <el-card v-loading="alertLoading"',start);if(start<0||end<0)throw Error('todo card anchors');const todo=s.slice(start,end);s=s.slice(0,start)+s.slice(end);const marker='        <div class="dashboard__stack">';const first=s.indexOf(marker);const second=s.indexOf(marker,first+marker.length);s=s.slice(0,second+marker.length)+'\n'+todo+s.slice(second+marker.length);
 return s;
});
edit('practice-web/src/layouts/PracticeLayout.vue',s=>s.replace('padding: 14px 14px calc(24px','padding: 20px 20px calc(24px').replace('height: calc(44px','height: calc(56px'));
// Existing report charts keep their data and axes; separate the two measures visually.
for(const file of ['src/views/admin/ScoreReportPage.vue','src/views/exam/ExamHomePage.vue']){
 const s=fs.readFileSync(file,'utf8');if(s.includes('THEME.primaryLight'))edit(file,s=>s.replaceAll('THEME.primaryLight','THEME.categoryTeal'));
}
