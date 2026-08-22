import { MANAGER_STYLES, renderManagerNav } from './manager-chrome.js';

/** 将本机绝对路径压缩为适合卡片展示的短路径。 */
export function abbreviateSkillPath(path: string, workspaceRoot: string, homeRoot: string): string {
  const normalizedPath = path.replaceAll('\\', '/');
  const normalizedWorkspace = workspaceRoot.replaceAll('\\', '/').replace(/\/+$/, '');
  const normalizedHome = homeRoot.replaceAll('\\', '/').replace(/\/+$/, '');
  let abbreviated = normalizedPath;

  if (normalizedWorkspace && normalizedPath.startsWith(`${normalizedWorkspace}/`)) {
    abbreviated = `./${normalizedPath.slice(normalizedWorkspace.length + 1)}`;
  } else if (normalizedHome && normalizedPath.startsWith(`${normalizedHome}/`)) {
    abbreviated = `~/${normalizedPath.slice(normalizedHome.length + 1)}`;
  }
  if (abbreviated.length <= 48) return abbreviated;

  const prefix = abbreviated.startsWith('~/') ? '~/' : abbreviated.startsWith('./') ? './' : '/';
  const parts = abbreviated.slice(prefix.length).split('/').filter(Boolean);
  if (parts.length <= 4) return abbreviated;
  return `${prefix}${parts[0]}/…/${parts.slice(-2).join('/')}`;
}

