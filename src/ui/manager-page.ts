import {
  INITIALIZATION_SCRIPT,
  MANAGER_STYLES,
  renderInitializationDialog,
  renderManagerNav,
} from './manager-chrome.js';

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

export interface ManagerPageAgent {
  id: string;
  agentDir: string;
  agentPath: string;
  skillsDir: string;
  skillsPath: string;
  detected: boolean;
  skillCount: number;
  enabledCount: number;
}

/** 汇总扫描到的 Agent 与当前 Workspace 已固定但未落地的 Agent。 */
export function visibleAgentsForWorkspace(input: {
  workspaceRoot: string;
  agents: ManagerPageAgent[];
  pinnedTargetIds: string[];
  targets: { id: string; skillsDir: string }[];
}): ManagerPageAgent[] {
  const pinned = new Set(input.pinnedTargetIds);
  const byId = new Map(input.agents.map((agent) => [agent.id, agent]));
  const root = input.workspaceRoot.replace(/\/+$/, '');

  for (const target of input.targets) {
    if (!pinned.has(target.id) || byId.has(target.id)) continue;
    const agentDir = target.skillsDir.replace(/\/skills$/, '');
    byId.set(target.id, {
      id: target.id,
      agentDir,
      agentPath: `${root}/${agentDir}`,
      skillsDir: target.skillsDir,
      skillsPath: `${root}/${target.skillsDir}`,
      detected: false,
      skillCount: 0,
      enabledCount: 0,
    });
  }

  return [...byId.values()].sort((left, right) => left.id.localeCompare(right.id));
}

/** 将可安装 Skill 归入唯一分类，并按搜索词过滤分组。 */
export function groupInstallableSkills(input: {
  skills: { id: string; name: string; description?: string }[];
  categories: { id: string; name: string; skillIds: string[] }[];
  keyword: string;
}) {
  const skillById = new Map(input.skills.map((skill) => [skill.id, skill]));
  const assigned = new Set<string>();
  const groups = input.categories.map((category) => {
    const skills = category.skillIds.flatMap((id) => {
      const skill = skillById.get(id);
      if (!skill || assigned.has(id)) return [];
      assigned.add(id);
      return [skill];
    });
    return { id: category.id, name: category.name, skills };
  });
  const uncategorized = input.skills.filter((skill) => !assigned.has(skill.id));
  if (uncategorized.length > 0) {
    groups.push({ id: 'uncategorized', name: '未分类', skills: uncategorized });
  }

  const keyword = input.keyword.trim().toLowerCase();
  return groups
    .map((group) => ({
      ...group,
      skills: group.skills.filter((skill) =>
        !keyword || [skill.id, skill.name, skill.description]
          .some((value) => String(value ?? '').toLowerCase().includes(keyword))),
    }))
    .filter((group) => group.skills.length > 0);
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
  <dialog id="installDialog" class="install-dialog">
    <form method="dialog">
      <h2>安装 Skill</h2>
      <p class="subtitle" id="installHint"></p>
      <div class="field"><span>搜索 Skill</span><input id="installSkillSearch" placeholder="搜索名称、ID 或描述"></div>
      <div class="install-groups" id="categoryList"></div>
      <div class="field">
        <span>安装模式</span>
        <select id="installMode"><option value="symlink">软链</option><option value="copy">复制</option></select>
      </div>
      <label class="check-row"><input id="installForce" type="checkbox"><span>覆盖目标已有内容</span></label>
      <pre class="install-log" id="installLog"></pre>
      <div class="dialog-actions">
        <button type="button" id="confirmInstallButton">确认安装</button>
        <button type="submit" class="ghost" id="closeInstallButton">取消</button>
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
${renderInitializationDialog()}
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
const installSkillSearch=document.querySelector('#installSkillSearch');
const installHint=document.querySelector('#installHint');
const installButton=document.querySelector('#installButton');
const confirmInstallButton=document.querySelector('#confirmInstallButton');
const closeInstallButton=document.querySelector('#closeInstallButton');
const installLog=document.querySelector('#installLog');
let confirmAction=null;
let installSelection=new Set();
let installExpandedCategories=new Set();
const escapeHtml=(value)=>String(value).replace(/[&<>"']/g,(char)=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const abbreviateSkillPath=${abbreviateSkillPath.toString()};
const visibleAgentsForWorkspace=${visibleAgentsForWorkspace.toString()};
const groupInstallableSkills=${groupInstallableSkills.toString()};

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
  return visibleAgentsForWorkspace({
    workspaceRoot:currentWorkspace,
    agents:workspace.agents,
    pinnedTargetIds:selectedWorkspace()?.pinnedTargetIds||[],
    targets:manager.targets,
  });
}
function installableCatalogSkills(){return (catalog.skills||[]).filter((skill)=>skill.enabled!==false)}
function selectedSkillIds(){return [...installSelection]}

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
    agentList.innerHTML='<div class="empty compact">暂无已检测到的 Agent，可通过「新增」固定未落地的 Agent</div>';
    return;
  }
  agentList.innerHTML=agents.map((agent)=>{
    const detected=agent.detected?'已检测到':'未落地';
    const shortPath='…/'+agent.skillsDir;
    const remove=agent.id===currentAgent?'<button type="button" class="corner-delete" data-delete-agent="'+escapeHtml(agent.id)+'" title="删除 Agent Skill" aria-label="删除 '+escapeHtml(agent.id)+'">×</button>':'';
    return '<div class="agent-row"><button type="button" data-agent="'+escapeHtml(agent.id)+'" class="'+(agent.id===currentAgent?'active ':'')+(agent.detected?'':'missing')+'"><div>'+escapeHtml(agent.id)+' · '+agent.skillCount+' 个 skill · '+detected+'</div><span class="meta" title="'+escapeHtml(agent.skillsPath)+'">'+escapeHtml(shortPath)+'</span></button>'+remove+'</div>';
  }).join('');
}

