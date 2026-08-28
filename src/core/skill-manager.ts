import {
  existsSync,
  lstatSync,
  readFileSync,
  readdirSync,
  readlinkSync,
  realpathSync,
  renameSync,
  rmSync,
  statSync,
  unlinkSync,
} from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { normalizeSkillDescription, parseFrontmatter } from './frontmatter.js';
import { MANIFEST_FILE } from './brand.js';
import { readInstallRecord, writeInstallRecord } from './install-record.js';
import { TARGETS, getTarget, type TargetId } from './targets.js';

const ENABLED_FILE = 'SKILL.md';
const DISABLED_FILE = 'SKILL.md.disable';

export interface ManagedSkill {
  id: string;
  target: TargetId;
  name: string;
  description: string;
  relativeDir: string;
  installedPath: string;
  isEnabled: boolean;
  isSymlink: boolean;
  isBroken: boolean;
  linkTarget?: string;
}

export interface ManagedAgent {
  id: TargetId;
  agentDir: string;
  agentPath: string;
  skillsDir: string;
  skillsPath: string;
  detected: boolean;
  skillCount: number;
  enabledCount: number;
}

export interface InstalledWorkspace {
  workspaceRoot: string;
  agents: ManagedAgent[];
  skills: ManagedSkill[];
}

export interface InstalledSkillDetail {
  skill: ManagedSkill;
  available: boolean;
  sourcePath: string;
  content?: string;
}

/** 扫描 Workspace，汇总已落地 Agent 目录、skills 目录和其中的 skill。 */
export function scanInstalledWorkspace(workspaceRoot = homedir()): InstalledWorkspace {
  const skills = scanManagedSkills(workspaceRoot);
  const agents = TARGETS.map((target) => {
    const agentDir = dirname(target.skillsDir);
    const agentPath = join(workspaceRoot, agentDir);
    const skillsPath = join(workspaceRoot, target.skillsDir);
    const targetSkills = skills.filter((skill) => skill.target === target.id);
    return {
      id: target.id,
      agentDir,
      agentPath,
      skillsDir: target.skillsDir,
      skillsPath,
      detected: existsSync(agentPath) || existsSync(skillsPath),
      skillCount: targetSkills.length,
      enabledCount: targetSkills.filter((skill) => skill.isEnabled).length,
    };
  }).filter((agent) => agent.detected)
    .sort((left, right) => left.id.localeCompare(right.id));
  return { workspaceRoot, agents, skills };
}

/** 扫描 Workspace 中所有 target，汇总可视化管理所需的 skill 状态。 */
export function scanManagedSkills(workspaceRoot = homedir()): ManagedSkill[] {
  const skills: ManagedSkill[] = [];
  for (const target of TARGETS) {
    const targetRoot = join(workspaceRoot, target.skillsDir);
    if (!existsSync(targetRoot)) continue;
    scanTargetDirectory(target.id, targetRoot, targetRoot, skills, new Set(), 0);
  }
  return skills.sort((left, right) =>
    left.target.localeCompare(right.target) ||
    Number(right.isBroken) - Number(left.isBroken) ||
    Number(right.isEnabled) - Number(left.isEnabled) ||
    left.name.localeCompare(right.name));
}

/** 在固定 target 根目录内切换 SKILL.md 文件名，阻止路径越界操作。 */
export function setManagedSkillEnabled(input: {
  workspaceRoot?: string;
  target: TargetId;
  relativeDir: string;
  isEnabled: boolean;
}): InstalledWorkspace {
  const workspaceRoot = input.workspaceRoot ?? homedir();
  const targetRoot = resolve(workspaceRoot, getTarget(input.target).skillsDir);
  const skillDir = resolve(targetRoot, input.relativeDir);
  if (skillDir !== targetRoot && !skillDir.startsWith(`${targetRoot}${sep}`)) {
    throw new Error('skill 路径超出 target 根目录');
  }
  const knownSkill = scanManagedSkills(workspaceRoot).some((skill) =>
    skill.target === input.target && skill.relativeDir === input.relativeDir);
  if (!knownSkill) throw new Error('未找到要管理的 skill');

  const sourceFile = join(skillDir, input.isEnabled ? DISABLED_FILE : ENABLED_FILE);
  const destinationFile = join(skillDir, input.isEnabled ? ENABLED_FILE : DISABLED_FILE);
  if (existsSync(destinationFile) && !existsSync(sourceFile)) {
    return scanInstalledWorkspace(workspaceRoot);
  }
  if (!existsSync(sourceFile)) throw new Error(`缺少待改名文件：${sourceFile}`);
  if (existsSync(destinationFile)) throw new Error(`启用和禁用文件同时存在：${skillDir}`);
  renameSync(sourceFile, destinationFile);
  return scanInstalledWorkspace(workspaceRoot);
}

