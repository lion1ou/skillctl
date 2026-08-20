export type TargetId =
  | 'cursor'
  | 'claude'
  | 'kiro'
  | 'agents'
  | 'codex'
  | 'openclaw'
  | 'hermes';

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
