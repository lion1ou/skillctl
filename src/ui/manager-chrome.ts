export const MANAGER_STYLES = `
    :root{color-scheme:light;--bg:#F7F6F3;--panel:#FFFFFF;--line:#EAEAEA;--text:#2F3437;--muted:#787774;--green:#346538;--red:#9F2F2D;--blue:#1F6C9F}
    *{box-sizing:border-box}html,body{min-height:100%}body{min-height:100dvh;margin:0;background:var(--bg);color:var(--text);font:14px/1.6 "SF Pro Display","Geist Sans","Helvetica Neue",Arial,sans-serif}
    main{width:min(1240px,calc(100% - 40px));height:100dvh;margin:0 auto;padding:20px 0 24px;display:flex;flex-direction:column}
    .topbar{display:flex;align-items:center;justify-content:space-between;min-height:48px;border-bottom:1px solid var(--line)}
    .brand{display:flex;align-items:center;gap:9px;color:#111;text-decoration:none;font:600 21px/1 "Newsreader","Instrument Serif","Times New Roman",serif;letter-spacing:-.025em}.brand img{width:24px;height:24px;border-radius:6px}
    .nav-links{display:flex;align-items:center;gap:22px;height:48px}.nav-links a{position:relative;color:var(--muted);text-decoration:none;font-weight:500;transition:color .2s ease}
    .nav-links a::after{content:"";position:absolute;right:0;bottom:-14px;left:0;height:2px;background:#111;opacity:0;transform:scaleX(.65);transition:opacity .2s ease,transform .2s ease}
    .nav-links a:hover,.nav-links a.active{color:#111}.nav-links a.active::after{opacity:1;transform:scaleX(1)}
    .nav-links .config-entry{height:30px;padding:0 12px;border-radius:6px;border:1px solid #DEDEDB;background:#FFFFFF;color:var(--text);font:inherit;font-size:13px;font-weight:600;cursor:pointer}
    .nav-links .config-entry:hover{background:#F1F1EF}
    .page-header{display:flex;justify-content:space-between;gap:24px;align-items:flex-end;margin-bottom:20px}
    .page-title{font:500 28px/1.1 "Newsreader","Instrument Serif","Times New Roman",serif;letter-spacing:-.03em;margin:22px 0 5px}.subtitle{color:var(--muted);margin:0;max-width:680px;text-wrap:pretty}
    .summary{color:var(--muted)}.summary strong{color:var(--text)}
    .page-header .summary{text-align:right}
    .workspace-bar{display:flex;align-items:center;gap:8px;margin-bottom:14px;overflow:visible}.workspace-actions{display:flex;gap:8px;flex:none;margin-left:auto}
    .workspace-tabs{display:flex;flex-wrap:wrap;gap:10px;flex:1;min-width:0;padding:8px 8px 0 0;overflow:visible}
    .workspace-tab-wrap{position:relative;display:flex;overflow:visible}
    .workspace-tab{height:auto;min-height:32px;padding:6px 11px;border-radius:6px;background:transparent;color:var(--muted);border:1px solid transparent;font-weight:500}
    .workspace-tab:hover{background:#FBFBFA;border-color:var(--line)}.workspace-tab.active{color:var(--text);background:#FFFFFF;border-color:#DCDCD8}
    .toolbar{display:grid;grid-template-columns:minmax(220px,1fr) 180px 180px;gap:10px;margin-bottom:20px}
    .installed-toolbar{grid-template-columns:minmax(160px,1fr) 128px 128px auto auto auto;align-items:center}.installed-toolbar>button{min-width:96px}
    input,select,textarea{width:100%;padding:0 12px;border:1px solid #DEDEDB;border-radius:6px;background:#FFFFFF;color:var(--text);outline:none;font:inherit}
    input,select{height:36px}textarea{min-height:56px;padding:8px 10px;resize:vertical}
    select{appearance:none;padding-right:38px;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 14 14' fill='none'%3E%3Cpath d='m3 5 4 4 4-4' stroke='%23787774' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");background-repeat:no-repeat;background-position:right 12px center;background-size:14px}
    input:focus,select:focus,textarea:focus{border-color:#8A8A86;box-shadow:0 0 0 3px rgba(47,52,55,.05)}
    .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:10px}
    .card{display:flex;flex-direction:column;min-width:0;padding:16px;border:1px solid #EAEAEA;border-radius:8px;background:#FFFFFF;transition:transform .2s ease,box-shadow .2s ease}
    .card:hover{transform:translateY(-1px);box-shadow:0 2px 8px rgba(47,52,55,.04)}.card.clickable{cursor:pointer}.card.clickable:focus-visible{outline:2px solid #787774;outline-offset:2px}
    .card>button{margin-top:auto}
    .card-head{display:flex;align-items:flex-start;justify-content:space-between;gap:8px;min-height:2.7em}.skill-title{display:flex;align-items:flex-start;gap:8px;min-width:0}.skill-select{display:grid;place-items:center;flex:none;margin-top:1px}.skill-select input{width:16px;height:16px;flex:none}.name{font-size:14px;font-weight:600;overflow-wrap:anywhere;line-height:1.35}
    .badges{display:flex;flex-wrap:wrap;gap:5px;margin:6px 0 8px}.badge{padding:2px 7px;border-radius:9999px;background:#F1F1EF;color:#666662;font-size:10px;line-height:1.5;letter-spacing:.04em;text-transform:uppercase}
    .badge.on{background:#EDF3EC;color:var(--green)}.badge.off{background:#FDEBEC;color:var(--red)}.badge.broken{background:#FDEBEC;color:var(--red)}
    .badge.local,.badge.symlink,.badge.category{background:#FBF3DB;color:#956400}.badge.external,.badge.copy,.badge.uncategorized{background:#F1F1EF;color:#666662}
    .badge.cursor,.badge.claude,.badge.kiro,.badge.agents,.badge.codex,.badge.openclaw,.badge.hermes,.badge.gemini,.badge.copilot,.badge.windsurf,.badge.roo,.badge.opencode,.badge.openhands,.badge.droid,.badge.continue,.badge.trae,.badge.trae-cn,.badge.workbuddy,.badge.qoder,.badge.qoder-cn,.badge.codebuddy,.badge.qwen{background:#E1F3FE;color:#1F6C9F}
    .description{color:#555A5D;margin:0 0 8px;font-size:13px;line-height:1.5;white-space:normal;overflow-wrap:anywhere;word-break:break-word}
    .description.readonly{display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:3;min-height:calc(1.45em * 3);max-height:calc(1.45em * 3);overflow:hidden}
    .description[contenteditable]{cursor:text;border-radius:8px;min-height:1.4em}
    .description[contenteditable]:hover{background:#FBFBFA}.description[contenteditable]:focus{outline:1px solid #D8D8D4;padding:6px 8px;background:#FBFBFA;max-height:none;-webkit-line-clamp:unset;display:block}
    .path{margin:0 0 8px;font:11px/1.45 "Geist Mono","SF Mono","JetBrains Mono",monospace;color:var(--muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;cursor:help}
    [hidden]{display:none!important}
    dl{display:grid;grid-template-columns:52px 1fr;gap:4px 8px;margin:0 0 8px;font-size:11px}dt{color:var(--muted)}dd{margin:0;overflow-wrap:anywhere;color:#555A5D}
    button{height:32px;border:1px solid #111;border-radius:6px;padding:0 12px;font-weight:600;font-size:13px;cursor:pointer;background:#111;color:#FFFFFF;transition:background .2s ease,transform .15s ease}button:hover{background:#333}button:active{transform:scale(.98)}button:focus-visible,a:focus-visible{outline:2px solid #787774;outline-offset:2px}
    button.disable{border-color:#F4DADB;background:#FDEBEC;color:#9F2F2D}button.disable:hover{background:#F9DDDF}
    button.positive{border-color:#D6E6D5;background:#EDF3EC;color:var(--green)}button.positive:hover{background:#E4EEE2}
    button.danger{border-color:#F4DADB;background:#FDEBEC;color:var(--red)}button.danger:hover{background:#F9DDDF}
    .strategy-toggle{height:26px;padding:0 8px;border-radius:9999px;font-size:11px;white-space:nowrap}.strategy-toggle.on{border-color:#D6E6D5;background:#EDF3EC;color:var(--green)}.strategy-toggle.off{border-color:#E4E2DE;background:#F1F1EF;color:#666662}
    button.ghost{background:#FFFFFF;color:var(--text);border:1px solid #DEDEDB}button.ghost:hover{background:#F1F1EF}button:disabled{cursor:wait;opacity:.45}
    .empty{grid-column:1/-1;padding:64px 20px;text-align:center;border:1px dashed #D8D8D4;border-radius:8px;color:var(--muted)}
    .notice{display:none;margin-bottom:14px;padding:10px 12px;border-radius:6px;background:#FDEBEC;color:var(--red)}.notice.show{display:block}
    .notice.ok{background:#EDF3EC;color:var(--green)}.symlink-note{color:#956400;font-size:11px;margin:0 0 8px}
    .layout{display:grid;grid-template-columns:280px minmax(0,1fr);gap:14px;align-items:stretch;flex:1;min-height:0}
    .layout>.panel{min-height:0;overflow:auto}
    .catalog-main{display:flex;flex-direction:column;min-height:0}
    .catalog-scroll{flex:1;min-height:0;overflow:auto;padding-right:2px}
    .panel{padding:16px;border:1px solid #EAEAEA;border-radius:8px;background:#FFFFFF}
    .panel h2{margin:0;font-size:14px}.panel-heading{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:10px}
    .panel-heading button{height:28px;padding:0 9px;font-size:12px;flex:none}
    #categoryEditor{margin-top:18px;padding-top:16px;border-top:1px solid var(--line)}#categoryEditor h3{margin:0 0 10px;font-size:13px}.category-fields{display:grid;gap:10px}.category-fields .field{margin:0}.category-fields textarea{overflow:hidden}
    .list{overflow:visible;padding:8px 8px 0 0}.list button{width:100%;height:auto;min-height:34px;margin-bottom:6px;text-align:left;padding:7px 10px;line-height:1.35}
    .list button.active{border-color:#D8D8D4;background:#F1F1EF;color:#111}.list button .meta{display:block;margin-top:3px;font:400 11px/1.4 "Geist Mono","SF Mono","JetBrains Mono",monospace;color:var(--muted)}
    .list button.missing{opacity:.62}.actions{display:flex;gap:6px;margin-top:8px}.card>.actions{margin-top:auto}.actions>*{min-width:0}.actions button,.actions select{flex:1}
    .list{overflow:visible;padding:8px 8px 0 0}.agent-row{position:relative;display:flex;gap:5px;align-items:stretch;overflow:visible;margin-bottom:6px}.agent-row>button[data-agent]{flex:1;margin-bottom:0}
    .corner-delete{position:absolute;top:-8px;right:-8px;z-index:2;width:20px!important;height:20px!important;min-height:0!important;padding:0!important;border-radius:9999px!important;border:1px solid #F4DADB;background:#FDEBEC;color:var(--red);font-size:14px;line-height:1;display:grid;place-items:center;box-shadow:0 1px 3px rgba(47,52,55,.08)}.corner-delete:hover{background:#F9DDDF}
    .install-groups{display:grid;gap:8px;max-height:360px;overflow:auto;margin-top:12px}.install-group{border:1px solid var(--line);border-radius:6px;overflow:hidden}.install-group-head{display:flex;align-items:center;background:#FAF9F7}.install-category-check{display:grid;place-items:center;padding:10px 4px 10px 12px}.install-category-check input{width:16px;height:16px;flex:none}.install-category-toggle{display:flex;align-items:center;gap:8px;flex:1;height:auto;padding:10px 12px 10px 6px;border:0;background:transparent;color:var(--text);text-align:left}.install-category-toggle:hover{background:#F5F4F1}.install-category-toggle>span:first-child{flex:1;font-weight:600}.install-category-toggle small{color:var(--muted)}.install-chevron{font-size:18px;line-height:1;transition:transform .15s}.install-category-toggle[aria-expanded="true"] .install-chevron{transform:rotate(90deg)}.install-group-skills{display:grid;gap:6px;padding:8px;border-top:1px solid var(--line)}.install-group-skills label{display:flex;align-items:flex-start;gap:9px;padding:9px;border-radius:6px}.install-group-skills label:hover{background:#F7F6F3}.install-group-skills input{width:16px;height:16px;margin-top:2px;flex:none}.install-group-skills strong,.install-group-skills small{display:block}.install-group-skills small{color:var(--muted);font:11px/1.4 "Geist Mono","SF Mono",monospace}
    .field{display:grid;gap:6px;margin:8px 0}.field>span{color:var(--muted);font-size:12px}
    .path-input{display:flex;gap:8px;align-items:center}.path-input>input{flex:1;min-width:0}.path-input>button{flex:none;height:36px}
    .choice-list{display:grid;gap:6px;max-height:320px;overflow:auto;margin-top:12px}.choice-list label{display:flex;align-items:flex-start;gap:9px;padding:9px;border:1px solid var(--line);border-radius:6px}.choice-list input{width:16px;height:16px;margin-top:2px;flex:none}.choice-list strong,.choice-list small{display:block}.choice-list small{color:var(--muted);font:11px/1.4 "Geist Mono","SF Mono",monospace}
    .check-row{display:flex;gap:8px;align-items:center;color:#555A5D}.check-row input{width:16px;height:16px;flex:none}
    .detail-header{align-items:flex-start}.back-link{display:inline-block;margin-top:18px;color:var(--muted);text-decoration:none}.back-link:hover{color:var(--text)}
    .skill-detail-layout{display:grid;grid-template-columns:260px minmax(0,1fr);gap:14px;min-height:0;overflow:auto}.detail-meta{align-self:start}.detail-meta h2{margin:0 0 10px}.detail-meta h2:not(:first-child){margin-top:20px}.detail-meta dl{grid-template-columns:48px minmax(0,1fr);font-size:12px}.detail-source-path{white-space:normal;overflow-wrap:anywhere}.detail-document{min-width:0;overflow:auto}.detail-document section+section{margin-top:24px;padding-top:20px;border-top:1px solid var(--line)}.detail-section-heading{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:12px}.detail-section-heading h2{margin:0;font-size:14px}
    .yaml-source,.markdown-body pre{margin:0;padding:14px;border:1px solid var(--line);border-radius:6px;background:#F7F6F3;overflow:auto;font:12px/1.65 "Geist Mono","SF Mono","JetBrains Mono",monospace}.yaml-source{color:#555A5D;white-space:pre}.markdown-body{color:#3F4447;font-size:14px;line-height:1.75}.markdown-body>:first-child{margin-top:0}.markdown-body>:last-child{margin-bottom:0}.markdown-body h1,.markdown-body h2,.markdown-body h3,.markdown-body h4{color:var(--text);line-height:1.3;margin:1.6em 0 .55em}.markdown-body h1{font-size:24px}.markdown-body h2{font-size:19px;border-bottom:1px solid var(--line);padding-bottom:6px}.markdown-body h3{font-size:16px}.markdown-body p{margin:.8em 0}.markdown-body ul,.markdown-body ol{padding-left:24px}.markdown-body blockquote{margin:1em 0;padding:3px 14px;border-left:3px solid #D8D8D4;color:var(--muted)}.markdown-body code{padding:2px 5px;border-radius:4px;background:#F1F1EF;font:12px/1.5 "Geist Mono","SF Mono","JetBrains Mono",monospace}.markdown-body pre code{padding:0;background:transparent}.markdown-body a{color:var(--blue);text-decoration-thickness:1px;text-underline-offset:2px}
    dialog{width:min(520px,calc(100% - 32px));border:1px solid #EAEAEA;border-radius:8px;background:#FFFFFF;color:var(--text);padding:0;box-shadow:0 20px 60px rgba(47,52,55,.04)}dialog::backdrop{background:rgba(47,52,55,.24)}dialog form{padding:24px}dialog h2{margin:0 0 6px}.dialog-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:18px}
    dialog.install-dialog{width:min(720px,calc(100% - 32px))}
    .install-log{display:none;margin:12px 0 0;max-height:240px;overflow:auto;padding:12px 14px;border-radius:6px;background:#1B1F23;color:#E6EDF3;font:11px/1.55 "Geist Mono","SF Mono","JetBrains Mono",monospace;white-space:pre-wrap;overflow-wrap:anywhere}
    .install-log.show{display:block}.confirm-detail{padding:10px 12px;border-radius:6px;background:#F7F6F3;color:#555A5D;font:12px/1.6 "Geist Mono","SF Mono",monospace;overflow-wrap:anywhere}.compact{padding:24px 12px}
    .init-form{padding:24px}.init-form h2{margin:0 0 6px}.init-form>.subtitle{margin-bottom:18px}
    .init-form label{display:grid;gap:6px;margin:12px 0;color:#555A5D}.init-form label span{font-size:12px;color:var(--muted)}
    .init-form .config-path{margin-top:14px;font-size:11px;color:var(--muted);overflow-wrap:anywhere}
    .init-form .actions{display:flex;justify-content:flex-end;gap:8px;margin-top:18px}.init-form .actions button{flex:0 0 auto}
    .sync{margin-bottom:14px}
    .sync-list{display:grid;gap:6px;max-height:228px;overflow:auto;margin:10px 0 0}
    .sync-list label{display:flex;align-items:flex-start;gap:9px;padding:9px 10px;border:1px solid var(--line);border-radius:6px}
    .sync-list input{width:16px;height:16px;margin-top:2px;flex:none}.sync-list label>span{flex:1;min-width:0}
    .sync-name{display:block;font-size:13px;font-weight:600;overflow-wrap:anywhere}
    .sync-desc{display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;overflow:hidden;margin-top:3px;color:var(--muted);font-size:12px;line-height:1.5;overflow-wrap:anywhere}
    .sync .actions{justify-content:flex-end}.sync .actions select{flex:0 1 240px}.sync .actions button{flex:0 0 auto}
    form .row{display:grid;gap:8px;margin-bottom:10px}
    @media(max-width:860px){
      body{min-height:100%}main{width:min(100% - 24px,720px);height:auto;min-height:100dvh;padding-top:12px}.page-header,.layout,.toolbar{display:block}.page-header .summary{width:100%;margin-top:12px;text-align:left}.summary{margin-top:12px}
      .grid{grid-template-columns:1fr}.topbar{position:static}
      .installed-toolbar>button{width:100%;margin-top:10px}
      .layout{flex:none;min-height:auto}.layout>.panel{max-height:none;margin-bottom:14px;overflow:visible}
      .catalog-main{min-height:auto}.catalog-scroll{overflow:visible}
      .skill-detail-layout{display:block;overflow:visible}.detail-meta{margin-bottom:14px}.detail-document{overflow:visible}
    }
`;

