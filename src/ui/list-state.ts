export interface InstalledListViewState {
  workspace: string;
  agent: string;
  keyword: string;
  status: string;
  installMode: string;
  selectedSkillIds: string[];
  scrollTop: number;
}

export interface CatalogListViewState {
  category: string;
  keyword: string;
  enabled: string;
  type: string;
  scope: string;
  selectedSkillIds: string[];
  scrollTop: number;
}

/** 安装管理页退回详情前保存的选中状态键。 */
export function installedListStateKey(): string {
  return 'skillctl:list-state:installed';
}

/** Skill 源页退回详情前保存的选中状态键。 */
export function catalogListStateKey(): string {
  return 'skillctl:list-state:catalog';
}

/** 解析安装管理页保存的 Workspace、Agent、筛选和勾选。函数体会被嵌入页面，不能调用外部函数。 */
export function parseInstalledListState(raw: unknown): InstalledListViewState | null {
  let value: unknown = raw;
  if (typeof value === 'string') {
    if (!value) return null;
    try {
      value = JSON.parse(value) as unknown;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`无法解析列表选中状态：${message}`);
    }
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const state = value as Record<string, unknown>;
  if (typeof state.workspace !== 'string' || typeof state.agent !== 'string') return null;
  return {
    workspace: state.workspace,
    agent: state.agent,
    keyword: typeof state.keyword === 'string' ? state.keyword : '',
    status: typeof state.status === 'string' ? state.status : '',
    installMode: typeof state.installMode === 'string' ? state.installMode : '',
    selectedSkillIds: Array.isArray(state.selectedSkillIds)
      ? state.selectedSkillIds.filter((item): item is string => typeof item === 'string' && item.length > 0)
      : [],
    scrollTop: typeof state.scrollTop === 'number' && Number.isFinite(state.scrollTop) && state.scrollTop > 0
      ? state.scrollTop
      : 0,
  };
}

/** 解析 Skill 源页保存的分类、筛选和勾选。函数体会被嵌入页面，不能调用外部函数。 */
export function parseCatalogListState(raw: unknown): CatalogListViewState | null {
  let value: unknown = raw;
  if (typeof value === 'string') {
    if (!value) return null;
    try {
      value = JSON.parse(value) as unknown;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`无法解析列表选中状态：${message}`);
    }
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const state = value as Record<string, unknown>;
  if (typeof state.category !== 'string') return null;
  return {
    category: state.category,
    keyword: typeof state.keyword === 'string' ? state.keyword : '',
    enabled: typeof state.enabled === 'string' ? state.enabled : '',
    type: typeof state.type === 'string' ? state.type : '',
    scope: typeof state.scope === 'string' ? state.scope : '',
    selectedSkillIds: Array.isArray(state.selectedSkillIds)
      ? state.selectedSkillIds.filter((item): item is string => typeof item === 'string' && item.length > 0)
      : [],
    scrollTop: typeof state.scrollTop === 'number' && Number.isFinite(state.scrollTop) && state.scrollTop > 0
      ? state.scrollTop
      : 0,
  };
}
