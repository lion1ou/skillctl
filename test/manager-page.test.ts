import assert from 'node:assert/strict';
import test from 'node:test';
import * as catalogPage from '../src/ui/catalog-page.js';
import { MANAGER_STYLES } from '../src/ui/manager-chrome.js';
import * as managerPage from '../src/ui/manager-page.js';
import { SKILL_DETAIL_PAGE } from '../src/ui/skill-detail-page.js';

const { CATALOG_PAGE } = catalogPage;
const { MANAGER_PAGE } = managerPage;

test('安装管理页把新增与安装操作放在各自上下文中', () => {
  assert.match(MANAGER_PAGE, /id="workspaceTabs"/);
  assert.doesNotMatch(MANAGER_PAGE, /id="workspaceSelect"/);
  assert.match(MANAGER_PAGE, /class="workspace-bar"[\s\S]*id="addWorkspaceButton"[\s\S]*<\/div>/);
  assert.match(MANAGER_PAGE, /class="panel-heading"[\s\S]*id="addAgentButton"[\s\S]*<\/div>/);
  assert.match(MANAGER_PAGE, /class="toolbar installed-toolbar"[\s\S]*id="installButton"[\s\S]*<\/div>/);
  assert.match(MANAGER_PAGE, /<dialog id="installDialog"/);
  assert.doesNotMatch(MANAGER_PAGE, /id="installPanel"/);
});

test('标题栏组合品牌与安装、目录导航', () => {
  for (const page of [MANAGER_PAGE, CATALOG_PAGE]) {
    assert.match(page, /<nav class="topbar"/);
    assert.match(page, /class="brand"[^>]*>[\s\S]*skill-ctl<\/a>/);
    assert.match(page, />安装管理<\/a>/);
    assert.match(page, />Skill 目录<\/a>/);
    assert.doesNotMatch(page, /class="app-header"/);
    assert.doesNotMatch(page, /class="tabs"/);
  }
  assert.match(MANAGER_PAGE, /管理 Workspace、Agent 目录与已安装 Skill/);
  assert.match(CATALOG_PAGE, /维护 Skill 来源、分类与安装策略/);
});

test('管理页使用全高弹性布局与暖白极简视觉', () => {
  assert.match(MANAGER_STYLES, /min-height:100dvh/);
  assert.match(MANAGER_STYLES, /main\{[^}]*;height:100dvh;[^}]*display:flex[^}]*flex-direction:column/);
  assert.match(MANAGER_STYLES, /\.layout\{[^}]*flex:1[^}]*min-height:0/);
  assert.match(MANAGER_STYLES, /color-scheme:light/);
  assert.match(MANAGER_STYLES, /--bg:#F7F6F3/i);
  assert.doesNotMatch(MANAGER_STYLES, /gradient/i);
  assert.match(MANAGER_STYLES, /\.workspace-tab\{[^}]*border-radius:6px/);
  assert.match(MANAGER_STYLES, /\.badge\{[^}]*border-radius:9999px/);
});

test('窄屏卡片和操作栏允许内容收缩，避免横向溢出', () => {
  assert.match(MANAGER_STYLES, /\.card\{[^}]*min-width:0/);
  assert.match(MANAGER_STYLES, /\.actions>\*\{[^}]*min-width:0/);
});

test('安装管理页精简标题、按钮与搜索文案', () => {
  assert.match(MANAGER_PAGE, /<h2>Agent<\/h2>/);
  assert.match(MANAGER_PAGE, /id="addWorkspaceButton">新增<\/button>/);
  assert.match(MANAGER_PAGE, /id="addAgentButton">新增<\/button>/);
  assert.match(MANAGER_PAGE, /id="installButton" disabled>安装<\/button>/);
  assert.match(MANAGER_PAGE, /id="search" placeholder="搜索 Skill"/);
});

