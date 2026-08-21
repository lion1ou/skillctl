export const MANAGER_STYLES = `
    :root{color-scheme:dark;--bg:#0b0d12;--panel:#131720;--line:#262c38;--text:#f5f7fb;--muted:#929bad;--green:#54d69b;--red:#ff7b86;--blue:#6ea8fe}
    *{box-sizing:border-box}body{margin:0;background:radial-gradient(circle at 10% 0,#172033 0,transparent 32%),var(--bg);color:var(--text);font:14px/1.5 ui-sans-serif,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
    main{width:min(1180px,calc(100% - 32px));margin:0 auto;padding:32px 0 72px}
    .tabs{display:flex;gap:8px;margin-bottom:22px}.tabs a{padding:8px 14px;border-radius:999px;color:var(--muted);text-decoration:none;border:1px solid var(--line)}
    .tabs a.active{color:var(--text);background:#1b2230;border-color:#3b4a66}
    header{display:flex;justify-content:space-between;gap:24px;align-items:flex-end;margin-bottom:20px}
    h1{font-size:32px;letter-spacing:-.04em;margin:0 0 6px}.subtitle{color:var(--muted);margin:0}
    .summary{color:var(--muted)}.summary strong{color:var(--text)}
    .toolbar{display:grid;grid-template-columns:minmax(220px,1fr) 180px 180px;gap:10px;margin-bottom:20px}
    input,select,textarea{width:100%;padding:0 12px;border:1px solid var(--line);border-radius:10px;background:#10141c;color:var(--text);outline:none;font:inherit}
    input,select{height:36px}textarea{min-height:56px;padding:8px 10px;resize:vertical}
    input:focus,select:focus,textarea:focus{border-color:var(--blue)}
    .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:10px}
    .card{display:flex;flex-direction:column;padding:12px 13px;border:1px solid var(--line);border-radius:12px;background:linear-gradient(145deg,#151a24,#11151d)}
    .card>button{margin-top:auto}
    .card-head{display:flex;align-items:flex-start;justify-content:space-between;gap:8px;min-height:2.7em}.name{font-size:14px;font-weight:700;overflow-wrap:anywhere;line-height:1.35}
    .badges{display:flex;flex-wrap:wrap;gap:5px;margin:6px 0 8px}.badge{padding:2px 7px;border-radius:999px;background:#222938;color:#b8c0cf;font-size:11px;line-height:1.4}
    .badge.on{background:#17372c;color:var(--green)}.badge.off{background:#3b2025;color:var(--red)}
    .badge.local{background:#14363a;color:#6fe0d2}.badge.external{background:#2c2150;color:#c4b0ff}
    .badge.symlink{background:#3a3014;color:#e7c779}.badge.copy{background:#243044;color:#9db4d4}
    .badge.category{background:#1a2f48;color:#7eb6ff}.badge.uncategorized{background:#2a2f3a;color:#9aa3b5}
    .badge.cursor{background:#16324a;color:#6ec8ff}.badge.claude{background:#3a2416;color:#ffb086}
    .badge.kiro{background:#3a1630;color:#f5a3d0}.badge.agents{background:#16243a;color:#8bb4ff}
    .badge.codex{background:#26164a;color:#c4b0ff}.badge.openclaw{background:#163a28;color:#7ee0a8}
    .badge.hermes{background:#3a3010;color:#f0d27a}
    .description{color:#c4cad5;margin:0 0 8px;font-size:13px;line-height:1.45;white-space:normal;overflow-wrap:anywhere;word-break:break-word}
    .description.readonly{display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:3;min-height:calc(1.45em * 3);max-height:calc(1.45em * 3);overflow:hidden}
    .description[contenteditable]{cursor:text;border-radius:8px;min-height:1.4em}
    .description[contenteditable]:hover{background:#10141c}
    .description[contenteditable]:focus{outline:1px solid var(--blue);padding:6px 8px;background:#10141c;max-height:none;-webkit-line-clamp:unset;display:block}
    .path{margin:0 0 8px;font-size:11px;color:var(--muted);overflow-wrap:anywhere;line-height:1.4}
    dl{display:grid;grid-template-columns:52px 1fr;gap:4px 8px;margin:0 0 8px;font-size:11px}dt{color:var(--muted)}dd{margin:0;overflow-wrap:anywhere;color:#b8c0cf}
    button{height:32px;border:0;border-radius:8px;font-weight:700;font-size:13px;cursor:pointer;background:var(--text);color:#10131a}button.disable{background:#352126;color:#ff9aa3}
    button.ghost{background:#1b2230;color:var(--text);border:1px solid var(--line)}button:disabled{cursor:wait;opacity:.55}
    .empty{grid-column:1/-1;padding:64px 20px;text-align:center;border:1px dashed var(--line);border-radius:14px;color:var(--muted)}
    .notice{display:none;margin-bottom:16px;padding:11px 13px;border-radius:9px;background:#3b2025;color:#ffadb4}.notice.show{display:block}
    .notice.ok{background:#17372c;color:var(--green)}.symlink-note{color:#e7c779;font-size:11px;margin:0 0 8px}
    .layout{display:grid;grid-template-columns:280px minmax(0,1fr);gap:14px;align-items:start}
    .layout>.panel{position:sticky;top:16px;max-height:calc(100vh - 32px);overflow:auto}
    .catalog-main{display:flex;flex-direction:column;min-height:0;max-height:calc(100vh - 180px)}
    .catalog-scroll{flex:1;min-height:0;overflow:auto;padding-right:2px}
    .panel{padding:14px;border:1px solid var(--line);border-radius:12px;background:var(--panel)}
    .panel h2{margin:0 0 10px;font-size:14px}
    .list button{width:100%;height:auto;min-height:34px;margin-bottom:6px;text-align:left;padding:7px 10px;line-height:1.35}
    .list button.active{background:#243044;color:#fff}.list button .meta{display:block;margin-top:3px;font-size:11px;font-weight:400;color:var(--muted);line-height:1.4}
    .list button.missing{opacity:.62}.actions{display:flex;gap:6px;margin-top:8px}.actions button,.actions select{flex:1}
    .cats{display:grid;gap:6px;margin:8px 0}.cats label{display:flex;gap:8px;align-items:flex-start;color:#c4cad5;font-size:13px}
    .cats input{width:16px;height:16px;margin-top:2px;flex:none}.field{display:grid;gap:6px;margin:8px 0}.field span{color:var(--muted);font-size:12px}
    .sync{margin-bottom:16px}.sync label{display:flex;gap:8px;align-items:center;margin:6px 0;color:#c4cad5}
    form .row{display:grid;gap:8px;margin-bottom:10px}
    @media(max-width:860px){
      main{padding-top:24px}header,.layout,.toolbar{display:block}.summary{margin-top:12px}
      .grid{grid-template-columns:1fr}.tabs{flex-wrap:wrap}
      .layout>.panel{position:static;max-height:none}
      .catalog-main{max-height:none}.catalog-scroll{overflow:visible}
    }
`;

/** 区分已安装 Skill 页和配置表页的主导航。 */
export function renderManagerNav(active: 'installed' | 'catalog'): string {
  const installed = active === 'installed' ? ' active' : '';
  const catalog = active === 'catalog' ? ' active' : '';
  return `<nav class="tabs"><a class="tab${installed}" href="/">已安装 Skill</a><a class="tab${catalog}" href="/catalog">配置表</a></nav>`;
}
