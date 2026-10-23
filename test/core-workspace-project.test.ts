import assert from 'node:assert/strict';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { MANIFEST_FILE } from '../src/core/brand.js';
import {
  readWorkspaceProject,
  refreshWorkspaceProjectFile,
  toSshGitRemote,
  workspaceProjectPath,
  writeWorkspaceProject,
} from '../src/core/workspace-project.js';
import { createTmpRepo } from './helpers/tmp-repo.js';

test('https GitHub 地址规范为 SSH', () => {
  assert.equal(
    toSshGitRemote('https://github.com/lion1ou/skills.git'),
    'git@github.com:lion1ou/skills.git',
  );
  assert.equal(
    toSshGitRemote('https://github.com/lion1ou/skills'),
    'git@github.com:lion1ou/skills.git',
  );
  assert.equal(
    toSshGitRemote('git@github.com:lion1ou/skills.git'),
    'git@github.com:lion1ou/skills.git',
  );
});

test('读写 .skillctl/workspace.json', () => {
  const repo = createTmpRepo('skillctl-ws-project-');
  try {
    const workspace = join(repo.root, 'project');
    mkdirSync(workspace, { recursive: true });
    writeWorkspaceProject(workspace, {
      version: 1,
      sourceRemote: 'git@github.com:lion1ou/skills.git',
      pinnedTargetIds: ['cursor'],
      targets: {
        cursor: { mode: 'symlink', skills: ['demo'] },
      },
    });
    assert.equal(workspaceProjectPath(workspace), join(workspace, '.skillctl/workspace.json'));
    assert.deepEqual(readWorkspaceProject(workspace), {
      version: 1,
      sourceRemote: 'git@github.com:lion1ou/skills.git',
      pinnedTargetIds: ['cursor'],
      targets: {
        cursor: { mode: 'symlink', skills: ['demo'] },
      },
    });
  } finally {
    repo.cleanup();
  }
});

test('refreshWorkspaceProjectFile 根据安装记录与 pin 写回项目配置', () => {
  const repo = createTmpRepo('skillctl-ws-refresh-');
  try {
    const workspace = join(repo.root, 'project');
    const skillsDir = join(workspace, '.cursor/skills');
    mkdirSync(skillsDir, { recursive: true });
    writeFileSync(
      join(skillsDir, MANIFEST_FILE),
      `${JSON.stringify({
        version: 1,
        managedBy: 'skillctl',
        skills: {
          demo: { mode: 'symlink', installedAt: '2026-01-01T00:00:00.000Z', sourceHash: null },
        },
      }, null, 2)}\n`,
    );

    const project = refreshWorkspaceProjectFile(workspace, {
      pinnedTargetIds: ['cursor'],
      sourceRemote: 'https://github.com/lion1ou/skills.git',
    });
    assert.equal(existsSync(join(workspace, '.skillctl/workspace.json')), true);
    assert.equal(project.sourceRemote, 'git@github.com:lion1ou/skills.git');
    assert.deepEqual(project.pinnedTargetIds, ['cursor']);
    assert.deepEqual(project.targets.cursor, { mode: 'symlink', skills: ['demo'] });
  } finally {
    repo.cleanup();
  }
});
