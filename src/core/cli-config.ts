import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CATEGORIES_FILE, CLI_NAME, SKILLS_FILE } from './brand.js';
import type { CategoryRecord, SkillRecord } from './skill-registry.js';
import { getTarget, type TargetId } from './targets.js';

export interface ManagedWorkspaceConfig {
  path: string;
  pinnedTargetIds: TargetId[];
}

export interface CliConfig {
  version: 1;
  sourceDir: string;
  cacheDir: string;
  workspaces: ManagedWorkspaceConfig[];
}

/** 解析符合 XDG 规范的 skillctl 配置文件路径。 */
export function resolveCliConfigPath(env: NodeJS.ProcessEnv = process.env): string {
  const configHome = env.XDG_CONFIG_HOME
    ? resolve(env.XDG_CONFIG_HOME)
    : join(env.HOME ? resolve(env.HOME) : homedir(), '.config');
  return join(configHome, 'skillctl', 'config.json');
}

/** 返回 CLI 安装目录，用于放置外部 skill 缓存。 */
export function resolveCliPackageRoot(): string {
  return fileURLToPath(new URL('../..', import.meta.url));
}

/** 未指定缓存目录时使用脚本目录下的 .cache。 */
export function resolveSkillCacheDir(): string {
  return join(resolveCliPackageRoot(), '.cache');
}

/** 把用户输入规范为绝对路径，相对路径直接拒绝。 */
export function resolveRequiredAbsolutePath(value: string, label: string): string {
  const trimmed = value.trim();
  if (!trimmed) throw new Error(`${label}不能为空`);
  const expanded = trimmed === '~' || trimmed.startsWith('~/')
    ? join(homedir(), trimmed.slice(trimmed.startsWith('~/') ? 2 : 1))
    : trimmed;
  if (!isAbsolute(expanded)) {
    throw new Error(`${label}必须使用绝对路径，例如 /Users/name/catalog`);
  }
  return resolve(expanded);
}

/** 读取本机已保存的源目录和缓存目录；文件不存在时返回 null。 */
export function peekCliConfig(env: NodeJS.ProcessEnv = process.env): CliConfig | null {
  const file = resolveCliConfigPath(env);
  if (!existsSync(file)) return null;
  const config = JSON.parse(readFileSync(file, 'utf8')) as Partial<CliConfig>;
  if (config.version !== 1 || !config.sourceDir) return null;
  return {
    version: 1,
    sourceDir: resolve(config.sourceDir),
    cacheDir: resolve(config.cacheDir ?? resolveSkillCacheDir()),
    workspaces: normalizeWorkspaces(config.workspaces, env),
  };
}

/** 读取首次初始化保存的 skill 源目录和缓存目录。 */
export function loadCliConfig(env: NodeJS.ProcessEnv = process.env): CliConfig {
  const file = resolveCliConfigPath(env);
  if (!existsSync(file)) {
    throw new Error(`CLI 尚未初始化，请先运行 ${CLI_NAME} init --source <绝对路径>`);
  }
  const config = JSON.parse(readFileSync(file, 'utf8')) as Partial<CliConfig>;
  if (config.version !== 1 || !config.sourceDir) {
    throw new Error(`无效的 skillctl 配置：${file}`);
  }
  const sourceDir = resolve(config.sourceDir);
  const cacheDir = resolve(config.cacheDir ?? resolveSkillCacheDir());
  validateSourceDir(sourceDir);
  return {
    version: 1,
    sourceDir,
    cacheDir,
    workspaces: normalizeWorkspaces(config.workspaces, env),
  };
}

