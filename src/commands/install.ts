import { Command, Flags } from '@oclif/core';
import * as p from '@clack/prompts';
import { existsSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { CLI_NAME, MANIFEST_FILE } from '../core/brand.js';
import { loadCliConfig } from '../core/cli-config.js';
import { readInstallRecord, writeInstallRecord } from '../core/install-record.js';
import { installItem, type InstallMode } from '../core/installer.js';
import {
  externalCacheDir,
  findUnregisteredLocalSkills,
  loadSkillCatalog,
  reconcileSkillCatalog,
  prepareSkillSources,
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

    const skills = interactive
      ? await promptCatalogSkills(catalog)
      : resolveFlagSkills(catalog, flags.category, flags.skill);
    const selection: InstallSelection = { ...basic, skills };
    inspectPreparedState(sourceDir, cacheDir, selection.skills, this.log.bind(this));
    const prepared = await prepareSkillSources(
      sourceDir,
      cacheDir,
      selection.skills,
      runExternalPrepare,
    );
    const scopeRoot = flags['target-root']
      ? resolve(flags['target-root'])
      : selection.scope === 'global' ? homedir() : process.cwd();
    distributePreparedSkills(scopeRoot, selection, prepared, flags.force, this.log.bind(this));
    p.outro(`已安装 ${prepared.length} 个 skill 到 ${selection.targets.length} 个 target`);
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
  const categoryIds = new Set((categoryFlags ?? []).flatMap((value) => value.split(',')));
  const skillIds = new Set(skillFlags ?? []);
  for (const category of catalog.categories) {
    if (!categoryIds.has(category.id)) continue;
    for (const skillId of category.skillIds) skillIds.add(skillId);
  }
  if (skillIds.size === 0) throw new Error('请通过 -G 或 -s 指定要安装的 skill');
  const unknown = [...skillIds].filter((id) => !catalog.skills.some((skill) => skill.id === id));
  if (unknown.length > 0) throw new Error(`未知 skill：${unknown.join(', ')}`);
  return catalog.skills.filter((skill) => skillIds.has(skill.id));
}

/** 检查所选本地来源和外部暂存状态，准备前一次性报告。 */
function inspectPreparedState(
  sourceDir: string,
  cacheDir: string,
  skills: SkillRecord[],
  log: (message: string) => void,
): void {
  const missingLocal = skills.filter((skill) =>
    skill.type === 'local' && !existsSync(join(sourceDir, skill.source, 'SKILL.md')));
  if (missingLocal.length > 0) {
    throw new Error(`本地来源缺失：${missingLocal.map((skill) => skill.name).join(', ')}`);
  }
  const pendingExternal = skills.filter((skill) =>
    skill.type === 'external' && !existsSync(join(externalCacheDir(cacheDir, skill), 'SKILL.md')));
  log(`检查完成：来源已准备 ${skills.length - pendingExternal.length}，待暂存外部 ${pendingExternal.length}`);
}

/** 将一个外部包复制到缓存目录，下载期间展示 spinner 进度。 */
async function runExternalPrepare(input: {
  packageId: string;
  skillNames: string[];
  cachePackageDir: string;
  index: number;
  total: number;
}): Promise<void> {
  mkdirSync(input.cachePackageDir, { recursive: true });
  const skillLabel = input.skillNames.join(', ');
  const progress = `${input.index}/${input.total}`;
  const spin = p.spinner();
  spin.start(`正在缓存外部 skill ${progress}：${input.packageId}（${skillLabel}）`);
  try {
    await spawnSkillsAdd(input.packageId, input.skillNames, input.cachePackageDir);
    spin.stop(`已缓存 ${progress}：${input.packageId}`);
  } catch (error) {
    spin.stop(`缓存失败 ${progress}：${input.packageId}`);
    throw error;
  }
}

/** 异步执行 npx skills add，避免阻塞事件循环导致 spinner 停住。 */
function spawnSkillsAdd(
  packageId: string,
  skillNames: string[],
  cachePackageDir: string,
): Promise<void> {
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

/** 对所有已准备来源执行同一个分发循环并更新安装记录。 */
function distributePreparedSkills(
  scopeRoot: string,
  selection: InstallSelection,
  prepared: Array<SkillRecord & { sourceDir: string }>,
  force: boolean,
  log: (message: string) => void,
): void {
  for (const targetId of selection.targets) {
    const target = getTarget(targetId);
    const recordFile = join(scopeRoot, target.skillsDir, MANIFEST_FILE);
    const record = readInstallRecord(recordFile);
    for (const skill of prepared) {
      const result = installItem({
        source: skill.sourceDir,
        dest: join(scopeRoot, target.skillsDir, skill.name),
        mode: selection.mode,
        force,
      });
      if (result.status !== 'skipped') {
        record.skills[skill.name] = {
          mode: selection.mode,
          installedAt: new Date().toISOString(),
          sourceHash: result.sourceHash,
        };
      }
      log(`${targetId}/${skill.name}: ${result.status}`);
    }
    writeInstallRecord(recordFile, record);
  }
}

/** 只有未显式指定 skill 范围时才进入完整交互。 */
function hasExplicitSelection(flags: { category?: string[]; skill?: string[] }): boolean {
  return Boolean(
    (flags.category && flags.category.length > 0) ||
    (flags.skill && flags.skill.length > 0),
  );
}
