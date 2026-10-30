import assert from 'node:assert/strict';
import test from 'node:test';
import { Script } from 'node:vm';
import * as catalogPage from '../src/ui/catalog-page.js';
import { MANAGER_STYLES } from '../src/ui/manager-chrome.js';
import * as managerPage from '../src/ui/manager-page.js';
import { SKILL_DETAIL_PAGE } from '../src/ui/skill-detail-page.js';

const { CATALOG_PAGE } = catalogPage;
const {
  groupInstallableSkills,
  MANAGER_PAGE,
  matchesInstalledSkillFilter,
  visibleAgentsForWorkspace,
} = managerPage;

function inlineScripts(page: string): string[] {
  return [...page.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((match) => match[1]);
}

test('页面内联脚本可以被解析，不会因为转义丢失而整段失效', () => {
  for (const [name, page] of [
    ['MANAGER_PAGE', MANAGER_PAGE],
    ['CATALOG_PAGE', CATALOG_PAGE],
    ['SKILL_DETAIL_PAGE', SKILL_DETAIL_PAGE],
  ] as const) {
    const scripts = inlineScripts(page);
    assert.ok(scripts.length > 0, `${name} 缺少内联脚本`);
    for (const source of scripts) {
      assert.doesNotThrow(() => new Script(source), `${name} 内联脚本存在语法错误`);
    }
  }
});

test('安装管理页把新增与安装操作放在各自上下文中', () => {
  assert.match(MANAGER_PAGE, /id="workspaceTabs"/);
  assert.doesNotMatch(MANAGER_PAGE, /id="workspaceSelect"/);
  assert.match(MANAGER_PAGE, /class="workspace-bar"[\s\S]*id="addWorkspaceButton"[\s\S]*<\/div>/);
  assert.match(MANAGER_PAGE, /class="panel-heading"[\s\S]*id="addAgentButton"[\s\S]*<\/div>/);
  assert.match(MANAGER_PAGE, /class="toolbar installed-toolbar"[\s\S]*id="installButton"[\s\S]*<\/div>/);
  assert.match(MANAGER_PAGE, /<dialog id="installDialog"/);
  assert.match(MANAGER_PAGE, /id="installLog"/);
  assert.match(MANAGER_PAGE, /streamInstall\(/);
  assert.match(MANAGER_PAGE, /id="installSkillSearch"/);
  assert.match(MANAGER_PAGE, /class="install-groups" id="categoryList"/);
  assert.match(MANAGER_PAGE, /name="installSkill"/);
  assert.match(MANAGER_PAGE, /data-toggle-install-category=/);
  assert.match(MANAGER_PAGE, /skillIds/);
  assert.doesNotMatch(MANAGER_PAGE, /id="installPanel"/);
});

test('标题栏组合品牌与安装、源导航', () => {
  for (const page of [MANAGER_PAGE, CATALOG_PAGE]) {
    assert.match(page, /<nav class="topbar"/);
    assert.match(page, /class="brand"[^>]*>[\s\S]*skill-ctl<span class="brand-version">v\d+\.\d+\.\d+<\/span><\/a>/);
    assert.match(page, />安装管理<\/a>/);
    assert.match(page, />Skill 源<\/a>/);
    assert.doesNotMatch(page, /class="app-header"/);
    assert.doesNotMatch(page, /class="tabs"/);
  }
  assert.match(MANAGER_PAGE, /管理 Workspace、Agent 目录与已安装 Skill/);
  assert.match(CATALOG_PAGE, /维护 Skill 来源、分类与安装策略/);
  assert.match(CATALOG_PAGE, /id="initConfigButton">路径配置<\/button>/);
  assert.doesNotMatch(MANAGER_PAGE, /id="initConfigButton"/);
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
  assert.match(MANAGER_STYLES, /\.card>\.actions\{margin-top:auto\}/);
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
  assert.match(MANAGER_PAGE, /title="删除 Agent Skills"/);
  assert.match(MANAGER_PAGE, /将删除当前 Workspace 中该 Agent 的 skills 目录并取消固定/);
  assert.match(MANAGER_PAGE, /若 Agent 目录仅含 skills，会一并删除整个 Agent 目录/);
  assert.doesNotMatch(MANAGER_PAGE, /该 Agent 的完整目录/);
});

test('Agent 路径省略 Workspace 前缀并支持批量复选固定', () => {
  assert.match(MANAGER_PAGE, /'…\/'\+agent\.skillsDir/);
  assert.match(MANAGER_PAGE, /name="agentTarget"/);
  assert.match(MANAGER_PAGE, /type="checkbox"/);
  assert.doesNotMatch(MANAGER_PAGE, /skillCount>0\|\|pinned/);
  assert.doesNotMatch(MANAGER_PAGE, /<select id="agentTarget"/);
});

test('安装管理页展示扫描到的 Agent，并合并已固定但未落地的 Agent', () => {
  const agents = visibleAgentsForWorkspace({
    workspaceRoot: '/Users/demo/project',
    agents: [{
      id: 'cursor',
      agentDir: '.cursor',
      agentPath: '/Users/demo/project/.cursor',
      skillsDir: '.cursor/skills',
      skillsPath: '/Users/demo/project/.cursor/skills',
      detected: true,
      skillCount: 0,
      enabledCount: 0,
    }],
    pinnedTargetIds: ['codex'],
    targets: [
      { id: 'cursor', skillsDir: '.cursor/skills' },
      { id: 'codex', skillsDir: '.codex/skills' },
    ],
  });

  assert.deepEqual(agents.map((agent) => agent.id), ['codex', 'cursor']);
  assert.equal(agents.find((agent) => agent.id === 'codex')?.detected, false);
  assert.equal(agents.find((agent) => agent.id === 'cursor')?.detected, true);
});

test('安装页和 Skill 源页提供删除确认弹窗', () => {
  assert.match(MANAGER_PAGE, /<dialog id="confirmDialog"/);
  assert.match(CATALOG_PAGE, /<dialog id="confirmDialog"/);
});

test('Skill 源卡片只保留一个安装策略控件并通过弹窗新增分类', () => {
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

test('待同步列表逐行展示名称与截断描述，复选框不被全局输入样式撑开', () => {
  assert.match(CATALOG_PAGE, /<div class="sync-list" id="syncList">/);
  assert.match(CATALOG_PAGE, /class="sync-name"/);
  assert.match(CATALOG_PAGE, /class="sync-desc"/);
  assert.match(MANAGER_STYLES, /\.sync-list input\{[^}]*width:16px;height:16px[^}]*flex:none/);
  assert.match(MANAGER_STYLES, /\.sync-list\{[^}]*overflow:auto/);
  assert.match(MANAGER_STYLES, /\.sync-desc\{[^}]*-webkit-line-clamp:2/);
  assert.match(MANAGER_STYLES, /\.sync \.actions select\{flex:0 1 240px\}/);
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
  assert.match(MANAGER_PAGE, /class="card \$\{skill\.isBroken\?'':'clickable'\}"/);
  assert.match(MANAGER_PAGE, /data-installed-skill=/);
  assert.match(MANAGER_PAGE, /location\.href='\/skill\?from=installed/);
  assert.match(MANAGER_PAGE, /closest\('button\[data-id\]'\)/);
  assert.match(
    MANAGER_PAGE,
    /grid\.addEventListener\('keydown',\(event\)=>\{\n\s{2}const card=event\.target\.closest\('\[data-installed-skill\]'\);/,
  );
});

test('安装成功后自动关闭弹窗，失败时保留日志', () => {
  assert.match(MANAGER_PAGE, /,true\);\n\s{4}installDialog\.close\(\);/);
  assert.doesNotMatch(MANAGER_PAGE, /closeInstallButton\.textContent='关闭'/);
  assert.match(MANAGER_PAGE, /appendInstallLog\('失败：'\+message\)/);
});

test('分类标题按钮覆盖全局按钮的白色文字，保证浅底可读', () => {
  assert.match(MANAGER_STYLES, /\.install-category-toggle\{[^}]*background:transparent[^}]*color:var\(--text\)/);
});

test('安装候选 Skill 按分类分组，未归类项进入独立分组', () => {
  const groups = groupInstallableSkills({
    skills: [
      { id: 'alpha', name: 'Alpha', description: '第一个' },
      { id: 'beta', name: 'Beta', description: '第二个' },
      { id: 'orphan', name: 'Orphan', description: '未归类' },
    ],
    categories: [
      { id: 'common', name: '通用', skillIds: ['alpha', 'beta'] },
      { id: 'dev', name: '开发', skillIds: ['beta'] },
    ],
    keyword: '',
  });

  assert.deepEqual(groups.map((group) => ({
    id: group.id,
    name: group.name,
    skillIds: group.skills.map((skill) => skill.id),
  })), [
    { id: 'common', name: '通用', skillIds: ['alpha', 'beta'] },
    { id: 'uncategorized', name: '未分类', skillIds: ['orphan'] },
  ]);
});

test('搜索安装候选时仅保留含匹配 Skill 的分类', () => {
  const groups = groupInstallableSkills({
    skills: [
      { id: 'alpha', name: 'Alpha', description: '通用能力' },
      { id: 'beta', name: 'Beta', description: '开发工具' },
    ],
    categories: [
      { id: 'common', name: '通用', skillIds: ['alpha'] },
      { id: 'dev', name: '开发', skillIds: ['beta'] },
    ],
    keyword: '工具',
  });

  assert.deepEqual(groups.map((group) => ({
    id: group.id,
    skillIds: group.skills.map((skill) => skill.id),
  })), [{ id: 'dev', skillIds: ['beta'] }]);
});

test('已安装 Skill 可按启用状态、失效和安装方式同时筛选', () => {
  const enabledLink = {
    name: 'linked',
    description: '软链能力',
    installedPath: '/ws/.cursor/skills/linked',
    target: 'cursor',
    linkTarget: '/ws/sources/linked',
    isBroken: false,
    isEnabled: true,
    isSymlink: true,
  };
  const disabledCopy = {
    name: 'copied',
    description: '复制能力',
    installedPath: '/ws/.cursor/skills/copied',
    target: 'cursor',
    isBroken: false,
    isEnabled: false,
    isSymlink: false,
  };
  const broken = {
    name: 'broken-skill',
    description: '软链目标不存在或不是目录',
    installedPath: '/ws/.cursor/skills/broken-skill',
    target: 'cursor',
    linkTarget: '/ws/missing-source',
    isBroken: true,
    isEnabled: false,
    isSymlink: true,
  };

  assert.equal(matchesInstalledSkillFilter(enabledLink, { keyword: '', status: 'on', installMode: '' }), true);
  assert.equal(matchesInstalledSkillFilter(broken, { keyword: '', status: 'on', installMode: '' }), false);
  assert.equal(matchesInstalledSkillFilter(disabledCopy, { keyword: '', status: 'off', installMode: 'copy' }), true);
  assert.equal(matchesInstalledSkillFilter(broken, { keyword: '', status: 'off', installMode: '' }), false);
  assert.equal(matchesInstalledSkillFilter(broken, { keyword: 'missing', status: 'broken', installMode: 'symlink' }), true);
  assert.equal(matchesInstalledSkillFilter(broken, { keyword: '', status: 'broken', installMode: 'copy' }), false);
  assert.equal(matchesInstalledSkillFilter(enabledLink, { keyword: '', status: '', installMode: 'symlink' }), true);
  assert.equal(matchesInstalledSkillFilter(enabledLink, { keyword: '不存在', status: '', installMode: '' }), false);
});

test('安装管理列表支持批量选择删除，并为损坏软链提供恢复入口', () => {
  assert.match(MANAGER_PAGE, /id="installModeFilter"/);
  assert.match(MANAGER_PAGE, /<option value="broken">已失效<\/option>/);
  if (process.platform === 'win32') {
    assert.match(MANAGER_PAGE, /id="installMode"><option value="copy" selected>复制<\/option>/);
    assert.doesNotMatch(MANAGER_PAGE, /id="installMode">[\s\S]*value="symlink"/);
  } else {
    assert.match(MANAGER_PAGE, /id="installMode">[\s\S]*value="symlink"/);
    assert.match(MANAGER_PAGE, /id="installMode">[\s\S]*value="copy"/);
  }
  assert.match(MANAGER_PAGE, /<option value="symlink">软链<\/option>/);
  assert.match(MANAGER_PAGE, /id="installModeFilter"[\s\S]*<option value="copy">复制<\/option>/);
  assert.match(MANAGER_PAGE, /id="selectVisibleSkillsButton"/);
  assert.match(MANAGER_PAGE, /id="deleteSelectedButton"/);
  assert.match(MANAGER_PAGE, /data-select-skill=/);
  assert.match(MANAGER_PAGE, /data-restore-skill=/);
  assert.match(MANAGER_PAGE, /\/api\/skills\/remove/);
  assert.match(MANAGER_PAGE, /\/api\/skills\/restore/);
  assert.match(MANAGER_PAGE, /id="restoreSourcePath"/);
  assert.match(MANAGER_PAGE, /pickDirectory\('workspace'\)/);
  assert.match(MANAGER_PAGE, /workspacePath\.value=path/);
  assert.doesNotMatch(MANAGER_PAGE, /\/api\/workspaces\/pick/);
});

test('路径输入框通过目录选择器填入，不直接提交', () => {
  assert.match(MANAGER_PAGE, /data-pick-kind="source"/);
  assert.match(MANAGER_PAGE, /data-pick-kind="cache"/);
  assert.match(MANAGER_PAGE, /data-pick-kind="restore"/);
  assert.match(MANAGER_PAGE, /\/api\/directories\/pick/);
  assert.match(MANAGER_PAGE, /Skill 源（绝对路径或 git 地址）/);
  assert.match(MANAGER_PAGE, /sourceRemote\|\|next\.sourceDir/);
  assert.match(CATALOG_PAGE, /data-pick-kind="source"/);
  assert.match(CATALOG_PAGE, /data-pick-kind="cache"/);
  assert.match(CATALOG_PAGE, /Skill 源（绝对路径或 git 地址）/);
});

test('安装管理列表允许单独删除健康、禁用和损坏的 Skill', () => {
  assert.match(MANAGER_PAGE, /skill\.isBroken/);
  assert.match(MANAGER_PAGE, /软链损坏/);
  assert.match(MANAGER_PAGE, /data-delete-skill=/);
  assert.match(MANAGER_PAGE, /removeSkill\(/);
  assert.doesNotMatch(MANAGER_PAGE, /!skill\|\|!skill\.isBroken\|\|isUpdating/);
  assert.match(MANAGER_PAGE, /method:'DELETE',body:JSON\.stringify\(\{workspace:currentWorkspace,target:skill\.target,relativeDir:skill\.relativeDir\}\)/);
  assert.match(MANAGER_STYLES, /\.badge\.broken/);
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
  assert.match(MANAGER_PAGE, /function renderInstall\(force=false\)/);
  assert.match(
    MANAGER_PAGE,
    /confirmInstallButton\.disabled=[^\n]+\n\s+if\(installDialog\.open&&!force\)return/,
  );
  assert.match(MANAGER_PAGE, /if\(installDialog\.open&&!force\)return/);
  assert.match(
    MANAGER_PAGE,
    /installSkillSearch\.addEventListener\('keydown',[\s\S]*event\.key==='Enter'[\s\S]*event\.preventDefault\(\)/,
  );
  assert.match(MANAGER_PAGE, /setInterval\(\(\)=>loadSkills\(false,false\),3000\)/);
});

test('品牌使用 skill-ctl 图标并声明 favicon', () => {
  for (const page of [MANAGER_PAGE, CATALOG_PAGE]) {
    assert.match(page, /src="\/assets\/skillctl-icon\.png"/);
    assert.match(page, /rel="icon" href="\/favicon\.ico"/);
  }
});
