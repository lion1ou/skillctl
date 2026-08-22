export type TargetId =
  | 'cursor'
  | 'claude'
  | 'kiro'
  | 'agents'
  | 'codex'
  | 'openclaw'
  | 'hermes'
  | 'gemini'
  | 'copilot'
  | 'windsurf'
  | 'roo'
  | 'opencode'
  | 'openhands'
  | 'droid'
  | 'continue'
  | 'trae'
  | 'trae-cn'
  | 'workbuddy'
  | 'qoder'
  | 'qoder-cn'
  | 'codebuddy'
  | 'qwen';

export interface Target {
  id: TargetId;
  skillsDir: string;
}

export const TARGETS: readonly Target[] = [
  {
    id: 'cursor',
    skillsDir: '.cursor/skills',
  },
  {
    id: 'claude',
    skillsDir: '.claude/skills',
  },
  {
    id: 'kiro',
    skillsDir: '.kiro/skills',
  },
  {
    id: 'agents',
    skillsDir: '.agents/skills',
  },
  {
    id: 'codex',
    skillsDir: '.codex/skills',
  },
  {
    id: 'openclaw',
    skillsDir: '.openclaw/skills',
  },
  {
    id: 'hermes',
    skillsDir: '.hermes/skills',
  },
  {
    id: 'gemini',
    skillsDir: '.gemini/skills',
  },
  {
    id: 'copilot',
    skillsDir: '.copilot/skills',
  },
  {
    id: 'windsurf',
    skillsDir: '.codeium/windsurf/skills',
  },
  {
    id: 'roo',
    skillsDir: '.roo/skills',
  },
  {
    id: 'opencode',
    skillsDir: '.config/opencode/skills',
  },
  {
    id: 'openhands',
    skillsDir: '.openhands/skills',
  },
  {
    id: 'droid',
    skillsDir: '.factory/skills',
  },
  {
    id: 'continue',
    skillsDir: '.continue/skills',
  },
  {
    id: 'trae',
    skillsDir: '.trae/skills',
  },
  {
    id: 'trae-cn',
    skillsDir: '.trae-cn/skills',
  },
  {
    id: 'workbuddy',
    skillsDir: '.workbuddy/skills',
  },
  {
    id: 'qoder',
    skillsDir: '.qoder/skills',
  },
  {
    id: 'qoder-cn',
    skillsDir: '.qoder-cn/skills',
  },
  {
    id: 'codebuddy',
    skillsDir: '.codebuddy/skills',
  },
  {
    id: 'qwen',
    skillsDir: '.qwen/skills',
  },
];

export function getTarget(id: string): Target {
  const t = TARGETS.find((x) => x.id === id);
  if (!t) throw new Error(`未知 target：${id}`);
  return t;
}

/** 交互/CLI 未指定 -t 时：默认仅选中 agents */
export function defaultTargetIds(_scope: 'project' | 'global'): TargetId[] {
  return ['agents'];
}
