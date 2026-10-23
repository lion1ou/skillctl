import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  installCatalogSkills,
  spawnExternalSkillAdd,
  type CatalogInstallResult,
} from './catalog-install.js';
import {
  addManagedWorkspace,
  initializeCliConfig,
  loadCliConfig,
  peekCliConfig,
  setWorkspaceTargetPinned,
  type CliConfig,
} from './cli-config.js';
import { loadSkillCatalog } from './skill-registry.js';
import type { TargetId } from './targets.js';
import { toSshGitRemote } from './source-git.js';
import {
  listMissingProjectSkills,
  readWorkspaceProject,
  refreshWorkspaceProjectFile,
  resolveCatalogSkillIds,
  type WorkspaceProjectConfig,
} from './workspace-project.js';

export interface WorkspaceBootstrapResult {
  config: CliConfig;
  project: WorkspaceProjectConfig | null;
  installed: CatalogInstallResult[];
}

/** 把本机 Workspace 的 pin/源信息同步进可提交的项目配置。 */
export function syncWorkspaceProjectAfterChange(
  workspaceRoot: string,
  env: NodeJS.ProcessEnv = process.env,
): WorkspaceProjectConfig | null {
  const root = resolve(workspaceRoot);
  const config = peekCliConfig(env);
  if (!config) return readWorkspaceProject(root);
  const workspace = config.workspaces.find((item) => item.path === root);
  if (!workspace) {
    return refreshWorkspaceProjectFile(root, {
      pinnedTargetIds: readWorkspaceProject(root)?.pinnedTargetIds ?? [],
      sourceRemote: config.sourceRemote,
    });
  }
  return refreshWorkspaceProjectFile(root, {
    pinnedTargetIds: workspace.pinnedTargetIds,
    sourceRemote: config.sourceRemote,
  });
}

/** 若本机未初始化且目录含项目配置，用 SSH 源完成 CLI 初始化。 */
export function ensureCliInitializedFromProject(
  workspaceRoot: string,
  env: NodeJS.ProcessEnv = process.env,
): CliConfig | null {
  const existing = peekCliConfig(env);
  if (existing) return existing;
  const project = readWorkspaceProject(workspaceRoot);
  if (!project?.sourceRemote) return null;
  return initializeCliConfig({
    sourceDir: toSshGitRemote(project.sourceRemote),
    env,
  });
}

/** 添加 Workspace：恢复 pin，并自动安装项目配置中缺失的 Skill。 */
export async function addAndBootstrapWorkspace(
  workspacePath: string,
  env: NodeJS.ProcessEnv = process.env,
  options: {
    onLog?: (line: string) => void;
  } = {},
): Promise<WorkspaceBootstrapResult> {
  const root = resolve(workspacePath);
  if (!existsSync(root)) throw new Error(`Workspace 目录不存在：${root}`);
  ensureCliInitializedFromProject(root, env);
  if (!peekCliConfig(env)) {
    throw new Error('CLI 尚未初始化，且该目录没有可用的 .skillctl/workspace.json 源地址');
  }
  addManagedWorkspace(root, env);
  const project = readWorkspaceProject(root);
  if (project) {
    for (const targetId of project.pinnedTargetIds) {
      setWorkspaceTargetPinned(root, targetId, true, env);
    }
  }
  const installed = project
    ? await installMissingSkillsFromProject(root, project, env, options.onLog)
    : [];
  const config = loadCliConfig(env);
  syncWorkspaceProjectAfterChange(root, env);
  return {
    config,
    project: readWorkspaceProject(root),
    installed,
  };
}

/** 按项目配置安装当前缺失的 Skill。 */
export async function installMissingSkillsFromProject(
  workspaceRoot: string,
  project: WorkspaceProjectConfig,
  env: NodeJS.ProcessEnv = process.env,
  onLog?: (line: string) => void,
): Promise<CatalogInstallResult[]> {
  const { sourceDir, cacheDir } = loadCliConfig(env);
  const catalog = loadSkillCatalog(sourceDir);
  const results: CatalogInstallResult[] = [];
  for (const [targetId, entry] of Object.entries(project.targets)) {
    if (!entry || entry.skills.length === 0) continue;
    const missing = listMissingProjectSkills(workspaceRoot, targetId as TargetId, entry.skills);
    if (missing.length === 0) {
      onLog?.(`${targetId}: 项目配置 Skill 已齐全`);
      continue;
    }
    onLog?.(`${targetId}: 补装缺失 Skill ${missing.join(', ')}`);
    const skillIds = resolveCatalogSkillIds(catalog.skills, missing);
    const result = await installCatalogSkills({
      sourceDir,
      cacheDir,
      scopeRoot: workspaceRoot,
      targets: [targetId as TargetId],
      selection: { skillIds },
      mode: entry.mode,
      force: false,
      onLog,
      runExternalPrepare: async (prepare) => {
        onLog?.(
          `准备外部包 ${prepare.index}/${prepare.total}：${prepare.packageId}（${prepare.skillNames.join(', ')}）`,
        );
        await spawnExternalSkillAdd(
          prepare.packageId,
          prepare.skillNames,
          prepare.cachePackageDir,
          onLog,
        );
      },
    });
    results.push(result);
  }
  return results;
}
