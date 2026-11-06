import {
  INITIALIZATION_SCRIPT,
  MANAGER_STYLES,
  renderInitializationDialog,
  renderManagerNav,
} from './manager-chrome.js';
import { catalogListStateKey, parseCatalogListState } from './list-state.js';

/** 将 SKILL.md 的 YAML frontmatter 与 Markdown 正文分开。 */
export function splitSkillDocument(content: string): { frontmatter: string; body: string } {
  const normalized = content.replaceAll('\r\n', '\n');
  const match = normalized.match(/^---\n([\s\S]*?)\n---(?:\n|$)([\s\S]*)$/);
  if (!match) return { frontmatter: '', body: normalized.trimEnd() };
  return { frontmatter: match[1].trim(), body: match[2].replace(/^\n/, '').trimEnd() };
}

/** 安全渲染 SKILL.md 常用 Markdown，不允许原始 HTML 注入页面。 */
export function renderSkillMarkdown(markdown: string): string {
  function escape(value: string): string {
    return value.replace(/[&<>"']/g, (char) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    })[char] ?? char);
  }
  function inline(value: string): string {
    let rendered = escape(value);
    rendered = rendered.replace(/`([^`]+)`/g, '<code>$1</code>');
    rendered = rendered.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    rendered = rendered.replace(/\*([^*]+)\*/g, '<em>$1</em>');
    rendered = rendered.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_match, label: string, href: string) => {
      const safeHref = /^(?:https?:|mailto:|#|\/)/i.test(href) ? href : '#';
      return `<a href="${safeHref}" target="_blank" rel="noreferrer">${label}</a>`;
    });
    return rendered;
  }
  const output: string[] = [];
  let list: 'ul' | 'ol' | null = null;
  let paragraph: string[] = [];
  let codeLanguage = '';
  let codeLines: string[] | null = null;
  function closeList(): void {
    if (list) output.push(`</${list}>`);
    list = null;
  }
  function flushParagraph(): void {
    if (paragraph.length > 0) output.push(`<p>${paragraph.map(inline).join('<br>')}</p>`);
    paragraph = [];
  }
  for (const line of markdown.replaceAll('\r\n', '\n').split('\n')) {
    const fence = line.match(/^```([\w-]*)\s*$/);
    if (fence) {
      flushParagraph();
      closeList();
      if (codeLines) {
        const className = codeLanguage ? ` class="language-${codeLanguage}"` : '';
        output.push(`<pre><code${className}>${escape(codeLines.join('\n'))}</code></pre>`);
        codeLines = null;
        codeLanguage = '';
      } else {
        codeLines = [];
        codeLanguage = fence[1].toLowerCase();
      }
      continue;
    }
    if (codeLines) {
      codeLines.push(line);
      continue;
    }
    const heading = line.match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      flushParagraph();
      closeList();
      const level = heading[1].length;
      output.push(`<h${level}>${inline(heading[2])}</h${level}>`);
      continue;
    }
    const unordered = line.match(/^\s*[-*]\s+(.+)$/);
    const ordered = line.match(/^\s*\d+\.\s+(.+)$/);
    if (unordered || ordered) {
      flushParagraph();
      const nextList = unordered ? 'ul' : 'ol';
      if (list !== nextList) {
        closeList();
        list = nextList;
        output.push(`<${list}>`);
      }
      output.push(`<li>${inline((unordered ?? ordered)?.[1] ?? '')}</li>`);
      continue;
    }
    const quote = line.match(/^>\s?(.*)$/);
    if (quote) {
      flushParagraph();
      closeList();
      output.push(`<blockquote>${inline(quote[1])}</blockquote>`);
      continue;
    }
    if (!line.trim()) {
      flushParagraph();
      closeList();
      continue;
    }
    paragraph.push(line);
  }
  if (codeLines) output.push(`<pre><code>${escape(codeLines.join('\n'))}</code></pre>`);
  flushParagraph();
  closeList();
  return output.join('');
}

