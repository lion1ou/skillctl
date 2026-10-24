import assert from 'node:assert/strict';
import { existsSync, lstatSync, readFileSync, realpathSync, readlinkSync, rmSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import * as skillManager from '../src/core/skill-manager.js';
import { createTmpRepo } from './helpers/tmp-repo.js';

const {
  removeManagedSkill,
  removeManagedSkills,
  restoreBrokenSkillSymlink,
  scanInstalledWorkspace,
  scanManagedSkills,
  setManagedSkillEnabled,
} = skillManager;

test('扫描各 target 的启用、禁用和软链 skill', () => {
  const repo = createTmpRepo('skillctl-manager-scan-');
  try {
    repo.writeFile('.agents/skills/group/disabled/SKILL.md.disable', [
      '---',
      'name: disabled',
      'description: 已关闭能力',
      '---',
    ].join('\n'));
    repo.writeFile('sources/linked/SKILL.md', [
      '---',
      'name: linked',
      'description: 软链能力',
      '---',
    ].join('\n'));
    repo.mkdir('.cursor/skills');
    symlinkSync(
      join(repo.root, 'sources/linked'),
      join(repo.root, '.cursor/skills/linked'),
      'dir',
    );

    const skills = scanManagedSkills(repo.root);

    assert.deepEqual(skills.map((skill) => [skill.target, skill.name, skill.isEnabled]), [
      ['agents', 'disabled', false],
      ['cursor', 'linked', true],
    ]);
    const linked = skills.find((skill) => skill.name === 'linked');
    assert.equal(linked?.isSymlink, true);
    assert.equal(linked?.linkTarget, realpathSync(join(repo.root, 'sources/linked')));

    const workspace = scanInstalledWorkspace(repo.root);
    const agents = workspace.agents.filter((agent) => agent.detected).map((agent) => agent.id);
    assert.deepEqual(agents, ['agents', 'cursor']);
    const cursor = workspace.agents.find((agent) => agent.id === 'cursor');
    assert.equal(cursor?.agentDir, '.cursor');
    assert.equal(cursor?.skillsDir, '.cursor/skills');
    assert.equal(cursor?.skillCount, 1);
    assert.equal(cursor?.enabledCount, 1);
    const agentsTarget = workspace.agents.find((agent) => agent.id === 'agents');
    assert.equal(agentsTarget?.skillsDir, '.agents/skills');
    assert.equal(agentsTarget?.skillCount, 1);
    assert.equal(agentsTarget?.enabledCount, 0);
  } finally {
    repo.cleanup();
  }
});

test('Agent 列表只展示用户根目录中已出现的 Agent 目录', () => {
  const repo = createTmpRepo('skillctl-manager-agents-');
  try {
    assert.deepEqual(scanInstalledWorkspace(repo.root).agents, []);

    repo.mkdir('.claude');
    repo.mkdir('.codex/skills');
    const workspace = scanInstalledWorkspace(repo.root);

    assert.deepEqual(workspace.agents.map((agent) => agent.id), ['claude', 'codex']);
    assert.equal(workspace.agents.every((agent) => agent.detected), true);
    assert.equal(workspace.agents.find((agent) => agent.id === 'claude')?.skillCount, 0);
  } finally {
    repo.cleanup();
  }
});

test('仅有 skills 目录时也会识别为已检测 Agent', () => {
  const repo = createTmpRepo('skillctl-manager-skills-only-');
  try {
    repo.writeFile('.cursor/skills/demo/SKILL.md', '# demo');

    const workspace = scanInstalledWorkspace(repo.root);
    assert.deepEqual(workspace.agents.map((agent) => agent.id), ['cursor']);
    assert.equal(workspace.agents[0]?.detected, true);
  } finally {
    repo.cleanup();
  }
});

test('扫描会列出软链损坏的 skill，并允许只删除该链接', () => {
  const repo = createTmpRepo('skillctl-manager-broken-link-');
  try {
    repo.writeFile('.cursor/skills/review/SKILL.md', [
      '---',
      'name: review',
      'description: 审查代码',
      '---',
    ].join('\n'));
    const missingSource = join(repo.root, 'missing-source');
    const brokenPath = join(repo.root, '.cursor/skills/broken-skill');
    symlinkSync(missingSource, brokenPath, 'dir');

    const skills = scanManagedSkills(repo.root);
    const broken = skills.find((skill) => skill.name === 'broken-skill');
    const review = skills.find((skill) => skill.name === 'review');

    assert.equal(review?.isBroken, false);
    assert.equal(broken?.target, 'cursor');
    assert.equal(broken?.relativeDir, 'broken-skill');
    assert.equal(broken?.isSymlink, true);
    assert.equal(broken?.isBroken, true);
    assert.equal(broken?.isEnabled, false);
    assert.equal(broken?.linkTarget, missingSource);
    assert.equal(readlinkSync(brokenPath), missingSource);

    const workspace = scanInstalledWorkspace(repo.root);
    const cursor = workspace.agents.find((agent) => agent.id === 'cursor');
    assert.equal(cursor?.skillCount, 2);
    assert.equal(cursor?.enabledCount, 1);

    const afterDelete = removeManagedSkill({
      workspaceRoot: repo.root,
      target: 'cursor',
      relativeDir: 'broken-skill',
    });
    assert.equal(afterDelete.skills.some((skill) => skill.name === 'broken-skill'), false);
    assert.equal(afterDelete.skills.some((skill) => skill.name === 'review'), true);
    assert.throws(() => lstatSync(brokenPath), /ENOENT/);
    assert.equal(existsSync(join(repo.root, '.cursor/skills/review/SKILL.md')), true);
  } finally {
    repo.cleanup();
  }
});

test('可单独删除复制、禁用和软链 Skill，并清理安装记录但保留软链源', () => {
  const repo = createTmpRepo('skillctl-manager-remove-skill-');
  try {
    repo.writeFile('.cursor/skills/copied/SKILL.md', '---\nname: copied\n---\n# copied');
    repo.writeFile('.cursor/skills/disabled/SKILL.md.disable', '---\nname: disabled\n---\n# disabled');
    repo.writeFile('sources/linked/SKILL.md', '---\nname: linked\n---\n# linked');
    symlinkSync(
      join(repo.root, 'sources/linked'),
      join(repo.root, '.cursor/skills/linked'),
      'dir',
    );
    repo.writeFile('.cursor/skills/.skillctl.json', JSON.stringify({
      version: 1,
      managedBy: 'skillctl',
      skills: {
        copied: { mode: 'copy', installedAt: '2026-08-28T00:00:00.000Z', sourceHash: 'sha256:x' },
        disabled: { mode: 'copy', installedAt: '2026-08-28T00:00:00.000Z', sourceHash: 'sha256:y' },
        linked: { mode: 'symlink', installedAt: '2026-08-28T00:00:00.000Z', sourceHash: null },
      },
    }));

    removeManagedSkill({ workspaceRoot: repo.root, target: 'cursor', relativeDir: 'copied' });
    removeManagedSkill({ workspaceRoot: repo.root, target: 'cursor', relativeDir: 'disabled' });
    const after = removeManagedSkill({ workspaceRoot: repo.root, target: 'cursor', relativeDir: 'linked' });

    assert.deepEqual(after?.skills, []);
    assert.equal(existsSync(join(repo.root, '.cursor/skills/copied')), false);
    assert.equal(existsSync(join(repo.root, '.cursor/skills/disabled')), false);
    assert.equal(existsSync(join(repo.root, '.cursor/skills/linked')), false);
    assert.equal(existsSync(join(repo.root, 'sources/linked/SKILL.md')), true);
    const record = JSON.parse(readFileSync(join(repo.root, '.cursor/skills/.skillctl.json'), 'utf8')) as {
      skills: Record<string, unknown>;
    };
    assert.deepEqual(record.skills, {});
  } finally {
    repo.cleanup();
  }
});

test('单独删除 Skill 拒绝路径越过 target 根目录', () => {
  const repo = createTmpRepo('skillctl-manager-remove-path-');
  try {
    repo.writeFile('.agents/skills/safe/SKILL.md', '# safe');
    assert.throws(() => removeManagedSkill({
      workspaceRoot: repo.root,
      target: 'agents',
      relativeDir: '../../outside',
    }), /超出 target 根目录/);
  } finally {
    repo.cleanup();
  }
});

test('Agent skills 根目录为软链时拒绝单删子 Skill，避免删除源目录', () => {
  const repo = createTmpRepo('skillctl-manager-remove-linked-root-child-');
  try {
    repo.writeFile('sources/cursor/review/SKILL.md', '# review');
    repo.mkdir('.cursor');
    symlinkSync(join(repo.root, 'sources/cursor'), join(repo.root, '.cursor/skills'), 'dir');

    assert.throws(() => removeManagedSkill({
      workspaceRoot: repo.root,
      target: 'cursor',
      relativeDir: 'review',
    }), /skills 根目录为软链/);
    assert.equal(existsSync(join(repo.root, 'sources/cursor/review/SKILL.md')), true);
  } finally {
    repo.cleanup();
  }
});

test('安装记录按目录名清理，不删除同名展示字段对应的其他记录', () => {
  const repo = createTmpRepo('skillctl-manager-remove-record-key-');
  try {
    repo.writeFile(
      '.cursor/skills/catalog-name/SKILL.md',
      '---\nname: display-name\n---\n# catalog name',
    );
    repo.writeFile('.cursor/skills/.skillctl.json', JSON.stringify({
      version: 1,
      managedBy: 'skillctl',
      skills: {
        'catalog-name': { mode: 'copy', installedAt: '2026-08-28T00:00:00.000Z', sourceHash: 'sha256:x' },
        'display-name': { mode: 'copy', installedAt: '2026-08-28T00:00:00.000Z', sourceHash: 'sha256:y' },
      },
    }));

    removeManagedSkill({ workspaceRoot: repo.root, target: 'cursor', relativeDir: 'catalog-name' });

    const record = JSON.parse(readFileSync(join(repo.root, '.cursor/skills/.skillctl.json'), 'utf8')) as {
      skills: Record<string, unknown>;
    };
    assert.deepEqual(Object.keys(record.skills), ['display-name']);
  } finally {
    repo.cleanup();
  }
});

test('批量删除继续处理其余 Skill，并汇总失败项', () => {
  const repo = createTmpRepo('skillctl-manager-remove-batch-');
  try {
    repo.writeFile('.cursor/skills/keep/SKILL.md', '---\nname: keep\n---\n# keep');
    repo.writeFile('.cursor/skills/copied/SKILL.md', '---\nname: copied\n---\n# copied');
    repo.writeFile('sources/linked/SKILL.md', '---\nname: linked\n---\n# linked');
    symlinkSync(join(repo.root, 'sources/linked'), join(repo.root, '.cursor/skills/linked'), 'dir');

    const outcome = removeManagedSkills({
      workspaceRoot: repo.root,
      skills: [
        { target: 'cursor', relativeDir: 'copied' },
        { target: 'cursor', relativeDir: 'missing' },
        { target: 'cursor', relativeDir: 'linked' },
      ],
    });

    assert.deepEqual(outcome.results.map((item) => [item.relativeDir, item.removed]), [
      ['copied', true],
      ['missing', false],
      ['linked', true],
    ]);
    assert.match(outcome.results[1]?.error ?? '', /未找到要管理的 skill/);
    assert.deepEqual(outcome.workspace.skills.map((skill) => skill.name), ['keep']);
    assert.equal(existsSync(join(repo.root, 'sources/linked/SKILL.md')), true);
    assert.equal(existsSync(join(repo.root, '.cursor/skills/linked')), false);
  } finally {
    repo.cleanup();
  }
});

test('损坏软链可指向新的 Skill 源目录', () => {
  const repo = createTmpRepo('skillctl-manager-restore-link-');
  try {
    const missingSource = join(repo.root, 'missing-source');
    const brokenPath = join(repo.root, '.cursor/skills/broken-skill');
    repo.mkdir('.cursor/skills');
    symlinkSync(missingSource, brokenPath, 'dir');
    repo.writeFile('sources/restored/SKILL.md', [
      '---',
      'name: restored',
      'description: 已恢复',
      '---',
    ].join('\n'));

    const workspace = restoreBrokenSkillSymlink({
      workspaceRoot: repo.root,
      target: 'cursor',
      relativeDir: 'broken-skill',
      sourcePath: join(repo.root, 'sources/restored'),
    });
    const restored = workspace.skills.find((skill) => skill.relativeDir === 'broken-skill');

    assert.equal(restored?.isBroken, false);
    assert.equal(restored?.isSymlink, true);
    assert.equal(restored?.isEnabled, true);
    assert.equal(restored?.name, 'restored');
    assert.equal(readlinkSync(brokenPath), join(repo.root, 'sources/restored'));
    assert.equal(existsSync(missingSource), false);
  } finally {
    repo.cleanup();
  }
});

test('恢复软链拒绝不存在、缺少 Skill 文件或并非损坏链接的目标', () => {
  const repo = createTmpRepo('skillctl-manager-restore-reject-');
  try {
    repo.writeFile('.cursor/skills/copied/SKILL.md', '---\nname: copied\n---\n# copied');
    symlinkSync(join(repo.root, 'missing-source'), join(repo.root, '.cursor/skills/broken-skill'), 'dir');
    repo.writeFile('sources/empty-dir/.gitkeep', '');
    const brokenPath = join(repo.root, '.cursor/skills/broken-skill');
    const previousTarget = readlinkSync(brokenPath);

    assert.throws(() => restoreBrokenSkillSymlink({
      workspaceRoot: repo.root,
      target: 'cursor',
      relativeDir: 'copied',
      sourcePath: join(repo.root, 'sources/empty-dir'),
    }), /不是损坏软链/);
    assert.throws(() => restoreBrokenSkillSymlink({
      workspaceRoot: repo.root,
      target: 'cursor',
      relativeDir: 'broken-skill',
      sourcePath: join(repo.root, 'sources/empty-dir'),
    }), /SKILL\.md/);
    assert.throws(() => restoreBrokenSkillSymlink({
      workspaceRoot: repo.root,
      target: 'cursor',
      relativeDir: 'broken-skill',
      sourcePath: join(repo.root, 'sources/absent'),
    }), /源目录不存在/);
    assert.equal(readlinkSync(brokenPath), previousTarget);
  } finally {
    repo.cleanup();
  }
});

test('Agent skills 根目录为软链时拒绝恢复子 Skill，避免改写源目录', () => {
  const repo = createTmpRepo('skillctl-manager-restore-linked-root-');
  try {
    repo.writeFile('sources/cursor/broken-skill/SKILL.md', '---\nname: broken\n---\n# broken');
    repo.mkdir('.cursor');
    symlinkSync(join(repo.root, 'sources/cursor'), join(repo.root, '.cursor/skills'), 'dir');
    const brokenPath = join(repo.root, 'sources/cursor/broken-skill');
    const missingSource = join(repo.root, 'missing-source');
    rmSync(brokenPath, { recursive: true });
    symlinkSync(missingSource, brokenPath, 'dir');
    repo.writeFile('sources/restored/SKILL.md', '---\nname: restored\n---\n# restored');

    assert.throws(() => restoreBrokenSkillSymlink({
      workspaceRoot: repo.root,
      target: 'cursor',
      relativeDir: 'broken-skill',
      sourcePath: join(repo.root, 'sources/restored'),
    }), /skills 根目录为软链/);
    assert.equal(readlinkSync(brokenPath), missingSource);
    assert.equal(existsSync(join(repo.root, 'sources/restored/SKILL.md')), true);
  } finally {
    repo.cleanup();
  }
});

test('启停通过 SKILL.md 与 SKILL.md.disable 互相改名', () => {
  const repo = createTmpRepo('skillctl-manager-toggle-');
  try {
    repo.writeFile('.codex/skills/review/SKILL.md', [
      '---',
      'name: review',
      'description: 审查代码',
      '---',
    ].join('\n'));

    let workspace = setManagedSkillEnabled({
      workspaceRoot: repo.root,
      target: 'codex',
      relativeDir: 'review',
      isEnabled: false,
    });
    assert.equal(workspace.skills[0]?.isEnabled, false);
    assert.equal(existsSync(join(repo.root, '.codex/skills/review/SKILL.md.disable')), true);

    workspace = setManagedSkillEnabled({
      workspaceRoot: repo.root,
      target: 'codex',
      relativeDir: 'review',
      isEnabled: true,
    });
    assert.equal(workspace.skills[0]?.isEnabled, true);
    assert.equal(existsSync(join(repo.root, '.codex/skills/review/SKILL.md')), true);
  } finally {
    repo.cleanup();
  }
});

test('扫描时正确提取 YAML 多行 description，而不是 |', () => {
  const repo = createTmpRepo('skillctl-manager-desc-');
  try {
    repo.writeFile('.agents/skills/humanizer/SKILL.md', [
      '---',
      'name: humanizer-zh',
      'description: |',
      '  去除文本中的 AI 生成痕迹。适用于编辑或审阅文本。',
      '  基于维基百科指南。',
      '---',
      '',
      '# body',
    ].join('\n'));

    const skills = scanManagedSkills(repo.root);
    assert.equal(skills[0]?.name, 'humanizer-zh');
    assert.equal(skills[0]?.description, '去除文本中的 AI 生成痕迹。适用于编辑或审阅文本。 基于维基百科指南。');
  } finally {
    repo.cleanup();
  }
});

test('同一 Agent 内已启用 Skill 排在未启用 Skill 前面', () => {
  const repo = createTmpRepo('skillctl-manager-sort-');
  try {
    repo.writeFile('.agents/skills/a-disabled/SKILL.md.disable', '# disabled');
    repo.writeFile('.agents/skills/z-enabled/SKILL.md', '# enabled');

    const skills = scanManagedSkills(repo.root);

    assert.deepEqual(skills.map((skill) => [skill.name, skill.isEnabled]), [
      ['z-enabled', true],
      ['a-disabled', false],
    ]);
  } finally {
    repo.cleanup();
  }
});

test('启停接口拒绝越过 target 根目录', () => {
  const repo = createTmpRepo('skillctl-manager-path-');
  try {
    repo.writeFile('.agents/skills/safe/SKILL.md', '# safe');
    assert.throws(() => setManagedSkillEnabled({
      workspaceRoot: repo.root,
      target: 'agents',
      relativeDir: '../../outside',
      isEnabled: false,
    }), /超出 target 根目录/);
  } finally {
    repo.cleanup();
  }
});

test('删除 Agent 时移除整个 Agent 目录并保留软链接源', () => {
  const repo = createTmpRepo('skillctl-manager-remove-agent-');
  const removeManagedAgentSkills = Reflect.get(skillManager, 'removeManagedAgentSkills') as
    | ((input: { workspaceRoot: string; target: string }) => {
      removed: boolean;
      skillsPath: string;
      agentPath: string;
    })
    | undefined;
  try {
    repo.writeFile('sources/linked/SKILL.md', '# linked');
    repo.writeFile('.cursor/skills/copied/SKILL.md', '# copied');
    repo.writeFile('.cursor/mcp.json', '{}');
    symlinkSync(
      join(repo.root, 'sources/linked'),
      join(repo.root, '.cursor/skills/linked'),
      'dir',
    );

    assert.equal(typeof removeManagedAgentSkills, 'function');
    const result = removeManagedAgentSkills?.({ workspaceRoot: repo.root, target: 'cursor' });

    assert.equal(result?.removed, true);
    assert.equal(result?.skillsPath, join(repo.root, '.cursor/skills'));
    assert.equal(result?.agentPath, join(repo.root, '.cursor'));
    assert.equal(existsSync(join(repo.root, '.cursor')), false);
    assert.equal(existsSync(join(repo.root, 'sources/linked/SKILL.md')), true);
  } finally {
    repo.cleanup();
  }
});

test('删除不存在的 Agent skills 目录保持幂等', () => {
  const repo = createTmpRepo('skillctl-manager-remove-missing-');
  const removeManagedAgentSkills = Reflect.get(skillManager, 'removeManagedAgentSkills') as
    | ((input: { workspaceRoot: string; target: string }) => { removed: boolean })
    | undefined;
  try {
    assert.equal(typeof removeManagedAgentSkills, 'function');
    assert.equal(removeManagedAgentSkills?.({
      workspaceRoot: repo.root,
      target: 'gemini',
    }).removed, false);
  } finally {
    repo.cleanup();
  }
});

test('Agent 目录为软链接时只删除链接并保留源', () => {
  const repo = createTmpRepo('skillctl-manager-remove-root-link-');
  const removeManagedAgentSkills = Reflect.get(skillManager, 'removeManagedAgentSkills') as
    | ((input: { workspaceRoot: string; target: string }) => {
      removed: boolean;
      agentPath: string;
    })
    | undefined;
  try {
    repo.writeFile('sources/cursor/skills/review/SKILL.md', '# review');
    symlinkSync(join(repo.root, 'sources/cursor'), join(repo.root, '.cursor'), 'dir');

    assert.equal(removeManagedAgentSkills?.({
      workspaceRoot: repo.root,
      target: 'cursor',
    }).removed, true);
    assert.equal(existsSync(join(repo.root, '.cursor')), false);
    assert.equal(existsSync(join(repo.root, 'sources/cursor/skills/review/SKILL.md')), true);
  } finally {
    repo.cleanup();
  }
});

test('Agent 目录为断开的软链接时仍删除链接', () => {
  const repo = createTmpRepo('skillctl-manager-remove-broken-link-');
  const removeManagedAgentSkills = Reflect.get(skillManager, 'removeManagedAgentSkills') as
    | ((input: { workspaceRoot: string; target: string }) => { removed: boolean })
    | undefined;
  try {
    const agentPath = join(repo.root, '.cursor');
    symlinkSync(join(repo.root, 'missing-source'), agentPath, 'dir');

    assert.equal(removeManagedAgentSkills?.({
      workspaceRoot: repo.root,
      target: 'cursor',
    }).removed, true);
    assert.throws(() => lstatSync(agentPath), /ENOENT/);
  } finally {
    repo.cleanup();
  }
});

test('读取已安装 Skill 的 SKILL.md，禁用文件与软链内容均可展示', () => {
  const repo = createTmpRepo('skillctl-manager-detail-');
  const loadInstalledSkillDetail = Reflect.get(skillManager, 'loadInstalledSkillDetail') as
    | ((input: {
      workspaceRoot: string;
      target: string;
      relativeDir: string;
    }) => {
      available: boolean;
      sourcePath: string;
      content?: string;
      skill: { name: string; isEnabled: boolean; isSymlink: boolean };
    })
    | undefined;
  try {
    repo.writeFile('.codex/skills/review/SKILL.md', [
      '---',
      'name: review',
      'description: 审查代码',
      '---',
      '# Review body',
    ].join('\n'));
    repo.writeFile('.agents/skills/group/disabled/SKILL.md.disable', [
      '---',
      'name: disabled',
      'description: 已关闭能力',
      '---',
      '# Disabled body',
    ].join('\n'));
    repo.writeFile('sources/linked/SKILL.md', [
      '---',
      'name: linked',
      'description: 软链能力',
      '---',
      '# Linked body',
    ].join('\n'));
    repo.mkdir('.cursor/skills');
    symlinkSync(
      join(repo.root, 'sources/linked'),
      join(repo.root, '.cursor/skills/linked'),
      'dir',
    );

    assert.equal(typeof loadInstalledSkillDetail, 'function');
    const enabled = loadInstalledSkillDetail?.({
      workspaceRoot: repo.root,
      target: 'codex',
      relativeDir: 'review',
    });
    assert.equal(enabled?.available, true);
    assert.equal(enabled?.skill.name, 'review');
    assert.equal(enabled?.skill.isEnabled, true);
    assert.match(enabled?.content ?? '', /# Review body/);
    assert.match(enabled?.sourcePath ?? '', /SKILL\.md$/);

    const disabled = loadInstalledSkillDetail?.({
      workspaceRoot: repo.root,
      target: 'agents',
      relativeDir: 'group/disabled',
    });
    assert.equal(disabled?.available, true);
    assert.equal(disabled?.skill.isEnabled, false);
    assert.match(disabled?.content ?? '', /# Disabled body/);
    assert.match(disabled?.sourcePath ?? '', /SKILL\.md\.disable$/);

    const linked = loadInstalledSkillDetail?.({
      workspaceRoot: repo.root,
      target: 'cursor',
      relativeDir: 'linked',
    });
    assert.equal(linked?.available, true);
    assert.equal(linked?.skill.isSymlink, true);
    assert.match(linked?.content ?? '', /# Linked body/);

    assert.throws(
      () => loadInstalledSkillDetail?.({
        workspaceRoot: repo.root,
        target: 'codex',
        relativeDir: '../secret',
      }),
      /超出/,
    );
    assert.throws(
      () => loadInstalledSkillDetail?.({
        workspaceRoot: repo.root,
        target: 'codex',
        relativeDir: 'missing',
      }),
      /未找到/,
    );
  } finally {
    repo.cleanup();
  }
});
