import { Command, Flags } from '@oclif/core';
import * as p from '@clack/prompts';
import { homedir } from 'node:os';
import { resolve } from 'node:path';
import { CLI_NAME } from '../core/brand.js';
import { loadCliConfig } from '../core/cli-config.js';
import {
  inspectSkillSources,
  installCatalogSkills,
  resolveCatalogSkills,
  spawnExternalSkillAdd,
} from '../core/catalog-install.js';
import { type InstallMode } from '../core/installer.js';
import {
  findUnregisteredLocalSkills,
  loadSkillCatalog,
  partitionInstallableSkills,
  reconcileSkillCatalog,
  type SkillCatalog,
  type SkillRecord,
} from '../core/skill-registry.js';
import { promptCatalogSkills } from '../prompts/catalog-multiselect.js';
import { defaultTargetIds, getTarget, TARGETS, type TargetId } from '../core/targets.js';

interface InstallSelection {
  scope: 'project' | 'global';
  mode: InstallMode;
  targets: TargetId[];
  skills: SkillRecord[];
}

export default class Install extends Command {
  static override description = '检查并准备 skill，再统一分发到指定 target';
  static override flags = {
    category: Flags.string({ char: 'G', multiple: true, description: '安装分类，可重复或逗号分隔' }),
    skill: Flags.string({ char: 's', multiple: true, description: '安装指定 skill，可重复' }),
    target: Flags.string({ char: 't', description: '逗号分隔 target 或 all' }),
    global: Flags.boolean({ char: 'g', default: false, description: '安装到用户根目录' }),
    mode: Flags.string({ char: 'm', options: ['symlink', 'copy'], default: 'symlink' }),
    force: Flags.boolean({ char: 'f', default: false, description: '覆盖目标已有内容' }),
    'target-root': Flags.string({ description: '显式指定安装根目录' }),
  };

  /** 严格执行选择、检查、准备、分发四个阶段。 */
  override async run(): Promise<void> {
    const { flags } = await this.parse(Install);
    const { sourceDir, cacheDir } = loadCliConfig();
    p.intro(`${CLI_NAME} install`);
    const reconciled = reconcileSkillCatalog(sourceDir);
    if (reconciled.removedOrphanIds.length > 0) {
      this.log(`分类中已移除注册表中不存在的 skill：${reconciled.removedOrphanIds.join(', ')}`);
    }
    let catalog = reconciled.catalog;
    const interactive = process.stdin.isTTY && !hasExplicitSelection(flags);
    const basic = interactive ? await promptBasicSelection() : resolveFlagSelection(flags);

    const unregistered = findUnregisteredLocalSkills(sourceDir, catalog);
    if (unregistered.length > 0) {
      if (!process.stdin.isTTY) {
        this.error(`发现未登记本地 skill：${unregistered.map((item) => item.name).join(', ')}`);
      }
      const shouldAdd = await p.confirm({
        message: `发现 ${unregistered.length} 个未登记本地 skill，是否先添加到配置表？`,
        initialValue: true,
      });
      if (p.isCancel(shouldAdd) || !shouldAdd) return;
      await this.config.runCommand('add', ['--local']);
      catalog = loadSkillCatalog(sourceDir);
    }

    const selected = interactive
      ? await promptCatalogSkills(catalog)
      : resolveFlagSkills(catalog, flags.category, flags.skill);
    const { installable, skippedDisabled } = partitionInstallableSkills(selected);
    if (skippedDisabled.length > 0) {
      this.log(`未启用，已跳过：${skippedDisabled.map((skill) => skill.name).join(', ')}`);
    }
    if (installable.length === 0) {
      p.outro(
        skippedDisabled.length > 0
          ? `未启用，已跳过：${skippedDisabled.map((skill) => skill.name).join(', ')}；没有可安装的已启用 skill`
          : '没有可安装的已启用 skill',
      );
      return;
    }
    const selection: InstallSelection = { ...basic, skills: installable };
    const inspection = inspectSkillSources(sourceDir, cacheDir, selection.skills);
    this.log(`检查完成：来源已准备 ${inspection.readyCount}，待暂存外部 ${inspection.pendingExternal.length}`);
    const scopeRoot = flags['target-root']
      ? resolve(flags['target-root'])
      : selection.scope === 'global' ? homedir() : process.cwd();
    const result = await installCatalogSkills({
      sourceDir,
      cacheDir,
      scopeRoot,
      targets: selection.targets,
      selection: {
        skillIds: selection.skills.map((skill) => skill.id),
      },
      mode: selection.mode,
      force: flags.force,
      onLog: (line) => this.log(line),
      runExternalPrepare,
    });
    for (const item of result.items) {
      this.log(`${item.target}/${item.skill}: ${item.status}`);
    }
    const skipHint = skippedDisabled.length > 0
      ? `；未启用已跳过：${skippedDisabled.map((skill) => skill.name).join(', ')}`
      : '';
    p.outro(`已安装 ${result.preparedCount} 个 skill 到 ${selection.targets.length} 个 target${skipHint}`);
  }
}