export const MANAGER_PAGE = `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <link rel="icon" href="/favicon.ico">
  <title>skill-ctl · 安装管理</title>
  <style>${MANAGER_STYLES}</style>
</head>
<body>
<main>
  ${renderManagerNav('installed')}
  <header class="page-header">
    <div>
      <h1 class="page-title">安装管理</h1>
      <p class="subtitle">管理 Workspace、Agent 目录与已安装 Skill，包括安装、启停和安全删除。</p>
    </div>
    <div class="summary" id="summary">正在扫描…</div>
  </header>
  <div class="notice" id="notice"></div>
  <div class="workspace-bar">
    <div class="workspace-tabs" id="workspaceTabs"></div>
    <button type="button" class="positive" id="addWorkspaceButton">新增</button>
  </div>
  <div class="layout">
    <aside class="panel">
      <div class="panel-heading">
        <h2>Agent</h2>
        <button type="button" class="ghost" id="addAgentButton">新增</button>
      </div>
      <div class="list" id="agentList"></div>
    </aside>
    <section class="catalog-main">
      <div class="toolbar installed-toolbar">
        <input id="search" placeholder="搜索 Skill">
        <select id="status"><option value="">全部状态</option><option value="on">已启用</option><option value="off">未启用</option></select>
        <button type="button" id="installButton" disabled>安装</button>
      </div>
      <div class="catalog-scroll">
        <section class="grid" id="grid"><div class="empty">正在读取本机 Skill…</div></section>
      </div>
    </section>
  </div>
  <dialog id="workspaceDialog">
    <form method="dialog">
      <h2>新增 Workspace</h2>
      <p class="subtitle">选择或输入要管理的项目根目录。各 Agent 的 Skill 会从该目录下对应子目录读取。</p>
      <div class="field"><span>绝对路径</span><input id="workspacePath" placeholder="/absolute/path/to/workspace"></div>
      <div class="dialog-actions">
        <button type="button" class="ghost" id="pickWorkspaceButton">选择目录</button>
        <button type="button" id="saveWorkspaceButton">新增</button>
        <button type="submit" class="ghost">取消</button>
      </div>
    </form>
  </dialog>
  <dialog id="agentDialog">
    <form method="dialog">
      <h2>新增 Agent</h2>
      <p class="subtitle">可搜索并批量固定；不会预先创建 Agent 目录。</p>
      <div class="field"><span>搜索</span><input id="agentSearch" placeholder="搜索 Agent 或目录"></div>
      <div class="choice-list" id="agentTargetList"></div>
      <div class="dialog-actions">
        <button type="button" id="saveAgentButton">新增</button>
        <button type="submit" class="ghost">取消</button>
      </div>
    </form>
  </dialog>
  <dialog id="installDialog">
    <form method="dialog">
      <h2>按分类安装</h2>
      <p class="subtitle" id="installHint"></p>
      <div class="cats" id="categoryList"></div>
      <div class="field">
        <span>安装模式</span>
        <select id="installMode"><option value="symlink">软链</option><option value="copy">复制</option></select>
      </div>
      <label class="check-row"><input id="installForce" type="checkbox"><span>覆盖目标已有内容</span></label>
      <div class="dialog-actions">
        <button type="button" id="confirmInstallButton">确认安装</button>
        <button type="submit" class="ghost">取消</button>
      </div>
    </form>
  </dialog>
  <dialog id="confirmDialog">
    <form method="dialog">
      <h2 id="confirmTitle">确认操作</h2>
      <p class="subtitle" id="confirmMessage"></p>
      <p class="confirm-detail" id="confirmDetail"></p>
      <div class="dialog-actions">
        <button type="submit" class="ghost" value="cancel">取消</button>
        <button type="button" class="danger" id="confirmActionButton">确认</button>
      </div>
    </form>
  </dialog>
</main>
<script>
const token=__SKILLCTL_TOKEN__;
let manager={workspaces:[],targets:[]};
let workspace={workspaceRoot:'',agents:[],skills:[]};
let catalog={skills:[],categories:[]};
let currentWorkspace='';
let currentAgent='';
let isUpdating=false;
const grid=document.querySelector('#grid');
const summary=document.querySelector('#summary');
const notice=document.querySelector('#notice');
const search=document.querySelector('#search');
const status=document.querySelector('#status');
const agentList=document.querySelector('#agentList');
const workspaceTabs=document.querySelector('#workspaceTabs');
const workspaceDialog=document.querySelector('#workspaceDialog');
const agentDialog=document.querySelector('#agentDialog');
const confirmDialog=document.querySelector('#confirmDialog');
const installDialog=document.querySelector('#installDialog');
const categoryList=document.querySelector('#categoryList');
const installHint=document.querySelector('#installHint');
const installButton=document.querySelector('#installButton');
const confirmInstallButton=document.querySelector('#confirmInstallButton');
let confirmAction=null;
const escapeHtml=(value)=>String(value).replace(/[&<>"']/g,(char)=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const abbreviateSkillPath=${abbreviateSkillPath.toString()};

function showNotice(message,ok=false){
  notice.textContent=message;
  notice.classList.toggle('ok',ok);
  notice.classList.add('show');
}
function clearNotice(){notice.classList.remove('show','ok')}
function askConfirmation({title,message,detail,action}){
  document.querySelector('#confirmTitle').textContent=title;
  document.querySelector('#confirmMessage').textContent=message;
  document.querySelector('#confirmDetail').textContent=detail||'';
  confirmAction=action;
  confirmDialog.showModal();
}
function selectedWorkspace(){return manager.workspaces.find((item)=>item.path===currentWorkspace)}
function selectedAgent(){return workspace.agents.find((agent)=>agent.id===currentAgent)}
function agentSkills(){return workspace.skills.filter((skill)=>skill.target===currentAgent)}
function visibleAgents(){
  const pinned=new Set(selectedWorkspace()?.pinnedTargetIds||[]);
  return workspace.agents.filter((agent)=>agent.skillCount>0||pinned.has(agent.id));
}
function selectedCategoryIds(){
  const boxes=[...document.querySelectorAll('#categoryList input')];
  return boxes.filter((input)=>input.checked).map((input)=>input.value);
}

function workspaceLabel(item,index){
  if(index===0) return '用户根目录';
  const parts=String(item.path).split(/[\\\\/]/).filter(Boolean);
  return parts.at(-1)||item.path;
}
function renderWorkspaces(){
  workspaceTabs.innerHTML=manager.workspaces.map((item,index)=>{
    const active=item.path===currentWorkspace?' active':'';
    const remove=index===0||item.path!==currentWorkspace?'':'<button type="button" class="corner-delete" data-remove-workspace="'+escapeHtml(item.path)+'" title="删除 Workspace 管理记录" aria-label="删除 '+escapeHtml(workspaceLabel(item,index))+'">×</button>';
    return '<div class="workspace-tab-wrap'+active+'"><button type="button" class="workspace-tab'+active+'" data-workspace="'+escapeHtml(item.path)+'" title="'+escapeHtml(item.path)+'">'+escapeHtml(workspaceLabel(item,index))+'</button>'+remove+'</div>';
  }).join('');
}

function renderAgents(){
  const agents=visibleAgents();
  if(agents.length===0){
    agentList.innerHTML='<div class="empty compact">暂无包含 Skill 或已固定的 Agent</div>';
    return;
  }
  agentList.innerHTML=agents.map((agent)=>{
    const detected=agent.detected?'已检测到':'未落地';
    const shortPath='…/'+agent.skillsDir;
    const remove=agent.id===currentAgent?'<button type="button" class="corner-delete" data-delete-agent="'+escapeHtml(agent.id)+'" title="删除 Agent Skill" aria-label="删除 '+escapeHtml(agent.id)+'">×</button>':'';
    return '<div class="agent-row"><button type="button" data-agent="'+escapeHtml(agent.id)+'" class="'+(agent.id===currentAgent?'active ':'')+(agent.detected?'':'missing')+'"><div>'+escapeHtml(agent.id)+' · '+agent.skillCount+' 个 skill · '+detected+'</div><span class="meta" title="'+escapeHtml(agent.skillsPath)+'">'+escapeHtml(shortPath)+'</span></button>'+remove+'</div>';
  }).join('');
}

function renderInstall(){
  const agent=selectedAgent();
  const cats=catalog.categories||[];
  installButton.disabled=!agent||cats.length===0||isUpdating;
  confirmInstallButton.disabled=!agent||cats.length===0||isUpdating;
  if(!agent){installHint.textContent='先选择左侧 Agent。';categoryList.innerHTML='';return}
  if(cats.length===0){installHint.textContent='配置表不可用或没有分类，无法安装。';categoryList.innerHTML='';return}
  installHint.textContent='安装到 '+currentWorkspace+' 下 '+agent.skillsDir+'。只安装所选分类里已启用的 skill。';
  if(installDialog.open)return;
  categoryList.innerHTML=cats.map((category)=>{
    const count=category.skillIds.length;
    return '<label><input type="checkbox" value="'+escapeHtml(category.id)+'"><span>'+escapeHtml(category.name)+' · '+count+'</span></label>';
  }).join('');
}

function renderSkills(resetScroll=false){
  const keyword=search.value.trim().toLowerCase();
  const skills=agentSkills().filter((skill)=>{
    const matchesKeyword=!keyword||[skill.name,skill.description,skill.installedPath,skill.target].some((value)=>String(value).toLowerCase().includes(keyword));
    const matchesStatus=!status.value||(status.value==='on')===skill.isEnabled;
    return matchesKeyword&&matchesStatus;
  });
  const agent=selectedAgent();
  const detectedCount=visibleAgents().filter((item)=>item.detected).length;
  const enabledCount=workspace.skills.filter((skill)=>skill.isEnabled).length;
  summary.innerHTML=escapeHtml(currentWorkspace)+'<br><strong>'+detectedCount+'</strong> 个已检测到 Agent · <strong>'+workspace.skills.length+'</strong> 个已安装 · <strong>'+enabledCount+'</strong> 个启用';
  const catalogScroll=document.querySelector('.catalog-scroll');
  if(!agent){grid.innerHTML='<div class="empty">请选择左侧 Agent，查看其 skills 目录中的已安装 Skill</div>';if(resetScroll)catalogScroll.scrollTop=0;return}
  if(skills.length===0){grid.innerHTML='<div class="empty">'+escapeHtml(agent.id)+' 的 '+escapeHtml(agent.skillsPath)+' 中没有符合条件的 Skill</div>';if(resetScroll)catalogScroll.scrollTop=0;return}
  const homeRoot=manager.workspaces[0]?.path||'';
  grid.innerHTML=skills.map((skill)=>{
    const installedPath=abbreviateSkillPath(skill.installedPath,currentWorkspace,homeRoot);
    const linkTarget=skill.linkTarget?abbreviateSkillPath(skill.linkTarget,currentWorkspace,homeRoot):'';
    return \`
    <article class="card clickable" data-installed-skill="\${escapeHtml(skill.id)}" tabindex="0">
      <div class="card-head"><div class="name">\${escapeHtml(skill.name)}</div><span class="badge \${skill.isEnabled?'on':'off'}">\${skill.isEnabled?'已启用':'未启用'}</span></div>
      <div class="badges">\${skill.target==='agents'?'':'<span class="badge '+escapeHtml(skill.target)+'">'+escapeHtml(skill.target)+'</span>'}<span class="badge \${skill.isSymlink?'symlink':'copy'}">\${skill.isSymlink?'软链':'复制'}</span></div>
      <p class="description readonly" title="\${escapeHtml(skill.description)}">\${escapeHtml(skill.description)}</p>
      \${skill.isSymlink?'<p class="symlink-note">切换会改软链源，并影响同源链接</p>':''}
      <p class="path" title="\${escapeHtml(skill.installedPath)}">\${escapeHtml(installedPath)}</p>
      \${skill.linkTarget?'<p class="path" title="'+escapeHtml(skill.linkTarget)+'">来源 '+escapeHtml(linkTarget)+'</p>':''}
      <button class="\${skill.isEnabled?'disable':''}" data-id="\${escapeHtml(skill.id)}">\${skill.isEnabled?'禁用':'启用'}</button>
    </article>\`;
  }).join('');
  if(resetScroll)catalogScroll.scrollTop=0;
}

function render(resetScroll=false){
  renderWorkspaces();
  renderAgents();
  renderInstall();
  renderSkills(resetScroll);
}

function applyWorkspace(next){
  workspace={workspaceRoot:next.workspaceRoot||'',agents:next.agents||[],skills:next.skills||[]};
  if(!visibleAgents().some((agent)=>agent.id===currentAgent)){
    currentAgent=(visibleAgents().find((agent)=>agent.skillCount>0)||visibleAgents()[0]||{}).id||'';
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

async function loadManager(){
  manager=await request('/api/workspaces');
  if(!manager.workspaces.some((item)=>item.path===currentWorkspace)){
    currentWorkspace=manager.workspaces[0]?.path||'';
    currentAgent='';
  }
}

async function loadSkills(showError=true,force=false,resetScroll=false){
  if((isUpdating&&!force)||!currentWorkspace)return;
  try{
    applyWorkspace(await request('/api/skills?workspace='+encodeURIComponent(currentWorkspace)));
    if(showError) clearNotice();
    render(resetScroll);
  }catch(error){
    if(showError) showNotice(error instanceof Error?error.message:'扫描失败');
  }
}

agentList.addEventListener('click',(event)=>{
  const remove=event.target.closest('button[data-delete-agent]');
  if(remove&&!isUpdating){
    const agent=workspace.agents.find((item)=>item.id===remove.dataset.deleteAgent);
    if(!agent)return;
    askConfirmation({
      title:'删除 '+agent.id+' 的 Skill',
      message:'将删除当前 Workspace 中该 Agent 的 skills 目录，并取消固定。',
      detail:agent.skillsPath+' · '+agent.skillCount+' 个 Skill。此操作不可恢复；若目录本身为软链接，只会删除链接。',
      action:()=>removeAgent(agent.id),
    });
    return;
  }
  const button=event.target.closest('button[data-agent]');
  if(!button)return;
  currentAgent=button.dataset.agent;
  render(true);
});

grid.addEventListener('click',async(event)=>{
  const button=event.target.closest('button[data-id]');
  if(button){
    if(isUpdating)return;
    const skill=workspace.skills.find((item)=>item.id===button.dataset.id);
    if(!skill)return;
    if(skill.isSymlink&&!confirm('这是软链 Skill，切换会修改源目录并影响其他同源链接。继续吗？'))return;
    isUpdating=true;button.disabled=true;
    try{
      applyWorkspace(await request('/api/skills/toggle',{method:'PATCH',body:JSON.stringify({workspace:currentWorkspace,target:skill.target,relativeDir:skill.relativeDir,isEnabled:!skill.isEnabled})}));
      clearNotice();
      render(false);
    }catch(error){
      showNotice(error instanceof Error?error.message:'切换失败');
    }finally{isUpdating=false;button.disabled=false}
    return;
  }
  const card=event.target.closest('[data-installed-skill]');
  if(!card||event.target.closest('button'))return;
  const skill=workspace.skills.find((item)=>item.id===card.dataset.installedSkill);
  if(!skill)return;
  location.href='/skill?from=installed&workspace='+encodeURIComponent(currentWorkspace)+'&target='+encodeURIComponent(skill.target)+'&relativeDir='+encodeURIComponent(skill.relativeDir);
});
grid.addEventListener('keydown',(event)=>{
  const card=event.target.closest('[data-installed-skill]');
  if(card&&!event.target.closest('button')&&(event.key==='Enter'||event.key===' ')){
    event.preventDefault();
    card.click();
  }
});

installButton.addEventListener('click',()=>{
  renderInstall();
  installDialog.showModal();
});

confirmInstallButton.addEventListener('click',async()=>{
  const agent=selectedAgent();
  const categoryIds=selectedCategoryIds();
  if(!agent||isUpdating)return;
  if(categoryIds.length===0){showNotice('请至少选择一个分类');return}
  isUpdating=true;confirmInstallButton.disabled=true;
  try{
    const data=await request('/api/skills/install',{method:'POST',body:JSON.stringify({workspace:currentWorkspace,target:agent.id,categoryIds,mode:document.querySelector('#installMode').value,force:document.querySelector('#installForce').checked})});
    applyWorkspace(data);
    const skipped=data.install?.skippedDisabled||[];
    const items=data.install?.items||[];
    const created=items.filter((item)=>item.status!=='skipped').length;
    const skippedItems=items.filter((item)=>item.status==='skipped').length;
    showNotice('已处理 '+created+' 个，跳过 '+skippedItems+' 个'+(skipped.length?'；配置表未启用：'+skipped.join(', '):''),true);
    installDialog.close();
    render(false);
  }catch(error){
    showNotice(error instanceof Error?error.message:'安装失败');
  }finally{isUpdating=false;render(false)}
});

async function replaceManager(data){
  manager=data;
  if(!manager.workspaces.some((item)=>item.path===currentWorkspace)){
    currentWorkspace=manager.workspaces[0]?.path||'';
    currentAgent='';
  }
  await loadSkills(true,true,true);
}

workspaceTabs.addEventListener('click',async(event)=>{
  const remove=event.target.closest('button[data-remove-workspace]');
  if(remove&&!isUpdating){
    const path=remove.dataset.removeWorkspace;
    askConfirmation({
      title:'删除 Workspace',
      message:'从 skill-ctl 管理列表删除此 Workspace？',
      detail:path+'。项目及其中所有文件都会保留。',
      action:()=>removeWorkspace(path),
    });
    return;
  }
  const button=event.target.closest('button[data-workspace]');
  if(!button||button.dataset.workspace===currentWorkspace)return;
  currentWorkspace=button.dataset.workspace;
  currentAgent='';
  await loadSkills(true,false,true);
});

document.querySelector('#addWorkspaceButton').addEventListener('click',()=>{
  document.querySelector('#workspacePath').value='';
  workspaceDialog.showModal();
});

document.querySelector('#pickWorkspaceButton').addEventListener('click',async()=>{
  if(isUpdating)return;
  isUpdating=true;
  try{
    const data=await request('/api/workspaces/pick',{method:'POST',body:'{}'});
    if(!data.selectedWorkspace)return;
    currentWorkspace=data.selectedWorkspace;
    currentAgent='';
    await replaceManager(data);
    workspaceDialog.close();
  }catch(error){
    showNotice(error instanceof Error?error.message:'目录选择失败');
  }finally{isUpdating=false;render()}
});

document.querySelector('#saveWorkspaceButton').addEventListener('click',async()=>{
  const path=document.querySelector('#workspacePath').value.trim();
  if(!path){showNotice('请输入 Workspace 绝对路径');return}
  isUpdating=true;
  try{
    const data=await request('/api/workspaces',{method:'POST',body:JSON.stringify({path})});
    currentWorkspace=data.selectedWorkspace||currentWorkspace;
    currentAgent='';
    await replaceManager(data);
    workspaceDialog.close();
  }catch(error){
    showNotice(error instanceof Error?error.message:'Workspace 添加失败');
  }finally{isUpdating=false;render()}
});

async function removeWorkspace(path){
  if(!path||manager.workspaces[0]?.path===path||isUpdating)return;
  isUpdating=true;
  try{
    await replaceManager(await request('/api/workspaces?path='+encodeURIComponent(path),{method:'DELETE'}));
    clearNotice();
  }catch(error){
    showNotice(error instanceof Error?error.message:'Workspace 删除失败');
  }finally{isUpdating=false;render()}
}

async function removeAgent(target){
  if(!currentWorkspace||isUpdating)return;
  isUpdating=true;
  try{
    currentAgent='';
    applyWorkspace(await request('/api/skills/agent',{method:'DELETE',body:JSON.stringify({workspace:currentWorkspace,target})}));
    await loadManager();
    render(true);
    clearNotice();
  }catch(error){
    showNotice(error instanceof Error?error.message:'Agent 删除失败');
  }finally{isUpdating=false;render(true)}
}

document.querySelector('#confirmActionButton').addEventListener('click',async()=>{
  const action=confirmAction;
  confirmAction=null;
  confirmDialog.close();
  if(action)await action();
});

document.querySelector('#addAgentButton').addEventListener('click',()=>{
  const pinned=new Set(selectedWorkspace()?.pinnedTargetIds||[]);
  const candidates=manager.targets.filter((target)=>!pinned.has(target.id));
  document.querySelector('#agentSearch').value='';
  renderAgentChoices(candidates);
  document.querySelector('#saveAgentButton').disabled=candidates.length===0;
  agentDialog.showModal();
});

function renderAgentChoices(candidates){
  const keyword=document.querySelector('#agentSearch').value.trim().toLowerCase();
  const filtered=candidates.filter((target)=>!keyword||target.id.toLowerCase().includes(keyword)||target.skillsDir.toLowerCase().includes(keyword));
  document.querySelector('#agentTargetList').innerHTML=filtered.map((target)=>'<label><input type="checkbox" name="agentTarget" value="'+escapeHtml(target.id)+'"><span><strong>'+escapeHtml(target.id)+'</strong><small>'+escapeHtml(target.skillsDir)+'</small></span></label>').join('')||'<div class="empty compact">没有匹配的 Agent</div>';
}

document.querySelector('#agentSearch').addEventListener('input',()=>{
  const pinned=new Set(selectedWorkspace()?.pinnedTargetIds||[]);
  renderAgentChoices(manager.targets.filter((target)=>!pinned.has(target.id)));
});

document.querySelector('#saveAgentButton').addEventListener('click',async()=>{
  const targets=[...document.querySelectorAll('input[name="agentTarget"]:checked')].map((input)=>input.value);
  if(targets.length===0){showNotice('请至少选择一个 Agent');return}
  isUpdating=true;
  try{
    for(const target of targets){
      manager=await request('/api/workspaces/targets',{method:'PATCH',body:JSON.stringify({workspace:currentWorkspace,target,isPinned:true})});
    }
    currentAgent=targets[0];
    await loadSkills(true,true,true);
    agentDialog.close();
    clearNotice();
  }catch(error){
    showNotice(error instanceof Error?error.message:'Agent 更新失败');
  }finally{isUpdating=false;render(true)}
});

[search,status].forEach((element)=>element.addEventListener('input',()=>renderSkills(true)));
Promise.all([loadManager(),loadCatalog()]).then(()=>loadSkills());
setInterval(()=>loadSkills(false,false),3000);
</script>
</body>
</html>`;