/** 区分已安装 Skill 页和配置表页的主导航。 */
export function renderManagerNav(active: 'installed' | 'catalog'): string {
  const installed = active === 'installed' ? ' active' : '';
  const catalog = active === 'catalog' ? ' active' : '';
  return `<nav class="topbar" aria-label="主导航"><a class="brand" href="/"><img src="/assets/skillctl-icon.png" alt="">skill-ctl</a><div class="nav-links"><a class="nav-link${installed}" href="/">安装管理</a><a class="nav-link${catalog}" href="/catalog">Skill 目录</a><button type="button" class="config-entry" id="initConfigButton">路径配置</button></div></nav>`;
}

/** 两个管理页面共用的初始化配置弹窗。 */
export function renderInitializationDialog(): string {
  return `<dialog id="initializationDialog">
    <form class="init-form" id="initializationForm">
      <h2>初始化 skillctl</h2>
      <p class="subtitle">关联 Skill 源目录和缓存目录。源目录缺少配置表时会自动创建。</p>
      <label><span>Skill 源目录（绝对路径）</span><span class="path-input"><input name="sourceDir" placeholder="/Users/name/skill-catalog" required><button type="button" class="ghost" data-pick-kind="source">选择目录</button></span></label>
      <label><span>缓存目录（绝对路径）</span><span class="path-input"><input name="cacheDir" placeholder="/Users/name/.cache/skillctl" required><button type="button" class="ghost" data-pick-kind="cache">选择目录</button></span></label>
      <div class="notice" id="initializationNotice"></div>
      <p class="config-path" id="configPath"></p>
      <div class="actions">
        <button type="button" class="ghost" id="cancelInitialization">取消</button>
        <button type="submit" id="saveInitialization">保存配置</button>
      </div>
    </form>
  </dialog>`;
}

