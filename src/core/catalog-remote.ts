import {
  inspectPackageSkills,
  isGithubPackageSource,
  type PackageSkill,
} from './skills-source.js';
import {
  addSkillsToRegistry,
  loadSkillCatalog,
  saveSkillCatalog,
  type SkillRecord,
} from './skill-registry.js';

export interface RemoteSkillRef {
  package: string;
  name: string;
  description?: string;
}

export interface RegisterRemoteSkillsInput {
  categoryId: string;
  skills: RemoteSkillRef[];
}

export interface RegisterRemoteSkillsResult {
  added: string[];
  skipped: string[];
  failed: Array<{ package: string; name: string; reason: string }>;
}

export interface RegisterRemoteSkillsDeps {
  inspectPackageSkills?: (packageId: string) => PackageSkill[];
}

/** 将远程 skill 探包后写入配置表；已存在跳过，失败项列出且不阻断成功项。 */
export function registerRemoteSkills(
  sourceDir: string,
  input: RegisterRemoteSkillsInput,
  deps: RegisterRemoteSkillsDeps = {},
): RegisterRemoteSkillsResult {
  const inspect = deps.inspectPackageSkills ?? inspectPackageSkills;
  const catalog = loadSkillCatalog(sourceDir);
  const knownNames = new Set(catalog.skills.map((skill) => skill.name));
  const added: string[] = [];
  const skipped: string[] = [];
  const failed: RegisterRemoteSkillsResult['failed'] = [];
  const pending: SkillRecord[] = [];
  const inspected = new Map<string, PackageSkill[]>();

  for (const item of input.skills) {
    const packageId = item.package.trim();
    const name = item.name.trim();
    if (!packageId || !name) {
      failed.push({ package: packageId, name, reason: 'package 或 name 为空' });
      continue;
    }
    if (knownNames.has(name) || pending.some((skill) => skill.name === name)) {
      skipped.push(name);
      continue;
    }
    if (!isGithubPackageSource(packageId)) {
      failed.push({
        package: packageId,
        name,
        reason: '仅支持 GitHub owner/repo 形式的 package',
      });
      continue;
    }
    let packageSkills = inspected.get(packageId);
    if (!packageSkills) {
      try {
        packageSkills = inspect(packageId);
        inspected.set(packageId, packageSkills);
      } catch (error) {
        failed.push({
          package: packageId,
          name,
          reason: error instanceof Error ? error.message : '探包失败',
        });
        continue;
      }
    }
    const matched = packageSkills.find((skill) => skill.name === name);
    if (!matched) {
      failed.push({ package: packageId, name, reason: `外部包未包含 skill：${name}` });
      continue;
    }
    const description = (item.description?.trim() || matched.description || `${name} skill`).trim();
    pending.push({
      id: name,
      package: packageId,
      name,
      description,
      version: '*',
      source: `https://github.com/${packageId}`,
      type: 'external',
      enabled: true,
    });
    knownNames.add(name);
    added.push(name);
  }

  if (pending.length > 0) {
    addSkillsToRegistry(sourceDir, catalog, input.categoryId, pending);
  }

  return { added, skipped, failed };
}

/** 将指定 skill 在配置表中标记为启用，供补装路径使用。 */
export function ensureSkillsEnabled(sourceDir: string, skillIds: string[]): void {
  if (skillIds.length === 0) return;
  const catalog = loadSkillCatalog(sourceDir);
  const wanted = new Set(skillIds);
  let changed = false;
  for (const skill of catalog.skills) {
    if (!wanted.has(skill.id) && !wanted.has(skill.name)) continue;
    if (skill.enabled === false) {
      skill.enabled = true;
      changed = true;
    }
  }
  if (changed) saveSkillCatalog(sourceDir, catalog);
}