export const CATALOG_PAGE = `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <link rel="icon" href="/favicon.ico">
  <title>skill-ctl · Skill 源</title>
  <style>${MANAGER_STYLES}</style>
</head>
<body>
<main>
  ${renderManagerNav('catalog')}
  <header class="page-header">
    <div>
      <h1 class="page-title">Skill 源</h1>
      <p class="subtitle">维护 Skill 来源、分类与安装策略，决定安装时可选择的内容。</p>
    </div>
    <div class="page-header-actions">
      <div class="summary" id="summary">正在读取配置表…</div>
      <div class="summary-path">
        <span class="summary-path-text" id="sourcePathText" title="">正在读取路径…</span>
        <button type="button" class="path-config-icon" id="initConfigButton" title="路径配置" aria-label="路径配置"><svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true"><path d="M5.2 2.2 2.8 4.6v6.6h8.4V2.2H5.2Z" stroke="currentColor" stroke-width="1.2"/><path d="M5.2 2.2v2.4H2.8" stroke="currentColor" stroke-width="1.2"/><path d="M4.6 7.4h4.8M4.6 9.4h3.2" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg></button>
      </div>
    </div>
  </header>
  <div class="notice" id="notice"></div>
  <section class="sync panel" id="syncPanel" hidden>
    <h2>待同步 Skill</h2>
    <p class="subtitle" id="syncHint"></p>
    <div class="sync-list" id="syncList"></div>
    <div class="actions">
      <select id="syncCategory"></select>
      <button id="syncButton">同步</button>
    </div>
  </section>
  <div class="layout">
    <aside class="panel">
      <div class="panel-heading">
        <h2>分类</h2>
        <button type="button" class="positive" id="addCategoryButton">新增</button>
      </div>
      <div class="list" id="categoryList"></div>
      <div id="categoryEditor" hidden>
        <h3>分类详情</h3>
        <div class="category-fields">
          <label class="field"><span>分类名称</span><input id="editCategoryName" placeholder="分类名称"></label>
          <label class="field"><span>分类描述</span><textarea id="editCategoryDescription" placeholder="分类描述"></textarea></label>
        </div>
        <div class="actions">
          <button type="button" id="saveCategory">保存分类</button>
          <button type="button" class="disable" id="deleteCategory">删除空分类</button>
        </div>
      </div>
    </aside>
    <section class="catalog-main">
      <div class="toolbar-stack">
        <div class="toolbar toolbar-filters">
          <input class="toolbar-search" id="search" placeholder="搜索 Skill">
          <select id="enabledFilter"><option value="">全部启用状态</option><option value="on">安装时启用</option><option value="off">安装时跳过</option></select>
          <select id="typeFilter"><option value="">全部类型</option><option value="local">local</option><option value="external">external</option></select>
          <select id="categoryScope"><option value="">跟随侧栏分类</option><option value="uncategorized">仅未分类</option><option value="categorized">仅已分类</option></select>
          <select id="sortField" aria-label="排序"><option value="">默认顺序</option><option value="count">使用次数</option><option value="rank">排名</option><option value="name">名称</option></select>
          <button type="button" class="ghost" id="sortDirection" hidden>高到低</button>
          <span class="result-count" id="resultCount">匹配 <strong>0</strong> · 共 <strong>0</strong></span>
          <div class="view-switch" role="group" aria-label="展示方式">
            <button type="button" id="cardViewButton" class="active">卡片</button>
            <button type="button" id="listViewButton">列表</button>
          </div>
          <button type="button" class="ghost" id="selectVisibleCatalogButton">全选当前结果</button>
        </div>
        <div class="toolbar toolbar-actions" id="catalogBulkActions" hidden>
          <button type="button" class="positive" id="enableSelectedCatalogButton">设为安装启用</button>
          <button type="button" class="ghost" id="skipSelectedCatalogButton">设为安装跳过</button>
          <button type="button" class="danger" id="deleteSelectedCatalogButton">删除所选</button>
        </div>
      </div>
      <div class="catalog-scroll">
        <div class="grid" id="grid"><div class="empty">正在读取配置表…</div></div>
      </div>
    </section>
  </div>
  <dialog id="categoryDialog">
    <form method="dialog" id="categoryForm">
      <h2>新增分类</h2>
      <p class="subtitle">分类用于组织 Skill，并作为批量安装的选择范围。</p>
      <div class="row"><input name="id" placeholder="分类 id，如 write" required></div>
      <div class="row"><input name="name" placeholder="分类名称" required></div>
      <div class="row"><input name="description" placeholder="分类描述" required></div>
      <div class="dialog-actions">
        <button type="submit">新增</button>
        <button type="button" class="ghost" id="cancelCategoryButton">取消</button>
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
let workspace={sourceDir:'',catalog:{skills:[],categories:[]},unregistered:[],uncategorized:[]};
let currentCategory='';
let isUpdating=false;
const notice=document.querySelector('#notice');
const summary=document.querySelector('#summary');
const grid=document.querySelector('#grid');
const categoryList=document.querySelector('#categoryList');
const search=document.querySelector('#search');
const enabledFilter=document.querySelector('#enabledFilter');
const typeFilter=document.querySelector('#typeFilter');
const categoryScope=document.querySelector('#categoryScope');
const categoryDialog=document.querySelector('#categoryDialog');
const confirmDialog=document.querySelector('#confirmDialog');
let confirmAction=null;
let selectedCatalogSkills=new Set();
let usageByName=new Map();
const catalogViewKey='skillctl:view-mode:catalog';
let catalogViewMode=localStorage.getItem(catalogViewKey)==='list'?'list':'card';
const catalogSortKey='skillctl:sort:catalog';
let catalogSort={field:'',direction:'desc'};
try{
  const saved=JSON.parse(localStorage.getItem(catalogSortKey)||'null');
  if(saved&&(saved.field==='count'||saved.field==='rank'||saved.field==='name'||saved.field==='')&&(saved.direction==='asc'||saved.direction==='desc')) catalogSort=saved;
}catch(error){console.error(error)}
const parseCatalogListState=${parseCatalogListState.toString()};
const catalogListStateKey=${catalogListStateKey.toString()};
let pendingCatalogState=null;
try{pendingCatalogState=parseCatalogListState(sessionStorage.getItem(catalogListStateKey()));}catch(error){pendingCatalogState=null;console.error(error)}
const escapeHtml=(value)=>String(value).replace(/[&<>"']/g,(char)=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const sourcePathText=document.querySelector('#sourcePathText');

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
function categoryOf(skillId){
  return workspace.catalog.categories.find((category)=>category.skillIds.includes(skillId));
}
function visibleSkills(){
  const keyword=search.value.trim().toLowerCase();
  const scope=categoryScope.value;
  return workspace.catalog.skills.filter((skill)=>{
    const categorized=Boolean(categoryOf(skill.id));
    let inCategory=true;
    if(scope==='uncategorized')inCategory=!categorized;
    else if(scope==='categorized'){
      inCategory=categorized;
      if(currentCategory&&currentCategory!=='__uncategorized__')inCategory=categoryOf(skill.id)?.id===currentCategory;
    }else if(currentCategory==='__uncategorized__')inCategory=!categorized;
    else if(currentCategory)inCategory=categoryOf(skill.id)?.id===currentCategory;
    const matchesKeyword=!keyword||[skill.name,skill.description,skill.id,skill.package].some((value)=>String(value).toLowerCase().includes(keyword));
    const matchesEnabled=!enabledFilter.value||(enabledFilter.value==='on')===skill.enabled;
    const matchesType=!typeFilter.value||skill.type===typeFilter.value;
    return inCategory&&matchesKeyword&&matchesEnabled&&matchesType;
  });
}
function usageStats(skill){
  const usage=usageByName.get(skill.id)||usageByName.get(skill.name);
  return {count:usage?usage.readCount:0,rank:usage&&usage.readCount>0?usage.rank:0};
}
function sortLabel(){
  if(catalogSort.field==='count')return catalogSort.direction==='asc'?'低到高':'高到低';
  if(catalogSort.field==='rank')return catalogSort.direction==='asc'?'靠前':'靠后';
  if(catalogSort.field==='name')return catalogSort.direction==='asc'?'A 到 Z':'Z 到 A';
  return '';
}
function sortedSkills(skills){
  if(!catalogSort.field)return skills;
  const direction=catalogSort.direction==='asc'?1:-1;
  return skills.slice().sort((left,right)=>{
    const leftUsage=usageStats(left);
    const rightUsage=usageStats(right);
    const byName=left.name.localeCompare(right.name,'zh');
    if(catalogSort.field==='name')return byName*direction;
    if(catalogSort.field==='count')return (leftUsage.count-rightUsage.count)*direction||byName;
    if(!leftUsage.rank&&!rightUsage.rank)return byName;
    if(!leftUsage.rank)return 1;
    if(!rightUsage.rank)return -1;
    return (leftUsage.rank-rightUsage.rank)*direction||byName;
  });
}
function applySortControl(){
  document.querySelector('#sortField').value=catalogSort.field;
  const button=document.querySelector('#sortDirection');
  button.hidden=!catalogSort.field;
  button.textContent=sortLabel();
}

function render(){
  const cats=workspace.catalog.categories;
  const sourcePath=workspace.sourceDir||'';
  summary.innerHTML='<strong>'+workspace.catalog.skills.length+'</strong> 个已登记 · <strong>'+workspace.unregistered.length+'</strong> 个待同步';
  sourcePathText.textContent=sourcePath||'未配置源路径';
  sourcePathText.title=sourcePath;
  categoryList.innerHTML=['<button data-category="" class="'+(currentCategory===''?'active':'')+'">全部分类</button>']
    .concat(cats.map((category)=>'<button data-category="'+escapeHtml(category.id)+'" class="'+(currentCategory===category.id?'active':'')+'">'+escapeHtml(category.name)+' · '+category.skillIds.length+'</button>'))
    .concat(workspace.uncategorized.length?['<button data-category="__uncategorized__" class="'+(currentCategory==='__uncategorized__'?'active':'')+'">未分类 · '+workspace.uncategorized.length+'</button>']:[])
    .join('');
  const editor=document.querySelector('#categoryEditor');
  const selected=cats.find((category)=>category.id===currentCategory);
  editor.hidden=!selected;
  if(selected){
    document.querySelector('#editCategoryName').value=selected.name;
    const description=document.querySelector('#editCategoryDescription');
    description.value=selected.description;
    description.style.height='auto';
    description.style.height=description.scrollHeight+'px';
  }
  const syncSelect=document.querySelector('#syncCategory');
  syncSelect.innerHTML=cats.map((category)=>'<option value="'+escapeHtml(category.id)+'">'+escapeHtml(category.name)+'</option>').join('');
  const syncPanel=document.querySelector('#syncPanel');
  if(workspace.unregistered.length===0){syncPanel.hidden=true}
  else{
    syncPanel.hidden=false;
    document.querySelector('#syncHint').textContent='源目录 skills/ 中发现尚未写入配置表的本地 Skill。';
    document.querySelector('#syncList').innerHTML=workspace.unregistered.map((skill)=>'<label><input type="checkbox" name="syncSkill" value="'+escapeHtml(skill.id)+'" checked><span><span class="sync-name">'+escapeHtml(skill.name)+'</span><span class="sync-desc" title="'+escapeHtml(skill.description)+'">'+escapeHtml(skill.description)+'</span></span></label>').join('');
  }
  applySortControl();
  const skills=sortedSkills(visibleSkills());
  const visibleIds=new Set(skills.map((skill)=>skill.id));
  for(const id of [...selectedCatalogSkills]){
    if(!visibleIds.has(id))selectedCatalogSkills.delete(id);
  }
  document.querySelector('#resultCount').innerHTML='匹配 <strong>'+skills.length+'</strong> · 共 <strong>'+workspace.catalog.skills.length+'</strong>';
  const selectedCount=[...selectedCatalogSkills].length;
  const allVisibleSelected=skills.length>0&&skills.every((skill)=>selectedCatalogSkills.has(skill.id));
  document.querySelector('#selectVisibleCatalogButton').textContent=allVisibleSelected
    ?'取消全选 ('+selectedCount+')'
    :selectedCount>0?'全选当前结果 · 已选 '+selectedCount:'全选当前结果';
  document.querySelector('#catalogBulkActions').hidden=selectedCount===0;
  applyCatalogView();
  if(skills.length===0){grid.innerHTML='<div class="empty">没有符合条件的配置项</div>';return}
  grid.innerHTML=skills.map((skill)=>{
    const category=categoryOf(skill.id);
    const options=cats.map((item)=>'<option value="'+escapeHtml(item.id)+'" '+(item.id===category?.id?'selected':'')+'>'+escapeHtml(item.name)+'</option>').join('');
    const checked=selectedCatalogSkills.has(skill.id)?' checked':'';
    const selectBox='<label class="skill-select"><input type="checkbox" data-select-catalog="'+escapeHtml(skill.id)+'"'+checked+' aria-label="选择 '+escapeHtml(skill.name)+'"></label>';
    const categorySelect='<select class="card-category" data-move="'+escapeHtml(skill.id)+'" title="所属分类"><option value="" '+(!category?'selected':'')+'>未分类</option>'+options+'</select>';
    return '<article class="card" data-skill-detail="'+escapeHtml(skill.id)+'"><div class="card-head"><div class="skill-title">'+selectBox+'<div class="skill-meta"><div class="name" data-toggle-select="'+escapeHtml(skill.id)+'">'+escapeHtml(skill.name)+'</div>'+categorySelect+'</div></div><div class="usage-marks">'+usageMarks(skill)+'</div></div><p class="description" data-open-detail="'+escapeHtml(skill.id)+'" title="'+escapeHtml(skill.description)+'"><span class="badge '+escapeHtml(skill.type)+'">'+escapeHtml(skill.type)+'</span> '+escapeHtml(skill.description)+'</p><p class="path">'+escapeHtml(skill.source)+' · '+escapeHtml(skill.package)+'</p></article>';
  }).join('');
}

function usageMarks(skill){
  const usage=usageByName.get(skill.id)||usageByName.get(skill.name);
  const count=usage?usage.readCount:0;
  const rank=usage&&count>0?usage.rank:0;
  return '<span class="usage-rank">'+(rank?'第 '+rank+' 名':'未上榜')+'</span><span class="usage-count">'+count+' 次</span>';
}
function applyCatalogView(){
  grid.classList.toggle('is-list',catalogViewMode==='list');
  document.querySelector('#cardViewButton').classList.toggle('active',catalogViewMode==='card');
  document.querySelector('#listViewButton').classList.toggle('active',catalogViewMode==='list');
}
function setCatalogView(mode){
  catalogViewMode=mode==='list'?'list':'card';
  localStorage.setItem(catalogViewKey,catalogViewMode);
  applyCatalogView();
}
async function request(url,options={}){
  const response=await fetch(url,{...options,headers:{'x-skillctl-token':token,'content-type':'application/json',...(options.headers||{})}});
  if(!response.ok)throw new Error(await response.text());
  return response.json();
}
${INITIALIZATION_SCRIPT}

async function loadWorkspace(showError=true){
  try{
    workspace=await request('/api/catalog');
    if(currentCategory&&currentCategory!=='__uncategorized__'&&!workspace.catalog.categories.some((category)=>category.id===currentCategory)) currentCategory='';
    try{
      const usage=await request('/api/usage');
      usageByName=new Map();
      (usage.skills||[]).forEach((skill,index)=>usageByName.set(skill.name,{readCount:skill.readCount||0,rank:index+1}));
    }catch(usageError){
      usageByName=new Map();
      console.error(usageError);
    }
    clearNotice();
    render();
  }catch(error){
    if(showError) showNotice(error instanceof Error?error.message:'读取配置表失败');
  }
}
async function mutate(url,options,okMessage){
  if(isUpdating)return;
  isUpdating=true;
  try{
    workspace=await request(url,options);
    showNotice(okMessage,true);
    render();
  }catch(error){
    showNotice(error instanceof Error?error.message:'保存失败');
  }finally{isUpdating=false}
}

categoryList.addEventListener('click',(event)=>{
  const button=event.target.closest('button[data-category]');
  if(!button)return;
  currentCategory=button.dataset.category;
  render();
});
document.querySelector('#categoryForm').addEventListener('submit',async(event)=>{
  event.preventDefault();
  const form=event.currentTarget;
  const data=Object.fromEntries(new FormData(form).entries());
  await mutate('/api/catalog/categories',{method:'POST',body:JSON.stringify(data)},'已新增分类');
  form.reset();
  categoryDialog.close();
});
document.querySelector('#addCategoryButton').addEventListener('click',()=>categoryDialog.showModal());
document.querySelector('#cancelCategoryButton').addEventListener('click',()=>categoryDialog.close());
document.querySelector('#saveCategory').addEventListener('click',async()=>{
  if(!currentCategory||currentCategory==='__uncategorized__')return;
  await mutate('/api/catalog/categories',{method:'PATCH',body:JSON.stringify({id:currentCategory,name:document.querySelector('#editCategoryName').value,description:document.querySelector('#editCategoryDescription').value})},'已保存分类');
});
document.querySelector('#deleteCategory').addEventListener('click',async()=>{
  if(!currentCategory||currentCategory==='__uncategorized__')return;
  const category=workspace.catalog.categories.find((item)=>item.id===currentCategory);
  askConfirmation({
    title:'删除分类',
    message:'仅空分类可以删除。',
    detail:(category?.name||currentCategory)+' · '+(category?.skillIds.length||0)+' 个 Skill',
    action:async()=>{
      await mutate('/api/catalog/categories?id='+encodeURIComponent(currentCategory),{method:'DELETE'},'已删除分类');
      currentCategory='';
      render();
    },
  });
});
document.querySelector('#syncButton').addEventListener('click',async()=>{
  const skillIds=[...document.querySelectorAll('input[name="syncSkill"]:checked')].map((item)=>item.value);
  if(skillIds.length===0){showNotice('请选择要同步的 Skill');return}
  await mutate('/api/catalog/sync',{method:'POST',body:JSON.stringify({categoryId:document.querySelector('#syncCategory').value,skillIds})},'已同步到配置表');
});
function toggleCatalogSelection(skillId){
  if(!skillId)return;
  if(selectedCatalogSkills.has(skillId))selectedCatalogSkills.delete(skillId);
  else selectedCatalogSkills.add(skillId);
  render();
}
grid.addEventListener('change',(event)=>{
  const input=event.target.closest('input[data-select-catalog]');
  if(!input)return;
  if(input.checked)selectedCatalogSkills.add(input.dataset.selectCatalog);
  else selectedCatalogSkills.delete(input.dataset.selectCatalog);
  render();
});
grid.addEventListener('click',(event)=>{
  if(event.target.closest('input[data-select-catalog],label.skill-select,select[data-move]'))return;
  const title=event.target.closest('[data-toggle-select]');
  if(title){
    toggleCatalogSelection(title.dataset.toggleSelect);
    return;
  }
  const detail=event.target.closest('[data-open-detail]');
  if(detail){
    saveCatalogListState();
    location.href='/catalog/skill?id='+encodeURIComponent(detail.dataset.openDetail);
  }
});
grid.addEventListener('keydown',(event)=>{
  const detail=event.target.closest('[data-open-detail]');
  if(detail&&(event.key==='Enter'||event.key===' ')){
    event.preventDefault();
    detail.click();
  }
});
document.querySelector('#sortField').addEventListener('change',()=>{
  catalogSort.field=document.querySelector('#sortField').value;
  catalogSort.direction=catalogSort.field==='count'?'desc':'asc';
  localStorage.setItem(catalogSortKey,JSON.stringify(catalogSort));
  render();
});
document.querySelector('#sortDirection').addEventListener('click',()=>{
  catalogSort.direction=catalogSort.direction==='asc'?'desc':'asc';
  localStorage.setItem(catalogSortKey,JSON.stringify(catalogSort));
  render();
});
document.querySelector('#cardViewButton').addEventListener('click',()=>setCatalogView('card'));
document.querySelector('#listViewButton').addEventListener('click',()=>setCatalogView('list'));
document.querySelector('#selectVisibleCatalogButton').addEventListener('click',()=>{
  const skills=visibleSkills();
  const allSelected=skills.length>0&&skills.every((skill)=>selectedCatalogSkills.has(skill.id));
  for(const skill of skills){
    if(allSelected)selectedCatalogSkills.delete(skill.id);
    else selectedCatalogSkills.add(skill.id);
  }
  render();
});
function selectedVisibleCatalogSkills(){
  return visibleSkills().filter((skill)=>selectedCatalogSkills.has(skill.id));
}
async function setSelectedCatalogEnabled(enabled){
  const skills=selectedVisibleCatalogSkills().filter((skill)=>skill.enabled!==enabled);
  if(skills.length===0||isUpdating){
    if(!isUpdating)showNotice(enabled?'请先选择可设为安装启用的 Skill':'请先选择可设为安装跳过的 Skill');
    return;
  }
  isUpdating=true;
  try{
    let last=null;
    for(const skill of skills){
      last=await request('/api/catalog/skills',{method:'PATCH',body:JSON.stringify({id:skill.id,enabled})});
    }
    if(last)workspace=last;
    showNotice((enabled?'已设为安装启用 ':'已设为安装跳过 ')+skills.length+' 个 Skill',true);
    render();
  }catch(error){
    showNotice(error instanceof Error?error.message:'批量更新安装策略失败');
  }finally{isUpdating=false}
}
document.querySelector('#enableSelectedCatalogButton').addEventListener('click',()=>void setSelectedCatalogEnabled(true));
document.querySelector('#skipSelectedCatalogButton').addEventListener('click',()=>void setSelectedCatalogEnabled(false));
document.querySelector('#deleteSelectedCatalogButton').addEventListener('click',()=>{
  const skills=selectedVisibleCatalogSkills();
  if(skills.length===0||isUpdating){if(skills.length===0)showNotice('请先选择要删除的 Skill');return}
  const names=skills.slice(0,8).map((skill)=>skill.name).join('、');
  askConfirmation({
    title:'删除所选 Skill',
    message:'从目录删除后不再参与安装，但不会删除源文件。',
    detail:names+(skills.length>8?' 等 '+skills.length+' 个':''),
    action:async()=>{
      isUpdating=true;
      try{
        let last=null;
        for(const skill of skills){
          last=await request('/api/catalog/skills?id='+encodeURIComponent(skill.id),{method:'DELETE'});
          selectedCatalogSkills.delete(skill.id);
        }
        if(last)workspace=last;
        showNotice('已从目录删除 '+skills.length+' 个 Skill',true);
        render();
      }catch(error){
        showNotice(error instanceof Error?error.message:'批量删除失败');
      }finally{isUpdating=false}
    },
  });
});
document.querySelector('#confirmActionButton').addEventListener('click',async()=>{
  const action=confirmAction;
  confirmAction=null;
  confirmDialog.close();
  if(action)await action();
});
grid.addEventListener('change',async(event)=>{
  const select=event.target.closest('select[data-move]');
  if(!select)return;
  await mutate('/api/catalog/skills',{method:'PATCH',body:JSON.stringify({id:select.dataset.move,categoryId:select.value})},'已更新分类');
});
[search,enabledFilter,typeFilter,categoryScope].forEach((element)=>element.addEventListener('input',render));
async function startPage(){
  const configStatus=await setupInitialization(()=>loadWorkspace());
  if(!configStatus.initialized)return;
  if(pendingCatalogState){
    currentCategory=pendingCatalogState.category||'';
    search.value=pendingCatalogState.keyword||'';
    enabledFilter.value=pendingCatalogState.enabled||'';
    typeFilter.value=pendingCatalogState.type||'';
    categoryScope.value=pendingCatalogState.scope||'';
    selectedCatalogSkills=new Set(pendingCatalogState.selectedSkillIds||[]);
  }
  await loadWorkspace();
  const scroll=document.querySelector('.catalog-scroll');
  if(scroll&&pendingCatalogState?.scrollTop)scroll.scrollTop=pendingCatalogState.scrollTop;
  sessionStorage.removeItem(catalogListStateKey());
  pendingCatalogState=null;
}
function saveCatalogListState(){
  const scroll=document.querySelector('.catalog-scroll');
  sessionStorage.setItem(catalogListStateKey(),JSON.stringify({
    category:currentCategory,
    keyword:search.value,
    enabled:enabledFilter.value,
    type:typeFilter.value,
    scope:categoryScope.value,
    selectedSkillIds:[...selectedCatalogSkills],
    scrollTop:scroll?scroll.scrollTop:0,
  }));
}
void startPage();
</script>
</body>
</html>`;
