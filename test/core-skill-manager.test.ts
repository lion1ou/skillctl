import assert from 'node:assert/strict';
import { existsSync, lstatSync, realpathSync, readlinkSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import * as skillManager from '../src/core/skill-manager.js';
import { createTmpRepo } from './helpers/tmp-repo.js';

const { removeBrokenManagedSkill, scanInstalledWorkspace, scanManagedSkills, setManagedSkillEnabled } = skillManager;

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

    const afterDelete = removeBrokenManagedSkill({
      workspaceRoot: repo.root,
      target: 'cursor',
      relativeDir: 'broken-skill',
    });
    assert.equal(afterDelete.skills.some((skill) => skill.name === 'broken-skill'), false);
    assert.equal(afterDelete.skills.some((skill) => skill.name === 'review'), true);
    assert.throws(() => lstatSync(brokenPath), /ENOENT/);
    assert.equal(existsSync(join(repo.root, '.cursor/skills/review/SKILL.md')), true);

    assert.throws(() => removeBrokenManagedSkill({
      workspaceRoot: repo.root,
      target: 'cursor',
      relativeDir: 'review',
    }), /只能删除软链损坏的 skill/);
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

test('删除 Agent skills 目录时保留软链接源', () => {
  const repo = createTmpRepo('skillctl-manager-remove-agent-');
  const removeManagedAgentSkills = Reflect.get(skillManager, 'removeManagedAgentSkills') as
    | ((input: { workspaceRoot: string; target: string }) => { removed: boolean; skillsPath: string })
    | undefined;
  try {
    repo.writeFile('sources/linked/SKILL.md', '# linked');
    repo.writeFile('.cursor/skills/copied/SKILL.md', '# copied');
    symlinkSync(
      join(repo.root, 'sources/linked'),
      join(repo.root, '.cursor/skills/linked'),
      'dir',
    );

    assert.equal(typeof removeManagedAgentSkills, 'function');
    const result = removeManagedAgentSkills?.({ workspaceRoot: repo.root, target: 'cursor' });

    assert.equal(result?.removed, true);
    assert.equal(result?.skillsPath, join(repo.root, '.cursor/skills'));
    assert.equal(existsSync(join(repo.root, '.cursor/skills')), false);
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

test('Agent skills 根目录为软链接时只删除链接', () => {
  const repo = createTmpRepo('skillctl-manager-remove-root-link-');
  const removeManagedAgentSkills = Reflect.get(skillManager, 'removeManagedAgentSkills') as
    | ((input: { workspaceRoot: string; target: string }) => { removed: boolean })
    | undefined;
  try {
    repo.writeFile('sources/cursor/review/SKILL.md', '# review');
    repo.mkdir('.cursor');
    symlinkSync(join(repo.root, 'sources/cursor'), join(repo.root, '.cursor/skills'), 'dir');

    assert.equal(removeManagedAgentSkills?.({
      workspaceRoot: repo.root,
      target: 'cursor',
    }).removed, true);
    assert.equal(existsSync(join(repo.root, '.cursor/skills')), false);
    assert.equal(existsSync(join(repo.root, 'sources/cursor/review/SKILL.md')), true);
  } finally {
    repo.cleanup();
  }
});

test('Agent skills 根目录为断开的软链接时仍删除链接', () => {
  const repo = createTmpRepo('skillctl-manager-remove-broken-link-');
  const removeManagedAgentSkills = Reflect.get(skillManager, 'removeManagedAgentSkills') as
    | ((input: { workspaceRoot: string; target: string }) => { removed: boolean })
    | undefined;
  try {
    repo.mkdir('.cursor');
    const skillsPath = join(repo.root, '.cursor/skills');
    symlinkSync(join(repo.root, 'missing-source'), skillsPath, 'dir');

    assert.equal(removeManagedAgentSkills?.({
      workspaceRoot: repo.root,
      target: 'cursor',
    }).removed, true);
    assert.throws(() => lstatSync(skillsPath), /ENOENT/);
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
