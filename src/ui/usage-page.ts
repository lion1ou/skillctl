import { MANAGER_STYLES, renderManagerNav } from './manager-chrome.js';

export const USAGE_PAGE = `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <link rel="icon" href="/favicon.ico">
  <title>skill-ctl · 使用情况</title>
  <style>${MANAGER_STYLES}</style>
</head>
<body>
<main>
  ${renderManagerNav('usage')}
  <header class="page-header">
    <div>
      <h1 class="page-title">使用情况</h1>
      <p class="subtitle">统计 Cursor、Codex 与 Claude 读取 skill 文件的次数。同一次会话里的每次读取都会计入，数据只保存在本机。</p>
    </div>
  </header>
  <div class="notice" id="notice"></div>
  <div class="usage-metrics">
    <section class="panel usage-metric"><span>读取次数</span><strong id="readCount">0</strong></section>
    <section class="panel usage-metric"><span>有记录的 Skill</span><strong id="skillCount">0</strong></section>
    <section class="panel usage-metric usage-hook"><div class="usage-hook-copy"><span>Cursor hook</span><strong id="hookState">未安装</strong></div><button type="button" id="cursorHookButton" data-hook-action="install">安装</button></section>
    <section class="panel usage-metric usage-hook"><div class="usage-hook-copy"><span>Codex hook</span><strong id="codexHookState">未安装</strong></div><button type="button" id="codexHookButton" data-hook-action="install">安装</button></section>
    <section class="panel usage-metric usage-hook"><div class="usage-hook-copy"><span>Claude hook</span><strong id="claudeHookState">未安装</strong></div><button type="button" id="claudeHookButton" data-hook-action="install">安装</button></section>
  </div>
  <div class="usage-charts">
    <section class="panel">
      <h2>使用趋势</h2>
      <div class="usage-chart" id="usageTrend"></div>
    </section>
    <section class="panel">
      <h2>Skill 占比</h2>
      <div class="usage-chart" id="usageShare"></div>
    </section>
  </div>
  <section class="panel">
    <table class="usage-table">
      <colgroup><col><col class="usage-count-col"><col class="usage-time-col"><col class="usage-path-col"></colgroup>
      <thead><tr><th>Skill</th><th>次数</th><th>最近读取</th><th>路径</th></tr></thead>
      <tbody id="usageRows"><tr><td colspan="4">正在读取…</td></tr></tbody>
    </table>
  </section>
</main>
<script>
const token=__SKILLCTL_TOKEN__;
const notice=document.querySelector('#notice');
const escapeHtml=(value)=>String(value).replace(/[&<>"']/g,(char)=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
function showNotice(message,ok=false){
  notice.textContent=message;
  notice.classList.toggle('ok',ok);
  notice.classList.add('show');
}
async function request(url,options={}){
  const response=await fetch(url,{...options,headers:{'x-skillctl-token':token,'content-type':'application/json',...(options.headers||{})}});
  if(!response.ok)throw new Error(await response.text());
  return response.json();
}
function renderUsage(data){
  document.querySelector('#readCount').textContent=String(data.readCount||0);
  document.querySelector('#skillCount').textContent=String(data.skillCount||0);
  document.querySelector('#hookState').textContent=data.hookInstalled?'已安装':'未安装';
  document.querySelector('#codexHookState').textContent=data.codexHookInstalled?'已安装':'未安装';
  document.querySelector('#claudeHookState').textContent=data.claudeHookInstalled?'已安装':'未安装';
  setHookButton(document.querySelector('#cursorHookButton'),Boolean(data.hookInstalled));
  setHookButton(document.querySelector('#codexHookButton'),Boolean(data.codexHookInstalled));
  setHookButton(document.querySelector('#claudeHookButton'),Boolean(data.claudeHookInstalled));
  const rows=data.skills||[];
  renderTrend(data.daily||[]);
  renderShare(rows);
  document.querySelector('#usageRows').innerHTML=rows.length
    ?rows.map((skill)=>'<tr><td><a class="usage-skill" href="/catalog/skill?id='+encodeURIComponent(skill.name)+'">'+escapeHtml(skill.name)+'</a></td><td>'+skill.readCount+'</td><td>'+escapeHtml(formatReadTime(skill.lastReadAt))+'</td><td class="usage-path" title="'+escapeHtml(skill.path)+'">'+escapeHtml(skill.path)+'</td></tr>').join('')
    :'<tr><td colspan="4">还没有读取记录。安装记录后，读取 SKILL.md、references 或其他 skill 文件会计入这里。</td></tr>';
}
function formatReadTime(value){
  const date=new Date(value);
  if(Number.isNaN(date.getTime()))return String(value||'');
  const pad=(part)=>String(part).padStart(2,'0');
  return date.getFullYear()+'-'+pad(date.getMonth()+1)+'-'+pad(date.getDate())+' '+pad(date.getHours())+':'+pad(date.getMinutes())+':'+pad(date.getSeconds());
}
const CHART_COLORS=['#1F6C9F','#346538','#9F2F2D','#B26A2A','#5C6B73','#6E5A8A','#2F6F6A','#8A5A44'];
function renderTrend(days){
  const host=document.querySelector('#usageTrend');
  if(!days.length){
    host.innerHTML='<p class="subtitle">还没有按天的读取记录。</p>';
    return;
  }
  const width=640,height=220,left=36,right=12,top=16,bottom=28;
  const max=Math.max(...days.map((day)=>day.count),1);
  const plotW=width-left-right,plotH=height-top-bottom;
  const x=(index)=>left+(days.length===1?plotW/2:index*(plotW/(days.length-1)));
  const y=(count)=>top+plotH-(count/max)*plotH;
  const points=days.map((day,index)=>x(index)+','+y(day.count)).join(' ');
  const area=left+','+(top+plotH)+' '+points+' '+x(days.length-1)+','+(top+plotH);
  const step=Math.max(1,Math.ceil(days.length/6));
  const labels=days.map((day,index)=>index%step===0||index===days.length-1?'<text x="'+x(index)+'" y="'+(height-8)+'" text-anchor="middle" font-size="11" fill="#787774">'+day.day.slice(5)+'</text>':'').join('');
  const guideValues=[0,Math.ceil(max/2),max].filter((value,index,list)=>list.indexOf(value)===index);
  const guides=guideValues.map((value)=>'<text x="4" y="'+(y(value)+4)+'" font-size="11" fill="#787774">'+value+'</text><line x1="'+left+'" y1="'+y(value)+'" x2="'+(width-right)+'" y2="'+y(value)+'" stroke="#EAEAEA"/>').join('');
  const bars=days.map((day,index)=>{
    const barW=Math.min(28,plotW/days.length*0.55);
    const barH=Math.max(top+plotH-y(day.count),2);
    return '<rect x="'+(x(index)-barW/2)+'" y="'+y(day.count)+'" width="'+barW+'" height="'+barH+'" rx="2" fill="rgba(31,108,159,.18)"><title>'+escapeHtml(day.day)+' '+day.count+' 次</title></rect>';
  }).join('');
  const line=days.length>1?'<polygon points="'+area+'" fill="rgba(31,108,159,.08)"/><polyline points="'+points+'" fill="none" stroke="#1F6C9F" stroke-width="2" stroke-linejoin="round"/>':'';
  const dots=days.map((day,index)=>'<circle cx="'+x(index)+'" cy="'+y(day.count)+'" r="3.5" fill="#1F6C9F"><title>'+escapeHtml(day.day)+' '+day.count+' 次</title></circle>').join('');
  host.innerHTML='<svg viewBox="0 0 '+width+' '+height+'" role="img" aria-label="读取次数趋势">'+guides+bars+line+dots+labels+'</svg>';
}
function setHookButton(button,installed){
  button.textContent=installed?'卸载':'安装';
  button.dataset.hookAction=installed?'uninstall':'install';
  button.classList.toggle('ghost',installed);
}
function renderShare(skills){
  const host=document.querySelector('#usageShare');
  const ranked=skills.filter((skill)=>(skill.readCount||0)>0).slice().sort((a,b)=>(b.readCount||0)-(a.readCount||0)||String(a.name).localeCompare(String(b.name)));
  const top=ranked.slice(0,10);
  const restCount=ranked.slice(10).reduce((sum,skill)=>sum+(skill.readCount||0),0);
  const shown=restCount>0?top.concat([{name:'其他',readCount:restCount,grouped:true}]):top;
  const total=shown.reduce((sum,skill)=>sum+(skill.readCount||0),0);
  if(!total){
    host.innerHTML='<p class="subtitle">还没有占比数据。</p>';
    return;
  }
  const cx=110,cy=110,r=78;
  let angle=-Math.PI/2;
  const colorOf=(skill,index)=>skill.grouped?'#C4C3BF':CHART_COLORS[index%CHART_COLORS.length];
  const slices=shown.map((skill,index)=>{
    const portion=skill.readCount/total;
    const start=angle;
    angle+=portion*Math.PI*2;
    const fill=colorOf(skill,index);
    if(shown.length===1)return '<circle cx="'+cx+'" cy="'+cy+'" r="'+r+'" fill="'+fill+'"><title>'+escapeHtml(skill.name)+' '+skill.readCount+' 次</title></circle>';
    const x1=cx+r*Math.cos(start),y1=cy+r*Math.sin(start);
    const x2=cx+r*Math.cos(angle),y2=cy+r*Math.sin(angle);
    return '<path d="M '+cx+' '+cy+' L '+x1+' '+y1+' A '+r+' '+r+' 0 '+(portion>0.5?1:0)+' 1 '+x2+' '+y2+' Z" fill="'+fill+'"><title>'+escapeHtml(skill.name)+' '+skill.readCount+' 次</title></path>';
  }).join('');
  const legend=shown.map((skill,index)=>{
    const percent=Math.round(skill.readCount/total*1000)/10;
    return '<span><i class="usage-swatch" style="background:'+colorOf(skill,index)+'"></i><b>'+escapeHtml(skill.name)+'</b><em>'+percent+'%</em></span>';
  }).join('');
  host.innerHTML='<div class="usage-share"><svg viewBox="0 0 220 220" role="img" aria-label="Skill 使用占比">'+slices+'</svg><div class="usage-legend">'+legend+'</div></div>';
}
async function loadUsage(){
  try{
    renderUsage(await request('/api/usage'));
  }catch(error){
    showNotice(error instanceof Error?error.message:'读取使用情况失败');
  }
}
async function changeHook(action){
  try{
    renderUsage(await request('/api/usage/hook',{method:'POST',body:JSON.stringify({action})}));
    showNotice(action==='install'?'已安装 Cursor、Codex 和 Claude 读取记录':'已卸载 Cursor、Codex 和 Claude 读取记录',true);
  }catch(error){
    showNotice(error instanceof Error?error.message:'更新记录 hook 失败');
  }
}
for(const button of [document.querySelector('#cursorHookButton'),document.querySelector('#codexHookButton'),document.querySelector('#claudeHookButton')]){
  button.addEventListener('click',()=>void changeHook(button.dataset.hookAction||'install'));
}
void loadUsage();
</script>
</body>
</html>`;