/** 删除 Workspace 中单个 Skill；软链只移除链接，复制安装移除目标副本。 */
export function removeManagedSkill(input: {
  workspaceRoot?: string;
  target: TargetId;
  relativeDir: string;
}): InstalledWorkspace {
  const workspaceRoot = resolve(input.workspaceRoot ?? homedir());
  const targetRoot = resolve(workspaceRoot, getTarget(input.target).skillsDir);
  const skillDir = resolve(targetRoot, input.relativeDir);
  if (skillDir === targetRoot || !skillDir.startsWith(`${targetRoot}${sep}`)) {
    throw new Error('skill 路径超出 target 根目录');
  }
  const skill = scanManagedSkills(workspaceRoot).find((item) =>
    item.target === input.target && item.relativeDir === input.relativeDir);
  if (!skill) throw new Error('未找到要管理的 skill');
  if (lstatSync(targetRoot).isSymbolicLink()) {
    throw new Error('Agent skills 根目录为软链，不能单独删除其中的 Skill');
  }

  const recordFile = join(targetRoot, MANIFEST_FILE);
  const hasRecord = existsSync(recordFile);
  const record = readInstallRecord(recordFile);
  if (skill.isSymlink) unlinkSync(skill.installedPath);
  else rmSync(skill.installedPath, { recursive: true });

  if (hasRecord) {
    delete record.skills[input.relativeDir];
    writeInstallRecord(recordFile, record);
  }
  return scanInstalledWorkspace(workspaceRoot);
}

