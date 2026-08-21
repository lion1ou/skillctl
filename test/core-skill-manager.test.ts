import assert from 'node:assert/strict';
import { existsSync, realpathSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import {
  scanInstalledWorkspace,
  scanManagedSkills,
  setManagedSkillEnabled,
} from '../src/core/skill-manager.js';
import { createTmpRepo } from './helpers/tmp-repo.js';

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
      userRoot: repo.root,
      target: 'codex',
      relativeDir: 'review',
      isEnabled: false,
    });
    assert.equal(workspace.skills[0]?.isEnabled, false);
    assert.equal(existsSync(join(repo.root, '.codex/skills/review/SKILL.md.disable')), true);

    workspace = setManagedSkillEnabled({
      userRoot: repo.root,
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

test('启停接口拒绝越过 target 根目录', () => {
  const repo = createTmpRepo('skillctl-manager-path-');
  try {
    repo.writeFile('.agents/skills/safe/SKILL.md', '# safe');
    assert.throws(() => setManagedSkillEnabled({
      userRoot: repo.root,
      target: 'agents',
      relativeDir: '../../outside',
      isEnabled: false,
    }), /超出 target 根目录/);
  } finally {
    repo.cleanup();
  }
});