test('Workspace 与所有可见 Agent 使用行内危险删除按钮', () => {
  assert.match(MANAGER_PAGE, /data-remove-workspace=/);
  assert.match(MANAGER_PAGE, /data-delete-agent=/);
  assert.doesNotMatch(MANAGER_PAGE, /id="removeWorkspaceButton"/);
  assert.match(MANAGER_PAGE, /class="corner-delete"/);
  assert.match(MANAGER_STYLES, /\.corner-delete\{[^}]*top:-8px;right:-8px/);
  assert.match(MANAGER_STYLES, /\.corner-delete\{[^}]*border-radius:9999px/);
  assert.match(MANAGER_STYLES, /\.corner-delete\{[^}]*z-index:2/);
  assert.match(MANAGER_PAGE, /index===0\|\|item\.path!==currentWorkspace\?'':/);
  assert.match(MANAGER_PAGE, /agent\.id===currentAgent\?'<button[^']*corner-delete/);
});

test('Agent 路径省略 Workspace 前缀并支持批量复选固定', () => {
  assert.match(MANAGER_PAGE, /'…\/'\+agent\.skillsDir/);
  assert.match(MANAGER_PAGE, /name="agentTarget"/);
  assert.match(MANAGER_PAGE, /type="checkbox"/);
  assert.doesNotMatch(MANAGER_PAGE, /<select id="agentTarget"/);
});

test('安装页和 Skill 目录页提供删除确认弹窗', () => {
  assert.match(MANAGER_PAGE, /<dialog id="confirmDialog"/);
  assert.match(CATALOG_PAGE, /<dialog id="confirmDialog"/);
});

