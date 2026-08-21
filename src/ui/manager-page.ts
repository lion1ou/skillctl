import { MANAGER_STYLES, renderManagerNav } from './manager-chrome.js';

export const MANAGER_PAGE = `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>skill-ctl · 已安装 Skill</title>
  <style>${MANAGER_STYLES}</style>
</head>
<body>
<main>
  ${renderManagerNav('installed')}
  <header>
    <div>
      <h1>已安装 Skill</h1>
      <p class="subtitle">扫描用户根目录中已落地的 Agent，查看对应文件夹与 skills 目录；启停会改名 SKILL.md。可按分类安装到当前 Agent。</p>
    </div>
    <div class="summary" id="summary">正在扫描…</div>
  </header>
  <div class="notice" id="notice"></div>
  <div class="layout">
    <aside class="panel">
      <h2>本机 Agent</h2>
      <div class="list" id="agentList"></div>
      <section id="installPanel">
        <h2>安装到当前 Agent</h2>
        <p class="subtitle" id="installHint">先选择左侧 Agent。</p>
        <div class="cats" id="categoryList"></div>
        <div class="field">
          <span>安装模式</span>
          <select id="installMode"><option value="symlink">软链</option><option value="copy">复制</option></select>
        </div>
        <label class="cats"><input id="installForce" type="checkbox"><span>覆盖目标已有内容</span></label>
        <div class="actions">
          <button type="button" id="installButton" disabled>按分类安装</button>
        </div>
      </section>
    </aside>
    <section class="catalog-main">
      <div class="toolbar" style="grid-template-columns:minmax(220px,1fr) 180px">
        <input id="search" placeholder="搜索名称、描述或路径">
        <select id="status"><option value="">全部状态</option><option value="on">已启用</option><option value="off">未启用</option></select>
      </div>
      <div class="catalog-scroll">
        <section class="grid" id="grid"><div class="empty">正在读取本机 Skill…</div></section>
      </div>
    </section>
  </div>
</main>
<script>
const token=__SKILLCTL_TOKEN__;
let workspace={userRoot:'',agents:[],skills:[]};
let catalog={skills:[],categories:[]};
let currentAgent='';
let isUpdating=false;
const grid=document.querySelector('#grid');
const summary=document.querySelector('#summary');
const notice=document.querySelector('#notice');
const search=document.querySelector('#search');
const status=document.querySelector('#status');
const agentList=document.querySelector('#agentList');
const categoryList=document.querySelector('#categoryList');
const installHint=document.querySelector('#installHint');
const installButton=document.querySelector('#installButton');
const escapeHtml=(value)=>String(value).replace(/[&<>"']/g,(char)=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));

function showNotice(message,ok=false){
  notice.textContent=message;
  notice.classList.toggle('ok',ok);
  notice.classList.add('show');
}
function clearNotice(){notice.classList.remove('show','ok')}
function selectedAgent(){return workspace.agents.find((agent)=>agent.id===currentAgent)}
function agentSkills(){return workspace.skills.filter((skill)=>skill.target===currentAgent)}
function selectedCategoryIds(){
  const boxes=[...document.querySelectorAll('#categoryList input')];
  if(boxes.length>0) return boxes.filter((input)=>input.checked).map((input)=>input.value);
  return (catalog.categories||[]).map((category)=>category.id);
}

function renderAgents(){
  if(workspace.agents.length===0){
    agentList.innerHTML='<div class="empty">未识别到已知 Agent</div>';
    return;
  }
  agentList.innerHTML=workspace.agents.map((agent)=>{
    const detected=agent.detected?'已检测到':'未落地';
    return '<button type="button" data-agent="'+escapeHtml(agent.id)+'" class="'+(agent.id===currentAgent?'active ':'')+(agent.detected?'':'missing')+'"><div>'+escapeHtml(agent.id)+' · '+agent.skillCount+' 个 skill · '+detected+'</div><span class="meta">'+escapeHtml(agent.agentPath)+'<br>skills：'+escapeHtml(agent.skillsPath)+'</span></button>';
  }).join('');
}

function renderInstall(){
  const agent=selectedAgent();
  const cats=catalog.categories||[];
  installButton.disabled=!agent||cats.length===0||isUpdating;
  if(!agent){installHint.textContent='先选择左侧 Agent。';categoryList.innerHTML='';return}
  if(cats.length===0){installHint.textContent='配置表不可用或没有分类，无法安装。';categoryList.innerHTML='';installButton.disabled=true;return}
  installHint.textContent='安装到 '+agent.id+' 的 '+agent.skillsDir+'。只安装所选分类里已启用的 skill。';
  const checked=new Set(selectedCategoryIds());
  categoryList.innerHTML=cats.map((category)=>{
    const count=category.skillIds.length;
    return '<label><input type="checkbox" value="'+escapeHtml(category.id)+'" '+(checked.has(category.id)?'checked':'')+'><span>'+escapeHtml(category.name)+' · '+count+'</span></label>';
  }).join('');
}

function renderSkills(){
  const keyword=search.value.trim().toLowerCase();
  const skills=agentSkills().filter((skill)=>{
    const matchesKeyword=!keyword||[skill.name,skill.description,skill.installedPath,skill.target].some((value)=>String(value).toLowerCase().includes(keyword));
    const matchesStatus=!status.value||(status.value==='on')===skill.isEnabled;
    return matchesKeyword&&matchesStatus;
  });
  const agent=selectedAgent();
  const detectedCount=workspace.agents.filter((item)=>item.detected).length;
  const enabledCount=workspace.skills.filter((skill)=>skill.isEnabled).length;
  summary.innerHTML='用户根目录 '+escapeHtml(workspace.userRoot)+'<br><strong>'+detectedCount+'</strong> 个已检测到 Agent · <strong>'+workspace.skills.length+'</strong> 个已安装 · <strong>'+enabledCount+'</strong> 个启用';
  if(!agent){grid.innerHTML='<div class="empty">请选择左侧 Agent，查看其 skills 目录中的已安装 Skill</div>';return}
  if(skills.length===0){grid.innerHTML='<div class="empty">'+escapeHtml(agent.id)+' 的 '+escapeHtml(agent.skillsPath)+' 中没有符合条件的 Skill</div>';return}
  grid.innerHTML=skills.map((skill)=>\`
    <article class="card">
      <div class="card-head"><div class="name">\${escapeHtml(skill.name)}</div><span class="badge \${skill.isEnabled?'on':'off'}">\${skill.isEnabled?'已启用':'未启用'}</span></div>
      <div class="badges"><span class="badge \${escapeHtml(skill.target)}">\${escapeHtml(skill.target)}</span><span class="badge \${skill.isSymlink?'symlink':'copy'}">\${skill.isSymlink?'软链':'复制'}</span></div>
      <p class="description readonly" title="\${escapeHtml(skill.description)}">\${escapeHtml(skill.description)}</p>
      \${skill.isSymlink?'<p class="symlink-note">切换会改软链源，并影响同源链接</p>':''}
      <p class="path">\${escapeHtml(skill.installedPath)}</p>
      \${skill.linkTarget?'<p class="path">来源 '+escapeHtml(skill.linkTarget)+'</p>':''}
      <button class="\${skill.isEnabled?'disable':''}" data-id="\${escapeHtml(skill.id)}">\${skill.isEnabled?'禁用':'启用'}</button>
    </article>\`).join('');
}

function render(){
  renderAgents();
  renderInstall();
  renderSkills();
}

function applyWorkspace(next){
  workspace={userRoot:next.userRoot||'',agents:next.agents||[],skills:next.skills||[]};
  if(!workspace.agents.some((agent)=>agent.id===currentAgent)){
    currentAgent=(workspace.agents.find((agent)=>agent.detected&&agent.skillCount>0)||workspace.agents.find((agent)=>agent.detected)||workspace.agents[0]||{}).id||'';
  }
}

async function request(url,options={}){
  const response=await fetch(url,{...options,headers:{'x-skillctl-token':token,'content-type':'application/json',...(options.headers||{})}});
  if(!response.ok)throw new Error(await response.text());
  return response.json();
}

async function loadCatalog(){
  try{
    const data=await request('/api/catalog');
    catalog=data.catalog||{skills:[],categories:[]};
  }catch{
    catalog={skills:[],categories:[]};
  }
}

async function loadSkills(showError=true){
  if(isUpdating)return;
  try{
    applyWorkspace(await request('/api/skills'));
    if(showError) clearNotice();
    render();
  }catch(error){
    if(showError) showNotice(error instanceof Error?error.message:'扫描失败');
  }
}

agentList.addEventListener('click',(event)=>{
  const button=event.target.closest('button[data-agent]');
  if(!button)return;
  currentAgent=button.dataset.agent;
  render();
});

grid.addEventListener('click',async(event)=>{
  const button=event.target.closest('button[data-id]');
  if(!button||isUpdating)return;
  const skill=workspace.skills.find((item)=>item.id===button.dataset.id);
  if(!skill)return;
  if(skill.isSymlink&&!confirm('这是软链 Skill，切换会修改源目录并影响其他同源链接。继续吗？'))return;
  isUpdating=true;button.disabled=true;
  try{
    applyWorkspace(await request('/api/skills/toggle',{method:'PATCH',body:JSON.stringify({target:skill.target,relativeDir:skill.relativeDir,isEnabled:!skill.isEnabled})}));
    clearNotice();
    render();
  }catch(error){
    showNotice(error instanceof Error?error.message:'切换失败');
  }finally{isUpdating=false;button.disabled=false}
});

installButton.addEventListener('click',async()=>{
  const agent=selectedAgent();
  const categoryIds=selectedCategoryIds();
  if(!agent||isUpdating)return;
  if(categoryIds.length===0){showNotice('请至少选择一个分类');return}
  if(!confirm('将所选分类安装到 '+agent.id+'（'+agent.skillsPath+'）。继续吗？'))return;
  isUpdating=true;installButton.disabled=true;
  try{
    const data=await request('/api/skills/install',{method:'POST',body:JSON.stringify({target:agent.id,categoryIds,mode:document.querySelector('#installMode').value,force:document.querySelector('#installForce').checked})});
    applyWorkspace(data);
    const skipped=data.install?.skippedDisabled||[];
    const items=data.install?.items||[];
    const created=items.filter((item)=>item.status!=='skipped').length;
    const skippedItems=items.filter((item)=>item.status==='skipped').length;
    showNotice('已处理 '+created+' 个，跳过 '+skippedItems+' 个'+(skipped.length?'；配置表未启用：'+skipped.join(', '):''),true);
    render();
  }catch(error){
    showNotice(error instanceof Error?error.message:'安装失败');
  }finally{isUpdating=false;render()}
});

[search,status].forEach((element)=>element.addEventListener('input',renderSkills));
Promise.all([loadSkills(),loadCatalog()]).then(render);
setInterval(()=>loadSkills(false),3000);
</script>
</body>
</html>`;
