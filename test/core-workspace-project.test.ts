import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import {
  readWorkspaceProject,
  toSshGitRemote,
  workspaceProjectPath,
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

test('读取已有 .skillctl/workspace.json', () => {
  const repo = createTmpRepo('skillctl-ws-project-');
  try {
    const workspace = join(repo.root, 'project');
    const file = join(workspace, '.skillctl/workspace.json');
    mkdirSync(join(workspace, '.skillctl'), { recursive: true });
    writeFileSync(file, `${JSON.stringify({
      version: 1,
      sourceRemote: 'https://github.com/lion1ou/skills.git',
      pinnedTargetIds: ['cursor'],
      targets: {
        cursor: { mode: 'symlink', skills: ['demo'] },
      },
    }, null, 2)}\n`);
    assert.equal(workspaceProjectPath(workspace), file);
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