function renderInstallSkillChoices(){
  const keyword=installSkillSearch.value.trim().toLowerCase();
  const skills=installableCatalogSkills();
  const groups=groupInstallableSkills({skills,categories:catalog.categories||[],keyword});
  const allGroups=new Map(groupInstallableSkills({skills,categories:catalog.categories||[],keyword:''}).map((group)=>[group.id,group]));
  categoryList.innerHTML=groups.map((group)=>{
    const allSkills=allGroups.get(group.id)?.skills||group.skills;
    const selectedCount=allSkills.filter((skill)=>installSelection.has(skill.id)).length;
    const checked=selectedCount===allSkills.length?' checked':'';
    const open=Boolean(keyword)||installExpandedCategories.has(group.id);
    const choices=group.skills.map((skill)=>{
      const skillChecked=installSelection.has(skill.id)?' checked':'';
      return '<label><input type="checkbox" name="installSkill" value="'+escapeHtml(skill.id)+'"'+skillChecked+'><span><strong>'+escapeHtml(skill.name)+'</strong><small>'+escapeHtml(skill.id)+' · '+escapeHtml(skill.description||'无描述')+'</small></span></label>';
    }).join('');
    return '<section class="install-group" data-install-group="'+escapeHtml(group.id)+'"><div class="install-group-head"><label class="install-category-check"><input type="checkbox" name="installCategory" value="'+escapeHtml(group.id)+'"'+checked+' aria-label="选择 '+escapeHtml(group.name)+' 全部 Skill"></label><button type="button" class="install-category-toggle" data-toggle-install-category="'+escapeHtml(group.id)+'" aria-expanded="'+open+'"><span>'+escapeHtml(group.name)+'</span><small>'+selectedCount+' / '+allSkills.length+'</small><span class="install-chevron" aria-hidden="true">›</span></button></div><div class="install-group-skills"'+(open?'':' hidden')+'>'+choices+'</div></section>';
  }).join('')||'<div class="empty compact">没有匹配的可安装 Skill</div>';
  for(const group of groups){
    const allSkills=allGroups.get(group.id)?.skills||group.skills;
    const selectedCount=allSkills.filter((skill)=>installSelection.has(skill.id)).length;
    const input=categoryList.querySelector('input[name="installCategory"][value="'+CSS.escape(group.id)+'"]');
    if(input)input.indeterminate=selectedCount>0&&selectedCount<allSkills.length;
  }
}
function renderInstall(force=false){
  const agent=selectedAgent();
  const skills=installableCatalogSkills();
  installButton.disabled=!agent||skills.length===0||isUpdating;
  confirmInstallButton.disabled=!agent||skills.length===0||isUpdating;
  if(installDialog.open&&!force)return;
  if(!agent){installHint.textContent='先选择左侧 Agent。';categoryList.innerHTML='';return}
  if(skills.length===0){installHint.textContent='配置表不可用或没有已启用的 Skill，无法安装。';categoryList.innerHTML='';return}
  installHint.textContent='安装到 '+currentWorkspace+' 下 '+agent.skillsDir+'。可按分类快速勾选，再单独增减 Skill。';
  renderInstallSkillChoices();
}

