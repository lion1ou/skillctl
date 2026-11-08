import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { InstallMode } from './installer.js';
import { loadProductPreferences } from './product-preferences.js';
import { normalizeGitRemote } from './source-git.js';
import { getTarget, type TargetId } from './targets.js';

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
export function readWorkspaceProject(
  workspaceRoot: string,
  env: NodeJS.ProcessEnv = process.env,
): WorkspaceProjectConfig | null {
  const file = workspaceProjectPath(workspaceRoot);
  if (!existsSync(file)) return null;
  const raw = JSON.parse(readFileSync(file, 'utf8')) as Partial<WorkspaceProjectConfig>;
  if (raw.version !== 1) throw new Error(`无效的 Workspace 项目配置：${file}`);
  return normalizeWorkspaceProject(raw, env);
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

function normalizeWorkspaceProject(
  value: Partial<WorkspaceProjectConfig>,
  env: NodeJS.ProcessEnv,
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
    project.sourceRemote = normalizeGitRemote(
      value.sourceRemote,
      loadProductPreferences(env).gitProtocol,
    );
  }
  return project;
}
