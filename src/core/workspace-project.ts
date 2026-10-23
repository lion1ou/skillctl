import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { MANIFEST_FILE } from './brand.js';
import { readInstallRecord } from './install-record.js';
import type { InstallMode } from './installer.js';
import { toSshGitRemote } from './source-git.js';
import { getTarget, TARGETS, type TargetId } from './targets.js';

export { toSshGitRemote } from './source-git.js';

export const WORKSPACE_PROJECT_RELATIVE = join('.skillctl', 'workspace.json');

export interface WorkspaceProjectTarget {
  mode: InstallMode;
  skills: string[];
}

export interface WorkspaceProjectConfig {
  version: 1;
  sourceRemote?: string;
  pinnedTargetIds: TargetId[];
  targets: Partial<Record<TargetId, WorkspaceProjectTarget>>;
}

/** 项目内可提交的 Workspace 配置路径。 */
export function workspaceProjectPath(workspaceRoot: string): string {
  return join(resolve(workspaceRoot), WORKSPACE_PROJECT_RELATIVE);
}

/** 读取 Workspace 项目配置；文件不存在时返回 null。 */
export function readWorkspaceProject(workspaceRoot: string): WorkspaceProjectConfig | null {
  const file = workspaceProjectPath(workspaceRoot);
  if (!existsSync(file)) return null;
  const raw = JSON.parse(readFileSync(file, 'utf8')) as Partial<WorkspaceProjectConfig>;
  if (raw.version !== 1) throw new Error(`无效的 Workspace 项目配置：${file}`);
  return normalizeWorkspaceProject(raw);
}

/** 写入 Workspace 项目配置（SSH 源地址、pin 与已装 skill）。 */
export function writeWorkspaceProject(
  workspaceRoot: string,
  config: WorkspaceProjectConfig,
): void {
  const file = workspaceProjectPath(workspaceRoot);
  mkdirSync(dirname(file), { recursive: true });
  const normalized = normalizeWorkspaceProject(config);
  writeFileSync(file, `${JSON.stringify(normalized, null, 2)}\n`, 'utf8');
}

/** 按本机 pin 与 target 安装记录刷新并写回项目配置。 */
export function refreshWorkspaceProjectFile(
  workspaceRoot: string,
  options: {
    pinnedTargetIds: TargetId[];
    sourceRemote?: string;
  },
): WorkspaceProjectConfig {
  const root = resolve(workspaceRoot);
  const existing = readWorkspaceProject(root);
  const sourceRemote = resolveProjectSourceRemote(existing?.sourceRemote, options.sourceRemote);
  const pinnedTargetIds = [...new Set(options.pinnedTargetIds)].sort();
  const targets: WorkspaceProjectConfig['targets'] = {};
  const targetIds = new Set<TargetId>([
    ...pinnedTargetIds,
    ...TARGETS.map((target) => target.id).filter((id) =>
      existsSync(join(root, getTarget(id).skillsDir))),
  ]);
  for (const targetId of [...targetIds].sort()) {
    const target = getTarget(targetId);
    const record = readInstallRecord(join(root, target.skillsDir, MANIFEST_FILE));
    const skills = Object.keys(record.skills).sort();
    if (skills.length === 0 && !pinnedTargetIds.includes(targetId)) continue;
    const mode = skills.length > 0
      ? record.skills[skills[0]!]?.mode ?? 'symlink'
      : 'symlink';
    targets[targetId] = { mode, skills };
  }
  const project: WorkspaceProjectConfig = {
    version: 1,
    pinnedTargetIds,
    targets,
    ...(sourceRemote ? { sourceRemote } : {}),
  };
  writeWorkspaceProject(root, project);
  return project;
}