test('Skill 目录卡片只保留一个安装策略控件并通过弹窗新增分类', () => {
  assert.doesNotMatch(CATALOG_PAGE, /安装启用/);
  assert.doesNotMatch(CATALOG_PAGE, /安装跳过/);
  assert.match(CATALOG_PAGE, /class="strategy-toggle/);
  assert.match(CATALOG_PAGE, /id="addCategoryButton"/);
  assert.match(CATALOG_PAGE, /<dialog id="categoryDialog"/);
});

test('分类详情使用等距字段和完整描述输入框', () => {
  assert.match(CATALOG_PAGE, /<h3>分类详情<\/h3>/);
  assert.match(CATALOG_PAGE, /class="category-fields"/);
  assert.match(CATALOG_PAGE, /<textarea id="editCategoryDescription"/);
  assert.match(MANAGER_STYLES, /\.category-fields\{[^}]*gap:10px/);
  assert.match(CATALOG_PAGE, /editCategoryDescription[\s\S]*scrollHeight/);
});

test('目录删除文案不再使用移出', () => {
  assert.doesNotMatch(CATALOG_PAGE, /移出/);
  assert.match(CATALOG_PAGE, />删除<\/button>/);
});

test('下拉框统一箭头与右侧内容间距', () => {
  assert.match(MANAGER_STYLES, /select\{[^}]*appearance:none/);
  assert.match(MANAGER_STYLES, /select\{[^}]*padding-right:38px/);
  assert.match(MANAGER_STYLES, /select\{[^}]*background-position:right 12px center/);
});

test('Skill 卡片点击进入独立详情页', () => {
  assert.match(CATALOG_PAGE, /data-skill-detail=/);
  assert.match(CATALOG_PAGE, /location\.href='\/catalog\/skill\?id='/);
  assert.match(
    CATALOG_PAGE,
    /grid\.addEventListener\('keydown',\(event\)=>\{\n\s{2}const card=event\.target\.closest\('\[data-skill-detail\]'\);\n\s{2}if\(card&&!event\.target\.closest\('button,select,\[contenteditable\]'\)/,
  );
});

test('安装管理卡片点击进入已落地 Skill 详情页', () => {
  assert.match(MANAGER_PAGE, /class="card clickable" data-installed-skill=/);
  assert.match(MANAGER_PAGE, /location\.href='\/skill\?from=installed/);
  assert.match(MANAGER_PAGE, /closest\('button\[data-id\]'\)/);
  assert.match(
    MANAGER_PAGE,
    /grid\.addEventListener\('keydown',\(event\)=>\{\n\s{2}const card=event\.target\.closest\('\[data-installed-skill\]'\);/,
  );
});

test('安装态详情页读取落地 SKILL.md 并返回安装管理', () => {
  assert.match(SKILL_DETAIL_PAGE, /params\.get\('from'\)==='installed'/);
  assert.match(SKILL_DETAIL_PAGE, /\/api\/skills\/detail\?/);
  assert.match(SKILL_DETAIL_PAGE, /返回安装管理/);
  assert.match(SKILL_DETAIL_PAGE, /id="metaHeading"/);
});

test('hidden 元素不被 dl 网格显示规则覆盖', () => {
  assert.match(MANAGER_STYLES, /\[hidden\]\{display:none!important\}/);
});

test('Skill 文档拆分 YAML frontmatter 并安全渲染 Markdown', () => {
  const splitSkillDocument = Reflect.get(catalogPage, 'splitSkillDocument') as
    | ((content: string) => { frontmatter: string; body: string })
    | undefined;
  const renderSkillMarkdown = Reflect.get(catalogPage, 'renderSkillMarkdown') as
    | ((markdown: string) => string)
    | undefined;
  assert.equal(typeof splitSkillDocument, 'function');
  assert.equal(typeof renderSkillMarkdown, 'function');
  assert.deepEqual(
    splitSkillDocument?.('---\nname: demo\ndescription: |\n  多行\n---\n# 标题'),
    { frontmatter: 'name: demo\ndescription: |\n  多行', body: '# 标题' },
  );
  assert.match(renderSkillMarkdown?.('# 标题\n\n- 项目\n\n`code`') ?? '', /<h1>标题<\/h1>/);
  assert.match(renderSkillMarkdown?.('# 标题\n\n- 项目\n\n`code`') ?? '', /<li>项目<\/li>/);
  assert.doesNotMatch(renderSkillMarkdown?.('<script>alert(1)</script>') ?? '', /<script>/);
});

test('Skill 详情页脚本不依赖编译器内部辅助函数', () => {
  assert.doesNotMatch(SKILL_DETAIL_PAGE, /__name\d*/);
  assert.match(SKILL_DETAIL_PAGE, /function splitSkillDocument\(/);
  assert.match(SKILL_DETAIL_PAGE, /function renderSkillMarkdown\(/);
});

test('Skill 卡片路径优先显示 Workspace 相对路径并折叠过长路径', () => {
  const abbreviateSkillPath = Reflect.get(managerPage, 'abbreviateSkillPath') as
    | ((path: string, workspaceRoot: string, homeRoot: string) => string)
    | undefined;

  assert.equal(typeof abbreviateSkillPath, 'function');
  assert.equal(
    abbreviateSkillPath?.(
      '/Users/lion/Code/demo/.agents/skills/writing',
      '/Users/lion/Code/demo',
      '/Users/lion',
    ),
    './.agents/skills/writing',
  );
  assert.equal(
    abbreviateSkillPath?.(
      '/Users/lion/.cache/skillctl/vendors/example/repository/skills/writing',
      '/Users/lion/Code/demo',
      '/Users/lion',
    ),
    '~/.cache/…/skills/writing',
  );
});

test('agents target 的卡片不渲染重复 badge', () => {
  assert.match(MANAGER_PAGE, /skill\.target==='agents'\?'':/);
});

test('轮询保留滚动位置，仅显式上下文变化时回顶', () => {
  assert.match(MANAGER_PAGE, /function renderSkills\(resetScroll=false\)/);
  assert.match(MANAGER_PAGE, /if\(resetScroll\)catalogScroll\.scrollTop=0/);
  assert.match(MANAGER_PAGE, /setInterval\(\(\)=>loadSkills\(false,false\),3000\)/);
});

test('品牌使用 skill-ctl 图标并声明 favicon', () => {
  for (const page of [MANAGER_PAGE, CATALOG_PAGE]) {
    assert.match(page, /src="\/assets\/skillctl-icon\.png"/);
    assert.match(page, /rel="icon" href="\/favicon\.ico"/);
  }
});
