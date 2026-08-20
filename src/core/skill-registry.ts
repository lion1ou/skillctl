import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { CATEGORIES_FILE, SKILLS_FILE } from './brand.js';

export type SkillType = 'local' | 'external';

export interface SkillRecord {
  id: string;
  package: string;
  name: string;
  description: string;
  version: string;
  source: string;
  type: SkillType;
}

export interface CategoryRecord {
  id: string;
  name: string;
  description: string;
  skillIds: string[];
}

export interface SkillCatalog {
  skills: SkillRecord[];
  categories: CategoryRecord[];
}

export interface PreparedSkill extends SkillRecord {
  sourceDir: string;
}

export interface ExternalPrepareInput {
  packageId: string;
  skillNames: string[];
  cachePackageDir: string;
}

export type ExternalPrepareRunner = (
  input: ExternalPrepareInput & { index: number; total: number },
) => void | Promise<void>;

/** 读取并校验全局 skill 注册表和分类表。 */
export function loadSkillCatalog(sourceDir: string): SkillCatalog {
  return reconcileSkillCatalog(sourceDir).catalog;
}

/** 读取配置表，并从分类中清掉注册表已删除的 skill。 */
export function reconcileSkillCatalog(sourceDir: string): {
  catalog: SkillCatalog;
  removedOrphanIds: string[];
} {
  const skillsFile = join(sourceDir, SKILLS_FILE);
  const categoriesFile = join(sourceDir, CATEGORIES_FILE);
  const skillDocument = JSON.parse(readFileSync(skillsFile, 'utf8')) as {
    version?: number;
    skills?: SkillRecord[];
  };
  const categoryDocument = JSON.parse(readFileSync(categoriesFile, 'utf8')) as {
    version?: number;
    categories?: CategoryRecord[];
  };
  if (skillDocument.version !== 1 || !Array.isArray(skillDocument.skills)) {
    throw new Error(`无效的 skill 注册表：${skillsFile}`);
  }
  if (categoryDocument.version !== 1 || !Array.isArray(categoryDocument.categories)) {
    throw new Error(`无效的分类表：${categoriesFile}`);
  }
  const removedOrphanIds = removeMissingCategorySkills(
    skillDocument.skills,
    categoryDocument.categories,
  );
  if (removedOrphanIds.length > 0) {
    writeJson(categoriesFile, {
      version: 1,
      categories: categoryDocument.categories,
    });
  }
  validateCatalog(skillDocument.skills, categoryDocument.categories);
  return {
    catalog: { skills: skillDocument.skills, categories: categoryDocument.categories },
    removedOrphanIds,
  };
}

/** 扫描配置源 skills/，返回尚未写入注册表的本地 skill。 */
export function findUnregisteredLocalSkills(
  sourceDir: string,
  catalog: SkillCatalog,
): SkillRecord[] {
  const skillsRoot = join(sourceDir, 'skills');
  if (!existsSync(skillsRoot)) return [];
  const registered = new Set(catalog.skills.map((skill) => skill.name));
  return readdirSync(skillsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !registered.has(entry.name))
    .filter((entry) => existsSync(join(skillsRoot, entry.name, 'SKILL.md')))
    .map((entry) => {
      const metadata = readSkillMetadata(join(skillsRoot, entry.name, 'SKILL.md'));
      const name = metadata.name || entry.name;
      return {
        id: name,
        package: 'skill-catalog',
        name,
        description: metadata.description || `${name} skill`,
        version: metadata.version || '1.0.0',
        source: `skills/${entry.name}`,
        type: 'local' as const,
      };
    })
    .sort((left, right) => left.name.localeCompare(right.name));
}

/** 将选中的 skill 写入注册表并归入一个分类。 */
export function addSkillsToRegistry(
  sourceDir: string,
  catalog: SkillCatalog,
  categoryId: string,
  additions: SkillRecord[],
): void {
  const category = catalog.categories.find((item) => item.id === categoryId);
  if (!category) throw new Error(`未知分类：${categoryId}`);
  const knownIds = new Set(catalog.skills.map((skill) => skill.id));
  const accepted = additions.filter((skill) => !knownIds.has(skill.id));
  catalog.skills.push(...accepted);
  for (const skill of accepted) {
    category.skillIds.push(skill.id);
  }
  validateCatalog(catalog.skills, catalog.categories);
  writeJson(join(sourceDir, SKILLS_FILE), { version: 1, skills: catalog.skills });
  writeJson(join(sourceDir, CATEGORIES_FILE), {
    version: 1,
    categories: catalog.categories,
  });
}