/** 从 catalog 里按 id 或 name 解析要安装的 skill id。 */
export function resolveCatalogSkillIds(
  catalogSkills: Array<{ id: string; name: string }>,
  requested: string[],
): string[] {
  const ids: string[] = [];
  for (const item of requested) {
    const match = catalogSkills.find((skill) => skill.id === item || skill.name === item);
    if (!match) throw new Error(`项目配置中的 skill 不在源目录：${item}`);
    ids.push(match.id);
  }
  return [...new Set(ids)];
}

/** 计算某 target 相对项目配置仍缺失的 skill 名称。 */
export function listMissingProjectSkills(
  workspaceRoot: string,
  targetId: TargetId,
  skillNames: string[],
): string[] {
  const target = getTarget(targetId);
  const root = join(resolve(workspaceRoot), target.skillsDir);
  return skillNames.filter((name) => {
    const skillDir = join(root, name);
    return !(
      existsSync(join(skillDir, 'SKILL.md'))
      || existsSync(join(skillDir, 'SKILL.md.disable'))
    );
  });
}

/** 安装分发后把 target 安装记录合并进项目配置（保留已有 SSH 源与 pin）。 */
export function mergeWorkspaceProjectInstalls(
  workspaceRoot: string,
  targetIds: TargetId[],
): WorkspaceProjectConfig {
  const root = resolve(workspaceRoot);
  const existing = readWorkspaceProject(root) ?? {
    version: 1 as const,
    pinnedTargetIds: [] as TargetId[],
    targets: {},
  };
  const targets: WorkspaceProjectConfig['targets'] = { ...existing.targets };
  const pinned = new Set(existing.pinnedTargetIds);
  for (const targetId of targetIds) {
    const target = getTarget(targetId);
    const record = readInstallRecord(join(root, target.skillsDir, MANIFEST_FILE));
    const skills = Object.keys(record.skills).sort();
    const mode = skills.length > 0
      ? record.skills[skills[0]!]?.mode ?? 'symlink'
      : targets[targetId]?.mode ?? 'symlink';
    targets[targetId] = { mode, skills };
    if (skills.length > 0) pinned.add(targetId);
  }
  const project: WorkspaceProjectConfig = {
    version: 1,
    pinnedTargetIds: [...pinned].sort(),
    targets,
    ...(existing.sourceRemote ? { sourceRemote: existing.sourceRemote } : {}),
  };
  writeWorkspaceProject(root, project);
  return project;
}

function resolveProjectSourceRemote(
  existing?: string,
  fromCli?: string,
): string | undefined {
  const candidate = existing?.trim() || fromCli?.trim();
  if (!candidate) return undefined;
  return toSshGitRemote(candidate);
}

function normalizeWorkspaceProject(
  value: Partial<WorkspaceProjectConfig>,
): WorkspaceProjectConfig {
  const pinnedTargetIds = Array.isArray(value.pinnedTargetIds)
    ? value.pinnedTargetIds.flatMap((id) => {
      if (typeof id !== 'string') return [];
      try {
        return [getTarget(id).id];
      } catch {
        return [];
      }
    })
    : [];
  const targets: WorkspaceProjectConfig['targets'] = {};
  if (value.targets && typeof value.targets === 'object') {
    for (const [key, entry] of Object.entries(value.targets)) {
      try {
        const targetId = getTarget(key).id;
        if (!entry || typeof entry !== 'object') continue;
        const mode = entry.mode === 'copy' ? 'copy' : 'symlink';
        const skills = Array.isArray(entry.skills)
          ? [...new Set(entry.skills.filter((name): name is string =>
            typeof name === 'string' && name.trim() !== ''))].sort()
          : [];
        targets[targetId] = { mode, skills };
      } catch {
        // 忽略未知 target
      }
    }
  }
  const project: WorkspaceProjectConfig = {
    version: 1,
    pinnedTargetIds: [...new Set(pinnedTargetIds)].sort(),
    targets,
  };
  if (typeof value.sourceRemote === 'string' && value.sourceRemote.trim()) {
    project.sourceRemote = toSshGitRemote(value.sourceRemote);
  }
  return project;
}