/** 页面需先声明 request/showNotice，再调用 setupInitialization。 */
export const INITIALIZATION_SCRIPT = `
async function setupInitialization(onInitialized){
  const dialog=document.querySelector('#initializationDialog');
  const form=document.querySelector('#initializationForm');
  const entry=document.querySelector('#initConfigButton');
  const cancel=document.querySelector('#cancelInitialization');
  const save=document.querySelector('#saveInitialization');
  const configPath=document.querySelector('#configPath');
  const initializationNotice=document.querySelector('#initializationNotice');
  let status={initialized:false,sourceDir:'',cacheDir:'',configPath:''};
  let isPickingDirectory=false;

  function applyStatus(next){
    status=next;
    form.elements.sourceDir.value=next.sourceDir||'';
    form.elements.cacheDir.value=next.cacheDir||'';
    configPath.textContent='配置文件：'+(next.configPath||'');
    cancel.hidden=!next.initialized;
  }
  function openDialog(){
    if(!dialog.open)dialog.showModal();
    form.elements.sourceDir.focus();
  }
  function showInitializationError(error){
    initializationNotice.textContent=error instanceof Error?error.message:'初始化失败';
    initializationNotice.classList.add('show');
  }

  dialog.addEventListener('click',async(event)=>{
    const button=event.target.closest('[data-pick-kind]');
    if(!button||isPickingDirectory)return;
    const kind=button.dataset.pickKind;
    const input=form.elements[kind==='cache'?'cacheDir':'sourceDir'];
    if(!input)return;
    isPickingDirectory=true;
    button.disabled=true;
    try{
      const data=await request('/api/directories/pick',{method:'POST',body:JSON.stringify({kind})});
      if(data.path)input.value=data.path;
    }catch(error){
      showInitializationError(error);
    }finally{
      isPickingDirectory=false;
      button.disabled=false;
    }
  });
  entry.addEventListener('click',openDialog);
  cancel.addEventListener('click',()=>dialog.close());
  dialog.addEventListener('cancel',(event)=>{
    if(!status.initialized)event.preventDefault();
  });
  form.addEventListener('submit',async(event)=>{
    event.preventDefault();
    if(status.initialized&&!confirm('保存会覆盖当前初始化配置。继续吗？'))return;
    save.disabled=true;
    initializationNotice.classList.remove('show');
    try{
      const data=Object.fromEntries(new FormData(form).entries());
      applyStatus(await request('/api/init',{method:'POST',body:JSON.stringify({...data,force:status.initialized})}));
      dialog.close();
      showNotice('初始化配置已保存',true);
      await onInitialized();
    }catch(error){
      showInitializationError(error);
    }finally{
      save.disabled=false;
    }
  });

  try{
    applyStatus(await request('/api/status'));
    if(!status.initialized)openDialog();
  }catch(error){
    showInitializationError(error);
    openDialog();
  }
  return status;
}
`;
