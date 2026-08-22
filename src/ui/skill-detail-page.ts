import {
  renderSkillMarkdown,
  splitSkillDocument,
} from './catalog-page.js';
import { MANAGER_STYLES, renderManagerNav } from './manager-chrome.js';

/** 清除运行器为函数命名注入的辅助调用，使源码可在独立浏览器脚本中执行。 */
function browserFunctionSource(fn: (input: string) => unknown): string {
  return fn.toString().replace(/__name\d*\([\w$]+,\s*["'][^"']+["']\);?/g, '');
}

export const SKILL_DETAIL_PAGE = `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <link rel="icon" href="/favicon.ico">
  <title>skill-ctl · Skill 详情</title>
  <style>${MANAGER_STYLES}</style>
</head>
<body>
<main>
  ${renderManagerNav('catalog')}
  <header class="page-header detail-header">
    <div>
      <a class="back-link" href="/catalog">← 返回 Skill 目录</a>
      <h1 class="page-title" id="skillTitle">Skill 详情</h1>
      <p class="subtitle" id="skillDescription">正在读取 SKILL.md…</p>
    </div>
  </header>
  <div class="notice" id="notice"></div>
  <div class="skill-detail-layout" id="detailLayout" hidden>
    <aside class="panel detail-meta">
      <h2 id="metaHeading">登记信息</h2>
      <dl id="catalogMeta">
        <dt>ID</dt><dd id="skillId"></dd>
        <dt>类型</dt><dd id="skillType"></dd>
        <dt>包</dt><dd id="skillPackage"></dd>
        <dt>版本</dt><dd id="skillVersion"></dd>
        <dt>分类</dt><dd id="skillCategory"></dd>
        <dt>状态</dt><dd id="skillEnabled"></dd>
      </dl>
      <dl id="installedMeta" hidden>
        <dt>ID</dt><dd id="installedId"></dd>
        <dt>Agent</dt><dd id="installedTarget"></dd>
        <dt>状态</dt><dd id="installedEnabled"></dd>
        <dt>方式</dt><dd id="installedMode"></dd>
        <dt>路径</dt><dd id="installedPath"></dd>
        <dt id="installedSourceLabel" hidden>来源</dt><dd id="installedSource" hidden></dd>
      </dl>
      <h2>源文件</h2>
      <p class="path detail-source-path" id="sourcePath"></p>
    </aside>
    <article class="panel detail-document">
      <section id="yamlSection" hidden>
        <div class="detail-section-heading">
          <h2>YAML Frontmatter</h2>
          <span class="badge">YAML</span>
        </div>
        <pre class="yaml-source"><code id="yamlContent"></code></pre>
      </section>
      <section>
        <div class="detail-section-heading">
          <h2>Markdown 正文</h2>
          <span class="badge">Markdown</span>
        </div>
        <div class="markdown-body" id="markdownContent"></div>
      </section>
    </article>
  </div>
</main>
<script>
const token=__SKILLCTL_TOKEN__;
const splitSkillDocument=${browserFunctionSource(splitSkillDocument)};
const renderSkillMarkdown=${browserFunctionSource(renderSkillMarkdown)};
const notice=document.querySelector('#notice');
function showError(message){
  notice.textContent=message;
  notice.classList.add('show');
}
async function loadDetail(){
  const params=new URLSearchParams(location.search);
  const fromInstalled=params.get('from')==='installed';
  try{
    if(fromInstalled){
      document.querySelector('.back-link').href='/';
      document.querySelector('.back-link').textContent='← 返回安装管理';
      document.querySelector('.nav-link[href="/"]').classList.add('active');
      document.querySelector('.nav-link[href="/catalog"]').classList.remove('active');
      document.querySelector('#metaHeading').textContent='安装信息';
      document.querySelector('#catalogMeta').hidden=true;
      document.querySelector('#installedMeta').hidden=false;
      const workspace=params.get('workspace')||'';
      const target=params.get('target')||'';
      const relativeDir=params.get('relativeDir')||'';
      if(!workspace||!target||!relativeDir){showError('缺少安装位置');return}
      const response=await fetch('/api/skills/detail?workspace='+encodeURIComponent(workspace)+'&target='+encodeURIComponent(target)+'&relativeDir='+encodeURIComponent(relativeDir),{headers:{'x-skillctl-token':token}});
      if(!response.ok)throw new Error(await response.text());
      const detail=await response.json();
      document.querySelector('#skillTitle').textContent=detail.skill.name;
      document.querySelector('#skillDescription').textContent=detail.skill.description;
      document.querySelector('#installedId').textContent=detail.skill.id;
      document.querySelector('#installedTarget').textContent=detail.skill.target;
      document.querySelector('#installedEnabled').textContent=detail.skill.isEnabled?'已启用':'未启用';
      document.querySelector('#installedMode').textContent=detail.skill.isSymlink?'软链':'复制';
      document.querySelector('#installedPath').textContent=detail.skill.installedPath;
      const sourceLabel=document.querySelector('#installedSourceLabel');
      const sourceValue=document.querySelector('#installedSource');
      if(detail.skill.linkTarget){
        sourceLabel.hidden=false;
        sourceValue.hidden=false;
        sourceValue.textContent=detail.skill.linkTarget;
      }
      document.querySelector('#sourcePath').textContent=detail.sourcePath;
      if(!detail.available){
        showError('源文件尚未准备：'+detail.sourcePath);
        return;
      }
      const documentParts=splitSkillDocument(detail.content);
      const yamlSection=document.querySelector('#yamlSection');
      yamlSection.hidden=!documentParts.frontmatter;
      document.querySelector('#yamlContent').textContent=documentParts.frontmatter;
      document.querySelector('#markdownContent').innerHTML=renderSkillMarkdown(documentParts.body);
      document.querySelector('#detailLayout').hidden=false;
      return;
    }
    const id=params.get('id')||'';
    if(!id){showError('缺少 Skill id');return}
    const response=await fetch('/api/catalog/skills/detail?id='+encodeURIComponent(id),{headers:{'x-skillctl-token':token}});
    if(!response.ok)throw new Error(await response.text());
    const detail=await response.json();
    document.querySelector('#skillTitle').textContent=detail.skill.name;
    document.querySelector('#skillDescription').textContent=detail.skill.description;
    document.querySelector('#skillId').textContent=detail.skill.id;
    document.querySelector('#skillType').textContent=detail.skill.type;
    document.querySelector('#skillPackage').textContent=detail.skill.package;
    document.querySelector('#skillVersion').textContent=detail.skill.version;
    document.querySelector('#skillCategory').textContent=detail.category?.name||'未分类';
    document.querySelector('#skillEnabled').textContent=detail.skill.enabled?'安装时启用':'安装时跳过';
    document.querySelector('#sourcePath').textContent=detail.sourcePath;
    if(!detail.available){
      showError('源文件尚未准备：'+detail.sourcePath);
      return;
    }
    const documentParts=splitSkillDocument(detail.content);
    const yamlSection=document.querySelector('#yamlSection');
    yamlSection.hidden=!documentParts.frontmatter;
    document.querySelector('#yamlContent').textContent=documentParts.frontmatter;
    document.querySelector('#markdownContent').innerHTML=renderSkillMarkdown(documentParts.body);
    document.querySelector('#detailLayout').hidden=false;
  }catch(error){
    showError(error instanceof Error?error.message:'读取 Skill 详情失败');
  }
}
loadDetail();
</script>
</body>
</html>`;