/** 校验并写入 CLI 与 skill 源、缓存目录之间的关联配置。 */
export function initializeCliConfig(options: {
  sourceDir: string;
  cacheDir?: string;
  env?: NodeJS.ProcessEnv;
  force?: boolean;
}): CliConfig {
  const sourceDir = resolveRequiredAbsolutePath(options.sourceDir, '源目录');
  const cacheDir = resolveRequiredAbsolutePath(
    options.cacheDir ?? resolveSkillCacheDir(),
    '缓存目录',
  );
  ensureSourceCatalog(sourceDir);
  validateSourceDir(sourceDir);
  mkdirSync(cacheDir, { recursive: true });
  const file = resolveCliConfigPath(options.env);
  if (existsSync(file) && !options.force) {
    throw new Error(`配置已存在：${file}；如需覆盖请使用 --force`);
  }
  const config: CliConfig = {
    version: 1,
    sourceDir,
    cacheDir,
    workspaces: normalizeWorkspaces(undefined, options.env ?? process.env),
  };
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(config, null, 2)}\n`, 'utf8');
  return config;
}

/** 添加一个可管理的 Workspace，重复路径保持原配置不变。 */
export function addManagedWorkspace(
  workspacePath: string,
  env: NodeJS.ProcessEnv = process.env,
): CliConfig {
  const path = resolveRequiredAbsolutePath(workspacePath, 'Workspace 目录');
  if (!existsSync(path) || !statSync(path).isDirectory()) {
    throw new Error(`Workspace 目录不存在：${path}`);
  }
  const config = loadCliConfig(env);
  if (!config.workspaces.some((workspace) => workspace.path === path)) {
    config.workspaces.push({ path, pinnedTargetIds: [] });
    writeCliConfig(config, env);
  }
  return config;
}

/** 移除一个 Workspace；用户根目录始终保留为默认管理范围。 */
export function removeManagedWorkspace(
  workspacePath: string,
  env: NodeJS.ProcessEnv = process.env,
): CliConfig {
  const path = resolveRequiredAbsolutePath(workspacePath, 'Workspace 目录');
  const config = loadCliConfig(env);
  const home = resolveHome(env);
  if (path !== home) {
    config.workspaces = config.workspaces.filter((workspace) => workspace.path !== path);
    writeCliConfig(config, env);
  }
  return config;
}

/** 固定或取消固定 Workspace 中的 Agent；有 skill 的 Agent 无需固定也会展示。 */
export function setWorkspaceTargetPinned(
  workspacePath: string,
  targetId: string,
  isPinned: boolean,
  env: NodeJS.ProcessEnv = process.env,
): CliConfig {
  const path = resolveRequiredAbsolutePath(workspacePath, 'Workspace 目录');
  const target = getTarget(targetId);
  const config = loadCliConfig(env);
  const workspace = config.workspaces.find((item) => item.path === path);
  if (!workspace) throw new Error(`未管理该 Workspace：${path}`);
  const pinned = new Set(workspace.pinnedTargetIds);
  if (isPinned) pinned.add(target.id);
  else pinned.delete(target.id);
  workspace.pinnedTargetIds = [...pinned].sort();
  writeCliConfig(config, env);
  return config;
}

/** 兼容旧配置，并确保用户根目录始终位于 Workspace 列表首位。 */
function normalizeWorkspaces(
  value: unknown,
  env: NodeJS.ProcessEnv,
): ManagedWorkspaceConfig[] {
  const home = resolveHome(env);
  const workspaces = new Map<string, ManagedWorkspaceConfig>();
  if (Array.isArray(value)) {
    for (const item of value) {
      if (!item || typeof item !== 'object') continue;
      const candidate = item as { path?: unknown; pinnedTargetIds?: unknown };
      if (typeof candidate.path !== 'string' || !candidate.path.trim()) continue;
      const path = resolve(candidate.path);
      const pinnedTargetIds = Array.isArray(candidate.pinnedTargetIds)
        ? candidate.pinnedTargetIds.flatMap((id) => {
          if (typeof id !== 'string') return [];
          try {
            return [getTarget(id).id];
          } catch {
            return [];
          }
        })
        : [];
      workspaces.set(path, { path, pinnedTargetIds: [...new Set(pinnedTargetIds)].sort() });
    }
  }
  const homeWorkspace = workspaces.get(home) ?? { path: home, pinnedTargetIds: [] };
  workspaces.delete(home);
  return [homeWorkspace, ...workspaces.values()];
}

function resolveHome(env: NodeJS.ProcessEnv): string {
  return env.HOME ? resolve(env.HOME) : homedir();
}

function writeCliConfig(config: CliConfig, env: NodeJS.ProcessEnv): void {
  const file = resolveCliConfigPath(env);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(config, null, 2)}\n`, 'utf8');
}

/** 源目录缺少配置表时写入带远程示例的 skillctl 前缀文件。 */
function ensureSourceCatalog(sourceDir: string): void {
  mkdirSync(join(sourceDir, 'skills'), { recursive: true });
  const skillsFile = join(sourceDir, SKILLS_FILE);
  const categoriesFile = join(sourceDir, CATEGORIES_FILE);
  const hasSkills = existsSync(skillsFile);
  const hasCategories = existsSync(categoriesFile);
  if (!hasSkills && !hasCategories) {
    const example = exampleRemoteCatalog();
    writeFileSync(skillsFile, `${JSON.stringify({ version: 1, skills: example.skills }, null, 2)}\n`);
    writeFileSync(
      categoriesFile,
      `${JSON.stringify({ version: 1, categories: example.categories }, null, 2)}\n`,
    );
    return;
  }
  if (!hasSkills) {
    writeFileSync(skillsFile, `${JSON.stringify({ version: 1, skills: [] }, null, 2)}\n`);
  }
  if (!hasCategories) {
    writeFileSync(categoriesFile, `${JSON.stringify({ version: 1, categories: [] }, null, 2)}\n`);
  }
}

/** 生成 2 个远程 skill 作为新建配置表的示例。 */
function exampleRemoteCatalog(): { skills: SkillRecord[]; categories: CategoryRecord[] } {
  const skills: SkillRecord[] = [
    {
      id: 'find-skills',
      package: 'vercel-labs/skills',
      name: 'find-skills',
      description: '搜索和发现可安装的 Agent Skills',
      version: '*',
      source: 'https://github.com/vercel-labs/skills',
      type: 'external',
      enabled: true,
    },
    {
      id: 'humanizer-zh',
      package: 'op7418/humanizer-zh',
      name: 'humanizer-zh',
      description: '去除中文文本中的 AI 生成痕迹',
      version: '*',
      source: 'https://github.com/op7418/humanizer-zh',
      type: 'external',
      enabled: true,
    },
  ];
  return {
    skills,
    categories: [{
      id: 'examples',
      name: '示例',
      description: '初始化生成的远程 skill 示例',
      skillIds: skills.map((skill) => skill.id),
    }],
  };
}

/** 确认配置目录具备注册表、分类表和本地 skill 根目录。 */
function validateSourceDir(sourceDir: string): void {
  const required = [SKILLS_FILE, CATEGORIES_FILE, 'skills'];
  const missing = required.filter((entry) => !existsSync(join(sourceDir, entry)));
  if (missing.length > 0) {
    throw new Error(`无效的 skill 源目录 ${sourceDir}，缺少：${missing.join(', ')}`);
  }
}
