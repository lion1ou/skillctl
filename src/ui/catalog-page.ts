import { MANAGER_STYLES, renderManagerNav } from './manager-chrome.js';

export const CATALOG_PAGE = `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>skill-ctl · 配置表</title>
  <style>${MANAGER_STYLES}</style>
</head>
<body>
<main>
  ${renderManagerNav('catalog')}
  <header>
    <div>
      <h1>配置表</h1>
      <p class="subtitle">编辑 skillctl-skills.json 与 skillctl-categories.json。这里的启用只影响安装，不会改已安装目录里的 SKILL.md。</p>
    </div>
    <div class="summary" id="summary">正在读取配置表…</div>
  </header>
  <div class="notice" id="notice"></div>
  <section class="sync panel" id="syncPanel" hidden>
    <h2>同步未登记本地 Skill</h2>
    <p class="subtitle" id="syncHint"></p>
    <div id="syncList"></div>
    <div class="actions">
      <select id="syncCategory"></select>
      <button id="syncButton">同步到配置表</button>
    </div>
  </section>
  <div class="layout">
    <aside class="panel">
      <h2>分类</h2>
      <div class="list" id="categoryList"></div>
      <div id="categoryEditor" hidden>
        <div class="row"><input id="editCategoryName" placeholder="分类名称"></div>
        <div class="row"><input id="editCategoryDescription" placeholder="分类描述"></div>
        <div class="actions">
          <button type="button" id="saveCategory">保存分类</button>
          <button type="button" class="disable" id="deleteCategory">删除空分类</button>
        </div>
      </div>
      <form id="categoryForm">
        <div class="row"><input name="id" placeholder="分类 id，如 write" required></div>
        <div class="row"><input name="name" placeholder="分类名称" required></div>
        <div class="row"><input name="description" placeholder="分类描述" required></div>
        <button type="submit">新增分类</button>
      </form>
    </aside>
    <section class="catalog-main">
      <div class="toolbar">
        <input id="search" placeholder="搜索配置表中的 skill">
        <select id="enabledFilter"><option value="">全部启用状态</option><option value="on">安装时启用</option><option value="off">安装时跳过</option></select>
        <select id="typeFilter"><option value="">全部类型</option><option value="local">local</option><option value="external">external</option></select>
      </div>
      <div class="catalog-scroll">
        <div class="grid" id="grid"><div class="empty">正在读取配置表…</div></div>
      </div>
    </section>
  </div>
</main>
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
const escapeHtml=(value)=>String(value).replace(/[&<>"']/g,(char)=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));

function showNotice(message,ok=false){
  notice.textContent=message;
  notice.classList.toggle('ok',ok);
  notice.classList.add('show');
}
function clearNotice(){notice.classList.remove('show','ok')}
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
    document.querySelector('#editCategoryDescription').value=selected.description;
  }
  const syncSelect=document.querySelector('#syncCategory');
  syncSelect.innerHTML=cats.map((category)=>'<option value="'+escapeHtml(category.id)+'">'+escapeHtml(category.name)+'</option>').join('');
  const syncPanel=document.querySelector('#syncPanel');
  if(workspace.unregistered.length===0){syncPanel.hidden=true}
  else{
    syncPanel.hidden=false;
    document.querySelector('#syncHint').textContent='源目录 skills/ 中发现尚未写入配置表的本地 Skill。';
    document.querySelector('#syncList').innerHTML=workspace.unregistered.map((skill)=>'<label><input type="checkbox" name="syncSkill" value="'+escapeHtml(skill.id)+'" checked><span>'+escapeHtml(skill.name)+' · '+escapeHtml(skill.description)+'</span></label>').join('');
  }
  const skills=visibleSkills();
  if(skills.length===0){grid.innerHTML='<div class="empty">没有符合条件的配置项</div>';return}
  grid.innerHTML=skills.map((skill)=>{
    const category=categoryOf(skill.id);
    const options=cats.map((item)=>'<option value="'+escapeHtml(item.id)+'" '+(item.id===category?.id?'selected':'')+'>'+escapeHtml(item.name)+'</option>').join('');
    return '<article class="card"><div class="card-head"><div class="name">'+escapeHtml(skill.name)+'</div><span class="badge '+(skill.enabled?'on':'off')+'">'+(skill.enabled?'安装启用':'安装跳过')+'</span></div><div class="badges"><span class="badge '+escapeHtml(skill.type)+'">'+escapeHtml(skill.type)+'</span><span class="badge '+(category?'category':'uncategorized')+'">'+escapeHtml(category?.name||'未分类')+'</span></div><p class="description" contenteditable="true" data-desc="'+escapeHtml(skill.id)+'" data-origin="'+escapeHtml(skill.description)+'">'+escapeHtml(skill.description)+'</p><p class="path">'+escapeHtml(skill.source)+' · '+escapeHtml(skill.package)+'</p><div class="actions"><select data-move="'+escapeHtml(skill.id)+'">'+options+'</select><button data-enable="'+escapeHtml(skill.id)+'" class="'+(skill.enabled?'disable':'')+'" title="'+(skill.enabled?'设为安装时跳过：下次 install 不会装到各 target，不改已落地文件':'设为安装时启用：下次 install 会按选择安装到 target')+'">'+(skill.enabled?'跳过':'启用')+'</button><button class="disable" data-remove="'+escapeHtml(skill.id)+'" title="仅从配置表移除登记，不删源目录文件；之后可再同步回来">移出</button></div></article>';
  }).join('');
}

async function request(url,options={}){
  const response=await fetch(url,{...options,headers:{'x-skillctl-token':token,'content-type':'application/json',...(options.headers||{})}});
  if(!response.ok)throw new Error(await response.text());
  return response.json();
}
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
});
document.querySelector('#saveCategory').addEventListener('click',async()=>{
  if(!currentCategory||currentCategory==='__uncategorized__')return;
  await mutate('/api/catalog/categories',{method:'PATCH',body:JSON.stringify({id:currentCategory,name:document.querySelector('#editCategoryName').value,description:document.querySelector('#editCategoryDescription').value})},'已保存分类');
});
document.querySelector('#deleteCategory').addEventListener('click',async()=>{
  if(!currentCategory||currentCategory==='__uncategorized__')return;
  if(!confirm('仅能删除空分类。继续吗？'))return;
  await mutate('/api/catalog/categories?id='+encodeURIComponent(currentCategory),{method:'DELETE'},'已删除分类');
  currentCategory='';
  render();
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
    if(!confirm('从配置表移除后不会删除源文件，可再次同步。继续吗？'))return;
    await mutate('/api/catalog/skills?id='+encodeURIComponent(remove.dataset.remove),{method:'DELETE'},'已移出配置表');
  }
});
grid.addEventListener('change',async(event)=>{
  const select=event.target.closest('select[data-move]');
  if(!select)return;
  await mutate('/api/catalog/skills',{method:'PATCH',body:JSON.stringify({id:select.dataset.move,categoryId:select.value})},'已更新分类');
});
[search,enabledFilter,typeFilter].forEach((element)=>element.addEventListener('input',render));
loadWorkspace();
</script>
</body>
</html>`;
