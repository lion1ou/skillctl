import {
  existsSync,
  lstatSync,
  readFileSync,
  readdirSync,
  realpathSync,
  renameSync,
  statSync,
} from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { normalizeSkillDescription, parseFrontmatter } from './frontmatter.js';
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
  userRoot: string;
  agents: ManagedAgent[];
  skills: ManagedSkill[];
}

/** 扫描用户根目录，汇总已落地 Agent 目录、skills 目录和其中的 skill。 */
export function scanInstalledWorkspace(userRoot = homedir()): InstalledWorkspace {
  const skills = scanManagedSkills(userRoot);
  const agents = TARGETS.map((target) => {
    const agentDir = dirname(target.skillsDir);
    const agentPath = join(userRoot, agentDir);
    const skillsPath = join(userRoot, target.skillsDir);
    const targetSkills = skills.filter((skill) => skill.target === target.id);
    return {
      id: target.id,
      agentDir,
      agentPath,
      skillsDir: target.skillsDir,
      skillsPath,
      detected: existsSync(agentPath),
      skillCount: targetSkills.length,
      enabledCount: targetSkills.filter((skill) => skill.isEnabled).length,
    };
  }).sort((left, right) =>
    Number(right.detected) - Number(left.detected) || left.id.localeCompare(right.id));
  return { userRoot, agents, skills };
}

/** 扫描用户根目录中所有 target，汇总可视化管理所需的 skill 状态。 */
export function scanManagedSkills(userRoot = homedir()): ManagedSkill[] {
  const skills: ManagedSkill[] = [];
  for (const target of TARGETS) {
    const targetRoot = join(userRoot, target.skillsDir);
    if (!existsSync(targetRoot)) continue;
    scanTargetDirectory(target.id, targetRoot, targetRoot, skills, new Set(), 0);
  }
  return skills.sort((left, right) =>
    left.target.localeCompare(right.target) || left.name.localeCompare(right.name));
}

/** 在固定 target 根目录内切换 SKILL.md 文件名，阻止路径越界操作。 */
export function setManagedSkillEnabled(input: {
  userRoot?: string;
  target: TargetId;
  relativeDir: string;
  isEnabled: boolean;
}): InstalledWorkspace {
  const userRoot = input.userRoot ?? homedir();
  const targetRoot = resolve(userRoot, getTarget(input.target).skillsDir);
  const skillDir = resolve(targetRoot, input.relativeDir);
  if (skillDir !== targetRoot && !skillDir.startsWith(`${targetRoot}${sep}`)) {
    throw new Error('skill 路径超出 target 根目录');
  }
  const knownSkill = scanManagedSkills(userRoot).some((skill) =>
    skill.target === input.target && skill.relativeDir === input.relativeDir);
  if (!knownSkill) throw new Error('未找到要管理的 skill');

  const sourceFile = join(skillDir, input.isEnabled ? DISABLED_FILE : ENABLED_FILE);
  const destinationFile = join(skillDir, input.isEnabled ? ENABLED_FILE : DISABLED_FILE);
  if (existsSync(destinationFile) && !existsSync(sourceFile)) return scanInstalledWorkspace(userRoot);
  if (!existsSync(sourceFile)) throw new Error(`缺少待改名文件：${sourceFile}`);
  if (existsSync(destinationFile)) throw new Error(`启用和禁用文件同时存在：${skillDir}`);
  renameSync(sourceFile, destinationFile);
  return scanInstalledWorkspace(userRoot);
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
    if (!entry.isDirectory() && !isDirectorySymlink(childDir)) continue;
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
    linkTarget: isSymlink ? realpathSync(skillDir) : undefined,
  };
}

/** 同时兼容启用文件和禁用文件，冲突时以启用状态展示。 */
function resolveSkillMarker(skillDir: string): { file: string; isEnabled: boolean } | null {
  if (existsSync(join(skillDir, ENABLED_FILE))) return { file: ENABLED_FILE, isEnabled: true };
  if (existsSync(join(skillDir, DISABLED_FILE))) return { file: DISABLED_FILE, isEnabled: false };
  return null;
}

/** 判断有效目录软链，断链不进入递归扫描。 */
function isDirectorySymlink(path: string): boolean {
  if (!existsSync(path)) return false;
  const pathState = lstatSync(path);
  if (!pathState.isSymbolicLink()) return false;
  const targetState = statSync(path);
  return targetState.isDirectory();
}