/** 将所有选中来源准备为统一的本地目录，供安装阶段直接分发。 */
export async function prepareSkillSources(
  sourceDir: string,
  cacheDir: string,
  skills: SkillRecord[],
  runExternalPrepare: ExternalPrepareRunner,
): Promise<PreparedSkill[]> {
  const pendingPackages = new Map<string, string[]>();
  for (const skill of skills.filter((item) => item.type === 'external')) {
    const preparedSkillDir = externalCacheDir(cacheDir, skill);
    if (existsSync(join(preparedSkillDir, 'SKILL.md'))) continue;
    const names = pendingPackages.get(skill.package) ?? [];
    names.push(skill.name);
    pendingPackages.set(skill.package, names);
  }
  const pending = [...pendingPackages.entries()];
  for (let index = 0; index < pending.length; index += 1) {
    const [packageId, skillNames] = pending[index];
    await runExternalPrepare({
      packageId,
      skillNames,
      cachePackageDir: join(cacheDir, packageId),
      index: index + 1,
      total: pending.length,
    });
    relocateDownloadedSkills(cacheDir, packageId, skillNames);
  }
  const prepared: PreparedSkill[] = [];
  for (const skill of skills) {
    const skillSourceDir = skill.type === 'local'
      ? join(sourceDir, skill.source)
      : externalCacheDir(cacheDir, skill);
    if (!existsSync(join(skillSourceDir, 'SKILL.md'))) {
      throw new Error(`skill 来源未准备完成：${skill.name} (${skillSourceDir})`);
    }
    prepared.push({ ...skill, sourceDir: skillSourceDir });
  }
  return prepared;
}

/** 返回外部 skill 在缓存根目录中的统一目录：.cache/<repo>/<skillName>。 */
export function externalCacheDir(cacheDir: string, skill: SkillRecord): string {
  return join(cacheDir, skill.package, skill.name);
}

/** 把 npx skills 落到 .agents/skills 的文件挪到缓存约定路径，并清掉临时目录。 */
function relocateDownloadedSkills(cacheDir: string, packageId: string, skillNames: string[]): void {
  const packageDir = join(cacheDir, packageId);
  for (const skillName of skillNames) {
    const dest = join(packageDir, skillName);
    if (existsSync(join(dest, 'SKILL.md'))) continue;
    const staged = join(packageDir, '.agents/skills', skillName);
    if (!existsSync(join(staged, 'SKILL.md'))) continue;
    mkdirSync(dirname(dest), { recursive: true });
    renameSync(staged, dest);
  }
  const stagingRoot = join(packageDir, '.agents');
  if (existsSync(stagingRoot)) rmSync(stagingRoot, { recursive: true, force: true });
  const lockFile = join(packageDir, 'skills-lock.json');
  if (existsSync(lockFile)) rmSync(lockFile, { force: true });
}

/** 从 SKILL.md frontmatter 读取登记所需的最小元数据。 */
export function readSkillMetadata(file: string): Record<string, string> {
  const content = readFileSync(file, 'utf8');
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return {};
  const metadata: Record<string, string> = {};
  for (const line of match[1].split(/\r?\n/)) {
    const field = line.match(/^([a-zA-Z][\w-]*):\s*(.*)$/);
    if (field && field[2]) metadata[field[1]] = field[2].trim().replace(/^['"]|['"]$/g, '');
  }
  return metadata;
}

/** 从分类表去掉注册表中已不存在的 skill id。 */
function removeMissingCategorySkills(
  skills: SkillRecord[],
  categories: CategoryRecord[],
): string[] {
  const knownIds = new Set(skills.map((skill) => skill.id));
  const removed: string[] = [];
  for (const category of categories) {
    const kept: string[] = [];
    for (const skillId of category.skillIds) {
      if (knownIds.has(skillId)) {
        kept.push(skillId);
        continue;
      }
      removed.push(skillId);
    }
    category.skillIds = kept;
  }
  return [...new Set(removed)];
}

/** 校验唯一性、分类引用及单分类约束。 */
function validateCatalog(skills: SkillRecord[], categories: CategoryRecord[]): void {
  const ids = new Set<string>();
  const names = new Set<string>();
  for (const skill of skills) {
    if (!skill.id || !skill.name || !skill.package || !skill.description || !skill.source) {
      throw new Error('skill 注册项缺少必填字段');
    }
    if (ids.has(skill.id) || names.has(skill.name)) {
      throw new Error(`skill id 或名称重复：${skill.id}/${skill.name}`);
    }
    ids.add(skill.id);
    names.add(skill.name);
  }
  const assigned = new Set<string>();
  for (const category of categories) {
    for (const skillId of category.skillIds) {
      if (!ids.has(skillId)) throw new Error(`分类引用未知 skill：${skillId}`);
      if (assigned.has(skillId)) throw new Error(`skill 只能属于一个分类：${skillId}`);
      assigned.add(skillId);
    }
  }
}

/** 使用稳定缩进写入配置表。 */
function writeJson(file: string, value: unknown): void {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}