/** 交互选择安装范围、模式和目标环境。 */
async function promptBasicSelection(): Promise<Omit<InstallSelection, 'skills'>> {
  const scope = await p.select({
    message: '安装范围',
    options: [
      { value: 'project', label: '当前目录' },
      { value: 'global', label: '用户根目录（~）' },
    ],
    initialValue: 'project',
  });
  if (p.isCancel(scope)) throw new Error('已取消');
  const mode = await p.select({
    message: '安装模式',
    options: [
      { value: 'symlink', label: '软链' },
      { value: 'copy', label: '复制' },
    ],
    initialValue: 'symlink',
  });
  if (p.isCancel(mode)) throw new Error('已取消');
  const targets = await p.multiselect({
    message: '目标环境',
    options: TARGETS.map((target) => ({ value: target.id, label: target.id })),
    initialValues: defaultTargetIds(scope as 'project' | 'global'),
    required: true,
  });
  if (p.isCancel(targets)) throw new Error('已取消');
  return {
    scope: scope as 'project' | 'global',
    mode: mode as InstallMode,
    targets: targets as TargetId[],
  };
}

/** 把非交互 flags 解析为基础安装选择。 */
function resolveFlagSelection(flags: {
  global: boolean;
  mode: string;
  target?: string;
}): Omit<InstallSelection, 'skills'> {
  const scope = flags.global ? 'global' : 'project';
  const targetIds = flags.target === 'all'
    ? TARGETS.map((target) => target.id)
    : (flags.target ?? defaultTargetIds(scope).join(',')).split(',') as TargetId[];
  for (const targetId of targetIds) getTarget(targetId.trim());
  return {
    scope,
    mode: flags.mode as InstallMode,
    targets: targetIds.map((targetId) => targetId.trim() as TargetId),
  };
}

/** 将分类和单项 flags 展开为去重后的 skill 集合。 */
function resolveFlagSkills(
  catalog: SkillCatalog,
  categoryFlags?: string[],
  skillFlags?: string[],
): SkillRecord[] {
  return resolveCatalogSkills(catalog, {
    categoryIds: categoryFlags,
    skillIds: skillFlags,
  }, '请通过 -G 或 -s 指定要安装的 skill');
}

/** 将一个外部包复制到缓存目录，并把 skills CLI 输出直接打到终端。 */
async function runExternalPrepare(input: {
  packageId: string;
  skillNames: string[];
  cachePackageDir: string;
  index: number;
  total: number;
}): Promise<void> {
  const skillLabel = input.skillNames.join(', ');
  const progress = `${input.index}/${input.total}`;
  process.stdout.write(`正在缓存外部 skill ${progress}：${input.packageId}（${skillLabel}）\n`);
  await spawnExternalSkillAdd(
    input.packageId,
    input.skillNames,
    input.cachePackageDir,
    (line) => {
      process.stdout.write(`${line}\n`);
    },
  );
  process.stdout.write(`已缓存 ${progress}：${input.packageId}\n`);
}

/** 只有未显式指定 skill 范围时才进入完整交互。 */
function hasExplicitSelection(flags: { category?: string[]; skill?: string[] }): boolean {
  return Boolean(
    (flags.category && flags.category.length > 0) ||
    (flags.skill && flags.skill.length > 0),
  );
}
