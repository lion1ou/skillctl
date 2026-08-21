import { spawn } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { MANIFEST_FILE } from './brand.js';
import { readInstallRecord, writeInstallRecord } from './install-record.js';
import { installItem, type InstallMode, type InstallStatus } from './installer.js';
import {
  externalCacheDir,
  loadSkillCatalog,
  partitionInstallableSkills,
  prepareSkillSources,
  type ExternalPrepareRunner,
  type PreparedSkill,
  type SkillCatalog,
  type SkillRecord,
} from './skill-registry.js';
import { getTarget, type TargetId } from './targets.js';

export interface CatalogInstallSelection {
  categoryIds?: string[];
  skillIds?: string[];
}

export interface DistributedInstallItem {
  target: TargetId;
  skill: string;
  status: InstallStatus;
  reason?: string;
}

export interface CatalogInstallResult {
  preparedCount: number;
  skippedDisabled: string[];
  items: DistributedInstallItem[];
}

/** 将分类和单项选择展开为去重后的 skill 集合。 */
export function resolveCatalogSkills(
  catalog: SkillCatalog,
  selection: CatalogInstallSelection,
  emptyMessage = '请选择要安装的分类或 skill',
): SkillRecord[] {
  const categoryIds = new Set(
    (selection.categoryIds ?? []).flatMap((value) => value.split(',')).map((value) => value.trim()).filter(Boolean),
  );
  const skillIds = new Set(
    (selection.skillIds ?? []).flatMap((value) => value.split(',')).map((value) => value.trim()).filter(Boolean),
  );
  for (const category of catalog.categories) {
    if (!categoryIds.has(category.id)) continue;
    for (const skillId of category.skillIds) skillIds.add(skillId);
  }
  const unknownCategories = [...categoryIds].filter((id) =>
    !catalog.categories.some((category) => category.id === id));
  if (unknownCategories.length > 0) throw new Error(`未知分类：${unknownCategories.join(', ')}`);
  if (skillIds.size === 0) throw new Error(emptyMessage);
  const unknown = [...skillIds].filter((id) => !catalog.skills.some((skill) => skill.id === id));
  if (unknown.length > 0) throw new Error(`未知 skill：${unknown.join(', ')}`);
  return catalog.skills.filter((skill) => skillIds.has(skill.id));
}

/** 检查所选本地来源和外部暂存状态，准备前一次性报告。 */
export function inspectSkillSources(
  sourceDir: string,
  cacheDir: string,
  skills: SkillRecord[],
): { readyCount: number; pendingExternal: SkillRecord[] } {
  const missingLocal = skills.filter((skill) =>
    skill.type === 'local' && !existsSync(join(sourceDir, skill.source, 'SKILL.md')));
  if (missingLocal.length > 0) {
    throw new Error(`本地来源缺失：${missingLocal.map((skill) => skill.name).join(', ')}`);
  }
  const pendingExternal = skills.filter((skill) =>
    skill.type === 'external' && !existsSync(join(externalCacheDir(cacheDir, skill), 'SKILL.md')));
  return {
    readyCount: skills.length - pendingExternal.length,
    pendingExternal,
  };
}

/** 异步执行 npx skills add，把外部包落到缓存目录。 */
export function spawnExternalSkillAdd(
  packageId: string,
  skillNames: string[],
  cachePackageDir: string,
): Promise<void> {
  mkdirSync(cachePackageDir, { recursive: true });
  return new Promise((resolvePromise, reject) => {
    const child = spawn(
      'npx',
      ['-y', 'skills', 'add', packageId, '--skill', ...skillNames, '--agent', 'universal', '--copy', '-y'],
      { cwd: cachePackageDir, stdio: ['ignore', 'pipe', 'pipe'] },
    );
    let stdout = '';
    let stderr = '';
    child.stdout?.on('data', (chunk: Buffer | string) => {
      stdout += String(chunk);
    });
    child.stderr?.on('data', (chunk: Buffer | string) => {
      stderr += String(chunk);
    });
    child.on('error', (error) => {
      reject(new Error(`外部包准备失败 ${packageId}：${error.message}`));
    });
    child.on('close', (status) => {
      if (status === 0) {
        resolvePromise();
        return;
      }
      const message = `${stderr}\n${stdout}`.trim();
      reject(new Error(`外部包准备失败 ${packageId}：${message || `exit ${status}`}`));
    });
  });
}

/** 对所有已准备来源执行分发循环并更新安装记录。 */
export function distributePreparedSkills(input: {
  scopeRoot: string;
  targets: TargetId[];
  prepared: PreparedSkill[];
  mode: InstallMode;
  force: boolean;
}): DistributedInstallItem[] {
  const items: DistributedInstallItem[] = [];
  for (const targetId of input.targets) {
    const target = getTarget(targetId);
    const recordFile = join(input.scopeRoot, target.skillsDir, MANIFEST_FILE);
    const record = readInstallRecord(recordFile);
    for (const skill of input.prepared) {
      const result = installItem({
        source: skill.sourceDir,
        dest: join(input.scopeRoot, target.skillsDir, skill.name),
        mode: input.mode,
        force: input.force,
      });
      if (result.status !== 'skipped') {
        record.skills[skill.name] = {
          mode: input.mode,
          installedAt: new Date().toISOString(),
          sourceHash: result.sourceHash,
        };
      }
      items.push({
        target: targetId,
        skill: skill.name,
        status: result.status,
        reason: result.reason,
      });
    }
    writeInstallRecord(recordFile, record);
  }
  return items;
}

/** 按分类/单项选择 skill，准备来源后安装到指定 target。 */
export async function installCatalogSkills(input: {
  sourceDir: string;
  cacheDir: string;
  scopeRoot: string;
  targets: TargetId[];
  selection: CatalogInstallSelection;
  mode: InstallMode;
  force: boolean;
  runExternalPrepare: ExternalPrepareRunner;
  emptySelectionMessage?: string;
}): Promise<CatalogInstallResult> {
  const catalog = loadSkillCatalog(input.sourceDir);
  const selected = resolveCatalogSkills(catalog, input.selection, input.emptySelectionMessage);
  const { installable, skippedDisabled } = partitionInstallableSkills(selected);
  if (installable.length === 0) {
    return {
      preparedCount: 0,
      skippedDisabled: skippedDisabled.map((skill) => skill.name),
      items: [],
    };
  }
  inspectSkillSources(input.sourceDir, input.cacheDir, installable);
  const prepared = await prepareSkillSources(
    input.sourceDir,
    input.cacheDir,
    installable,
    input.runExternalPrepare,
  );
  const items = distributePreparedSkills({
    scopeRoot: input.scopeRoot,
    targets: input.targets,
    prepared,
    mode: input.mode,
    force: input.force,
  });
  return {
    preparedCount: prepared.length,
    skippedDisabled: skippedDisabled.map((skill) => skill.name),
    items,
  };
}
