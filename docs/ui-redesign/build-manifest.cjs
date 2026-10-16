const fs = require('fs');
const path = require('path');
const root = process.cwd();
const uniq = a => [...new Set(a.filter(Boolean))];
const collect = (s,re) => [...s.matchAll(re)].map(m=>m[1]);
const pages = [];
for(const app of ['', 'practice-web/']) {
  const router=fs.readFileSync(path.join(root,app,'src/router/index.ts'),'utf8');
  const re=/path:\s*'([^']+)'[\s\S]*?component:\s*\(\)\s*=>\s*import\('@\/views\/([^']+)'\)[\s\S]*?title:\s*'([^']+)'/g;
  for(const m of router.matchAll(re)){
    const source=app+'src/views/'+m[2];
    const s=fs.readFileSync(path.join(root,source),'utf8');
    const t=s.slice(s.indexOf('<template>'),s.lastIndexOf('</template>'));
    const firstTable=t.match(/<el-table\b[\s\S]*?<\/el-table>/)?.[0]||'';
    const columns=uniq(collect(firstTable,/<el-table-column\b[^>]*?\blabel="([^"]+)"/g));
    const fields=uniq(collect(t,/<el-form-item\b[^>]*?\blabel="([^"]+)"/g));
    const tabs=uniq(collect(t,/<el-tab-pane\b[^>]*?\blabel="([^"]+)"/g));
    const headings=uniq(collect(t,/<h[1-4][^>]*>([^<{]+)<\/h[1-4]>/g));
    const desc=t.match(/<PageHeader[\s\S]*?description="([^"]+)"/)?.[1]||'';
    const buttons=uniq(collect(t,/<el-button\b[^>]*>([^<{]+)<\/el-button>/g).map(x=>x.trim()));
    const tabDetails=[...t.matchAll(/<el-tab-pane\b[^>]*?\blabel="([^"]+)"[^>]*>([\s\S]*?)<\/el-tab-pane>/g)].map(x=>({title:x[1],fields:uniq(collect(x[2],/<el-form-item\b[^>]*?\blabel="([^"]+)"/g))}));
    pages.push({id:m[2].replace(/Page.vue$/,'').replaceAll('/','-')+(m[1].includes('reans')?'-reans':''),route:m[3]==='数据总览'?'/admin/dashboard':'/'+m[1].replace(/^\//,''),title:m[3],app:app?'practice':'main',source,description:desc,columns,fields,tabs,tabDetails,headings,buttons:buttons.filter(x=>!x.includes('@click'))});
  }
}
fs.writeFileSync(path.join(__dirname,'page-manifest.json'),JSON.stringify(pages,null,2));
for(const p of pages) console.log(JSON.stringify(p));