/** 删除白名单 Agent 的 skills 根目录；根目录为软链时仅移除链接本身。 */
export function removeManagedAgentSkills(input: {
  workspaceRoot?: string;
  target: TargetId;
}): { removed: boolean; skillsPath: string } {
  const workspaceRoot = resolve(input.workspaceRoot ?? homedir());
  const skillsPath = resolve(workspaceRoot, getTarget(input.target).skillsDir);
  if (skillsPath === workspaceRoot || !skillsPath.startsWith(`${workspaceRoot}${sep}`)) {
    throw new Error('Agent skills 路径超出 Workspace');
  }
  let pathState: ReturnType<typeof lstatSync>;
  try {
    pathState = lstatSync(skillsPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { removed: false, skillsPath };
    throw error;
  }
  if (pathState.isSymbolicLink()) {
    unlinkSync(skillsPath);
  } else {
    rmSync(skillsPath, { recursive: true });
  }
  return { removed: true, skillsPath };
}

/** 读取已落地 Skill 的 SKILL.md；软链只读目标文件，不允许文件路径逃出 Skill 目录。 */
export function loadInstalledSkillDetail(input: {
  workspaceRoot?: string;
  target: TargetId;
  relativeDir: string;
}): InstalledSkillDetail {
  const workspaceRoot = input.workspaceRoot ?? homedir();
  const targetRoot = resolve(workspaceRoot, getTarget(input.target).skillsDir);
  const skillDir = resolve(targetRoot, input.relativeDir);
  if (skillDir !== targetRoot && !skillDir.startsWith(`${targetRoot}${sep}`)) {
    throw new Error('skill 路径超出 target 根目录');
  }
  const skill = scanManagedSkills(workspaceRoot).find((item) =>
    item.target === input.target && item.relativeDir === input.relativeDir);
  if (!skill) throw new Error('未找到要管理的 skill');
  if (skill.isBroken) {
    return { skill, available: false, sourcePath: skill.linkTarget ?? skill.installedPath };
  }

  const marker = resolveSkillMarker(skill.installedPath);
  const sourcePath = join(skill.installedPath, marker?.file ?? ENABLED_FILE);
  if (!marker || !existsSync(sourcePath)) {
    return { skill, available: false, sourcePath };
  }

  const realSkillDir = realpathSync(skill.installedPath);
  const realSourcePath = realpathSync(sourcePath);
  if (realSourcePath !== realSkillDir && !realSourcePath.startsWith(`${realSkillDir}${sep}`)) {
    throw new Error('Skill 源路径超出允许目录');
  }
  if (statSync(realSourcePath).size > 512 * 1024) throw new Error('SKILL.md 超过 512 KiB，无法展示');
  return {
    skill,
    available: true,
    sourcePath,
    content: readFileSync(realSourcePath, 'utf8'),
  };
}

/** 递归识别分类目录和软链目录，遇到 skill 根目录后停止向下扫描。 */
function scanTargetDirectory(
  target: TargetId,
  targetRoot: string,
  currentDir: string,
  skills: ManagedSkill[],
  ancestors: Set<string>,
  depth: number,
): void {
  if (depth > 12) return;
  let realDir: string;
  try {
    realDir = realpathSync(currentDir);
  } catch {
    return;
  }
  if (ancestors.has(realDir)) return;
  const marker = resolveSkillMarker(currentDir);
  if (marker) {
    skills.push(buildManagedSkill(target, targetRoot, currentDir, marker));
    return;
  }
  const nextAncestors = new Set(ancestors).add(realDir);
  for (const entry of readdirSync(currentDir, { withFileTypes: true })) {
    const childDir = join(currentDir, entry.name);
    const symlinkKind = classifyDirectorySymlink(childDir);
    if (symlinkKind === 'broken') {
      skills.push(buildBrokenManagedSkill(target, targetRoot, childDir));
      continue;
    }
    if (!entry.isDirectory() && symlinkKind !== 'directory') continue;
    scanTargetDirectory(target, targetRoot, childDir, skills, nextAncestors, depth + 1);
  }
}

/** 根据启用文件优先级读取元数据，并保留软链真实来源。 */
function buildManagedSkill(
  target: TargetId,
  targetRoot: string,
  skillDir: string,
  marker: { file: string; isEnabled: boolean },
): ManagedSkill {
  const metadata = parseFrontmatter(readFileSync(join(skillDir, marker.file), 'utf8'));
  const relativeDir = relative(targetRoot, skillDir);
  const isSymlink = lstatSync(skillDir).isSymbolicLink();
  return {
    id: `${target}:${relativeDir}`,
    target,
    name: metadata.name || relativeDir.split(sep).at(-1) || relativeDir,
    description: normalizeSkillDescription(metadata.description),
    relativeDir,
    installedPath: skillDir,
    isEnabled: marker.isEnabled,
    isSymlink,
    isBroken: false,
    linkTarget: isSymlink ? realpathSync(skillDir) : undefined,
  };
}

/** 断链 skill 没有可读的 SKILL.md，用目录名和链接目标展示。 */
function buildBrokenManagedSkill(
  target: TargetId,
  targetRoot: string,
  skillDir: string,
): ManagedSkill {
  const relativeDir = relative(targetRoot, skillDir);
  const name = relativeDir.split(sep).at(-1) || relativeDir;
  return {
    id: `${target}:${relativeDir}`,
    target,
    name,
    description: '软链目标不存在或不是目录',
    relativeDir,
    installedPath: skillDir,
    isEnabled: false,
    isSymlink: true,
    isBroken: true,
    linkTarget: resolve(dirname(skillDir), readlinkSync(skillDir)),
  };
}

/** 同时兼容启用文件和禁用文件，冲突时以启用状态展示。 */
function resolveSkillMarker(skillDir: string): { file: string; isEnabled: boolean } | null {
  if (existsSync(join(skillDir, ENABLED_FILE))) return { file: ENABLED_FILE, isEnabled: true };
  if (existsSync(join(skillDir, DISABLED_FILE))) return { file: DISABLED_FILE, isEnabled: false };
  return null;
}

/** 区分有效目录软链和断链；普通路径返回 none。 */
function classifyDirectorySymlink(path: string): 'directory' | 'broken' | 'none' {
  let pathState: ReturnType<typeof lstatSync>;
  try {
    pathState = lstatSync(path);
  } catch {
    return 'none';
  }
  if (!pathState.isSymbolicLink()) return 'none';
  try {
    return statSync(path).isDirectory() ? 'directory' : 'broken';
  } catch {
    return 'broken';
  }
}

