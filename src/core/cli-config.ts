import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CATEGORIES_FILE, CLI_NAME, SKILLS_FILE } from './brand.js';
import type { CategoryRecord, SkillRecord } from './skill-registry.js';

export interface CliConfig {
  version: 1;
  sourceDir: string;
  cacheDir: string;
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
  return { version: 1, sourceDir, cacheDir };
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
  const config: CliConfig = { version: 1, sourceDir, cacheDir };
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(config, null, 2)}\n`, 'utf8');
  return config;
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