function renderSkills(resetScroll=false){
  const keyword=search.value.trim().toLowerCase();
  const skills=agentSkills().filter((skill)=>{
    const matchesKeyword=!keyword||[skill.name,skill.description,skill.installedPath,skill.target,skill.linkTarget].some((value)=>String(value||'').toLowerCase().includes(keyword));
    const matchesStatus=!status.value||(!skill.isBroken&&(status.value==='on')===skill.isEnabled);
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
    const statusBadge=skill.isBroken?'<span class="badge broken">软链损坏</span>':'<span class="badge '+(skill.isEnabled?'on':'off')+'">'+(skill.isEnabled?'已启用':'未启用')+'</span>';
    const toggle=skill.isBroken?'':'<button class="'+(skill.isEnabled?'disable':'')+'" data-id="'+escapeHtml(skill.id)+'">'+(skill.isEnabled?'禁用':'启用')+'</button>';
    const action='<div class="actions">'+toggle+'<button class="danger" data-delete-skill="'+escapeHtml(skill.id)+'">删除</button></div>';
    return \`
    <article class="card \${skill.isBroken?'':'clickable'}" \${skill.isBroken?'':'data-installed-skill="'+escapeHtml(skill.id)+'" tabindex="0"'}>
      <div class="card-head"><div class="name">\${escapeHtml(skill.name)}</div>\${statusBadge}</div>
      <div class="badges">\${skill.target==='agents'?'':'<span class="badge '+escapeHtml(skill.target)+'">'+escapeHtml(skill.target)+'</span>'}<span class="badge \${skill.isSymlink?'symlink':'copy'}">\${skill.isBroken?'软链损坏':(skill.isSymlink?'软链':'复制')}</span></div>
      <p class="description readonly" title="\${escapeHtml(skill.description)}">\${escapeHtml(skill.description)}</p>
      \${skill.isBroken?'<p class="symlink-note">源目录不存在或无法访问，删除只会移除这条损坏链接。</p>':(skill.isSymlink?'<p class="symlink-note">切换会改软链源，并影响同源链接</p>':'')}
      <p class="path" title="\${escapeHtml(skill.installedPath)}">\${escapeHtml(installedPath)}</p>
      \${skill.linkTarget?'<p class="path" title="'+escapeHtml(skill.linkTarget)+'">'+(skill.isBroken?'指向 ':'来源 ')+escapeHtml(linkTarget)+'</p>':''}
      \${action}
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
function appendInstallLog(line){
  installLog.classList.add('show');
  installLog.textContent=(installLog.textContent?installLog.textContent+'\\n':'')+line;
  installLog.scrollTop=installLog.scrollHeight;
}
async function streamInstall(body){
  const response=await fetch('/api/skills/install',{method:'POST',headers:{'x-skillctl-token':token,'content-type':'application/json'},body:JSON.stringify(body)});
  if(!response.body)throw new Error(await response.text()||'安装未返回输出');
  const reader=response.body.getReader();
  const decoder=new TextDecoder();
  let buffer='';
  let result=null;
  let streamError='';
  while(true){
    const {done,value}=await reader.read();
    if(done)break;
    buffer+=decoder.decode(value,{stream:true});
    const lines=buffer.split('\\n');
    buffer=lines.pop()||'';
    for(const line of lines){
      if(!line.trim())continue;
      const event=JSON.parse(line);
      if(event.type==='log')appendInstallLog(event.line);
      else if(event.type==='error')streamError=event.message||'安装失败';
      else if(event.type==='result')result=event;
    }
  }
  if(buffer.trim()){
    const event=JSON.parse(buffer);
    if(event.type==='log')appendInstallLog(event.line);
    else if(event.type==='error')streamError=event.message||'安装失败';
    else if(event.type==='result')result=event;
  }
  if(streamError)throw new Error(streamError);
  if(!response.ok)throw new Error(streamError||'安装失败');
  if(!result)throw new Error('安装未返回结果');
  return result;
}

${INITIALIZATION_SCRIPT}

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
  const remove=event.target.closest('button[data-delete-skill]');
  if(remove){
    const skill=workspace.skills.find((item)=>item.id===remove.dataset.deleteSkill);
    if(!skill||isUpdating)return;
    const removalMessage=skill.isBroken
      ?'将删除这条损坏的 Skill 软链。已丢失的源目录不会被改动。'
      :skill.isSymlink
        ?'将从当前 Workspace 删除这条 Skill 软链，源目录会保留。'
        :'将删除当前 Workspace 中这份 Skill 副本，不影响配置表来源。';
    askConfirmation({
      title:'删除 '+skill.name,
      message:removalMessage,
      detail:'Workspace：'+currentWorkspace+'\\nAgent：'+skill.target+'\\n路径：'+(skill.installedPath||'')+(skill.linkTarget?' → '+skill.linkTarget:''),
      action:()=>removeSkill(skill),
    });
    return;
  }
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
  if(!skill||skill.isBroken)return;
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
  installLog.textContent='';
  installLog.classList.remove('show');
  installSelection=new Set();
  installExpandedCategories=new Set();
  installSkillSearch.value='';
  renderInstall(true);
  installDialog.showModal();
});
installDialog.addEventListener('cancel',(event)=>{
  if(isUpdating)event.preventDefault();
});
categoryList.addEventListener('change',(event)=>{
  const categoryInput=event.target.closest('input[name="installCategory"]');
  if(categoryInput){
    const group=groupInstallableSkills({
      skills:installableCatalogSkills(),
      categories:catalog.categories||[],
      keyword:'',
    }).find((item)=>item.id===categoryInput.value);
    for(const skill of group?.skills||[]){
      if(categoryInput.checked)installSelection.add(skill.id);
      else installSelection.delete(skill.id);
    }
    renderInstall(true);
    return;
  }
  const input=event.target.closest('input[name="installSkill"]');
  if(!input)return;
  if(input.checked)installSelection.add(input.value);
  else installSelection.delete(input.value);
  renderInstall(true);
});
categoryList.addEventListener('click',(event)=>{
  const button=event.target.closest('[data-toggle-install-category]');
  if(!button)return;
  const categoryId=button.dataset.toggleInstallCategory;
  if(installExpandedCategories.has(categoryId))installExpandedCategories.delete(categoryId);
  else installExpandedCategories.add(categoryId);
  renderInstall(true);
});
installSkillSearch.addEventListener('input',()=>renderInstall(true));
installSkillSearch.addEventListener('keydown',(event)=>{
  if(event.key==='Enter')event.preventDefault();
});

confirmInstallButton.addEventListener('click',async()=>{
  const agent=selectedAgent();
  const skillIds=selectedSkillIds();
  if(!agent||isUpdating)return;
  if(skillIds.length===0){showNotice('请至少选择一个 Skill');return}
  isUpdating=true;confirmInstallButton.disabled=true;closeInstallButton.disabled=true;
  installLog.textContent='';
  appendInstallLog('开始安装到 '+agent.id+' …');
  try{
    const data=await streamInstall({workspace:currentWorkspace,target:agent.id,skillIds,mode:document.querySelector('#installMode').value,force:document.querySelector('#installForce').checked});
    applyWorkspace(data);
    const skipped=data.install?.skippedDisabled||[];
    const items=data.install?.items||[];
    const created=items.filter((item)=>item.status!=='skipped').length;
    const skippedItems=items.filter((item)=>item.status==='skipped').length;
    appendInstallLog('完成：已处理 '+created+' 个，跳过 '+skippedItems+' 个');
    showNotice('已处理 '+created+' 个，跳过 '+skippedItems+' 个'+(skipped.length?'；配置表未启用：'+skipped.join(', '):''),true);
    installDialog.close();
  }catch(error){
    const message=error instanceof Error?error.message:'安装失败';
    appendInstallLog('失败：'+message);
    showNotice(message);
  }finally{
    isUpdating=false;
    closeInstallButton.disabled=false;
    render(false);
  }
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

async function removeSkill(skill){
  if(!currentWorkspace||!skill||isUpdating)return;
  isUpdating=true;
  try{
    applyWorkspace(await request('/api/skills',{method:'DELETE',body:JSON.stringify({workspace:currentWorkspace,target:skill.target,relativeDir:skill.relativeDir})}));
    clearNotice();
    render(false);
  }catch(error){
    showNotice(error instanceof Error?error.message:'Skill 删除失败');
  }finally{isUpdating=false;render(false)}
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
async function startPage(){
  const configStatus=await setupInitialization(async()=>{
    await loadCatalog();
    render(true);
  });
  if(configStatus.initialized){
    await Promise.all([loadManager(),loadCatalog()]);
    await loadSkills();
  }
}
void startPage();
setInterval(()=>loadSkills(false,false),3000);
</script>
</body>
</html>`;
