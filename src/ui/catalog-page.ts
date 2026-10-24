import {
  INITIALIZATION_SCRIPT,
  MANAGER_STYLES,
  renderInitializationDialog,
  renderManagerNav,
} from './manager-chrome.js';

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
      <button type="button" class="config-entry" id="initConfigButton">路径配置</button>
      <div class="summary" id="summary">正在读取配置表…</div>
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
      <div class="toolbar">
        <input id="search" placeholder="搜索 Skill">
        <select id="enabledFilter"><option value="">全部启用状态</option><option value="on">安装时启用</option><option value="off">安装时跳过</option></select>
        <select id="typeFilter"><option value="">全部类型</option><option value="local">local</option><option value="external">external</option></select>
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
const categoryDialog=document.querySelector('#categoryDialog');
const confirmDialog=document.querySelector('#confirmDialog');
let confirmAction=null;
const escapeHtml=(value)=>String(value).replace(/[&<>"']/g,(char)=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));

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
  return workspace.catalog.skills.filter((skill)=>{
    const inCategory=currentCategory===''?true:currentCategory==='__uncategorized__'
      ?workspace.uncategorized.some((item)=>item.id===skill.id)
      :categoryOf(skill.id)?.id===currentCategory;
    const matchesKeyword=!keyword||[skill.name,skill.description,skill.id,skill.package].some((value)=>String(value).toLowerCase().includes(keyword));
    const matchesEnabled=!enabledFilter.value||(enabledFilter.value==='on')===skill.enabled;
    const matchesType=!typeFilter.value||skill.type===typeFilter.value;
    return inCategory&&matchesKeyword&&matchesEnabled&&matchesType;
  });
}

function render(){
  const cats=workspace.catalog.categories;
  summary.innerHTML='<strong>'+workspace.catalog.skills.length+'</strong> 个已登记 · <strong>'+workspace.unregistered.length+'</strong> 个待同步<br>'+escapeHtml(workspace.sourceDir);
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
  const skills=visibleSkills();
  if(skills.length===0){grid.innerHTML='<div class="empty">没有符合条件的配置项</div>';return}
  grid.innerHTML=skills.map((skill)=>{
    const category=categoryOf(skill.id);
    const options=cats.map((item)=>'<option value="'+escapeHtml(item.id)+'" '+(item.id===category?.id?'selected':'')+'>'+escapeHtml(item.name)+'</option>').join('');
    return '<article class="card clickable" data-skill-detail="'+escapeHtml(skill.id)+'" tabindex="0"><div class="card-head"><div class="name">'+escapeHtml(skill.name)+'</div><button type="button" class="strategy-toggle '+(skill.enabled?'on':'off')+'" data-enable="'+escapeHtml(skill.id)+'" title="'+(skill.enabled?'下次安装会包含此 Skill，点击改为跳过':'下次安装会跳过此 Skill，点击改为启用')+'">'+(skill.enabled?'安装：启用':'安装：跳过')+'</button></div><div class="badges"><span class="badge '+escapeHtml(skill.type)+'">'+escapeHtml(skill.type)+'</span></div><p class="description" contenteditable="true" data-desc="'+escapeHtml(skill.id)+'" data-origin="'+escapeHtml(skill.description)+'">'+escapeHtml(skill.description)+'</p><p class="path">'+escapeHtml(skill.source)+' · '+escapeHtml(skill.package)+'</p><div class="actions"><select data-move="'+escapeHtml(skill.id)+'" title="所属分类"><option value="" '+(!category?'selected':'')+'>未分类</option>'+options+'</select><button class="disable" data-remove="'+escapeHtml(skill.id)+'" title="仅删除目录登记，不删源目录文件；之后可再同步回来">删除</button></div></article>';
  }).join('');
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
async function saveDescription(field){
  const description=field.innerText.trim();
  if(!description||description===field.dataset.origin)return;
  await mutate('/api/catalog/skills',{method:'PATCH',body:JSON.stringify({id:field.dataset.desc,description})},'已保存描述');
}
grid.addEventListener('focusout',async(event)=>{
  const field=event.target.closest('.description[data-desc]');
  if(field) await saveDescription(field);
});
grid.addEventListener('keydown',(event)=>{
  const field=event.target.closest('.description[data-desc]');
  if(!field||event.key!=='Enter'||event.shiftKey)return;
  event.preventDefault();
  field.blur();
});
grid.addEventListener('click',async(event)=>{
  const enable=event.target.closest('button[data-enable]');
  const remove=event.target.closest('button[data-remove]');
  if(enable){
    const skill=workspace.catalog.skills.find((item)=>item.id===enable.dataset.enable);
    await mutate('/api/catalog/skills',{method:'PATCH',body:JSON.stringify({id:skill.id,enabled:!skill.enabled})},skill.enabled?'已设为安装时跳过':'已设为安装时启用');
  }
  if(remove){
    const skill=workspace.catalog.skills.find((item)=>item.id===remove.dataset.remove);
    askConfirmation({
      title:'删除 Skill',
      message:'从目录删除后不再参与安装，但不会删除源文件。',
      detail:(skill?.name||remove.dataset.remove)+' · '+(skill?.source||''),
      action:()=>mutate('/api/catalog/skills?id='+encodeURIComponent(remove.dataset.remove),{method:'DELETE'},'已从目录删除'),
    });
    return;
  }
  const card=event.target.closest('[data-skill-detail]');
  if(card&&!event.target.closest('button,select,[contenteditable]'))location.href='/catalog/skill?id='+encodeURIComponent(card.dataset.skillDetail);
});
grid.addEventListener('keydown',(event)=>{
  const card=event.target.closest('[data-skill-detail]');
  if(card&&!event.target.closest('button,select,[contenteditable]')&&(event.key==='Enter'||event.key===' ')){
    event.preventDefault();
    location.href='/catalog/skill?id='+encodeURIComponent(card.dataset.skillDetail);
  }
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
[search,enabledFilter,typeFilter].forEach((element)=>element.addEventListener('input',render));
async function startPage(){
  const configStatus=await setupInitialization(()=>loadWorkspace());
  if(configStatus.initialized)await loadWorkspace();
}
void startPage();
</script>
</body>
</html>`;
