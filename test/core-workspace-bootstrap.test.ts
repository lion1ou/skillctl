import assert from 'node:assert/strict';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { CATEGORIES_FILE, SKILLS_FILE } from '../src/core/brand.js';
import { initializeCliConfig, loadCliConfig } from '../src/core/cli-config.js';
import { addAndBootstrapWorkspace } from '../src/core/workspace-bootstrap.js';
import { readWorkspaceProject } from '../src/core/workspace-project.js';
import { createTmpRepo } from './helpers/tmp-repo.js';

test('添加没有项目配置的 Workspace 时不生成 .skillctl', async () => {
  const repo = createTmpRepo('skillctl-ws-bootstrap-empty-');
  try {
    const env = {
      HOME: repo.root,
      XDG_CONFIG_HOME: join(repo.root, 'config'),
    } as NodeJS.ProcessEnv;
    const catalog = join(repo.root, 'catalog');
    mkdirSync(join(catalog, 'skills'), { recursive: true });
    writeFileSync(join(catalog, SKILLS_FILE), `${JSON.stringify({ version: 1, skills: [] })}\n`);
    writeFileSync(
      join(catalog, CATEGORIES_FILE),
      `${JSON.stringify({ version: 1, categories: [] })}\n`,
    );
    initializeCliConfig({
      sourceDir: catalog,
      cacheDir: join(repo.root, 'cache'),
      env,
    });
    const workspace = join(repo.root, 'project');
    mkdirSync(workspace, { recursive: true });

    await addAndBootstrapWorkspace(workspace, env);
    assert.equal(existsSync(join(workspace, '.skillctl')), false);
  } finally {
    repo.cleanup();
  }
});

test('添加含项目配置的 Workspace 时恢复 pin 并补装缺失 Skill', async () => {
  const repo = createTmpRepo('skillctl-ws-bootstrap-');
  try {
    const env = {
      HOME: repo.root,
      XDG_CONFIG_HOME: join(repo.root, 'config'),
    } as NodeJS.ProcessEnv;
    const catalog = join(repo.root, 'catalog');
    const skillDir = join(catalog, 'skills/demo-skill');
    mkdirSync(skillDir, { recursive: true });
    writeFileSync(join(skillDir, 'SKILL.md'), '---\nname: demo-skill\ndescription: demo\n---\n');
    writeFileSync(
      join(catalog, SKILLS_FILE),
      `${JSON.stringify({
        version: 1,
        skills: [{
          id: 'demo-skill',
          package: 'local',
          name: 'demo-skill',
          description: 'demo',
          version: '1.0.0',
          source: 'skills/demo-skill',
          type: 'local',
          enabled: true,
        }],
      }, null, 2)}\n`,
    );
    writeFileSync(
      join(catalog, CATEGORIES_FILE),
      `${JSON.stringify({
        version: 1,
        categories: [{ id: 'common', name: '通用', description: '', skillIds: ['demo-skill'] }],
      }, null, 2)}\n`,
    );
    initializeCliConfig({
      sourceDir: catalog,
      cacheDir: join(repo.root, 'cache'),
      env,
    });

    const workspace = join(repo.root, 'project');
    mkdirSync(join(workspace, '.skillctl'), { recursive: true });
    writeFileSync(join(workspace, '.skillctl/workspace.json'), `${JSON.stringify({
      version: 1,
      sourceRemote: 'git@github.com:lion1ou/skills.git',
      pinnedTargetIds: ['cursor'],
      targets: {
        cursor: { mode: 'symlink', skills: ['demo-skill'] },
      },
    }, null, 2)}\n`);

    const result = await addAndBootstrapWorkspace(workspace, env);
    assert.deepEqual(
      loadCliConfig(env).workspaces.find((item) => item.path === workspace)?.pinnedTargetIds,
      ['cursor'],
    );
    assert.equal(existsSync(join(workspace, '.cursor/skills/demo-skill/SKILL.md')), true);
    assert.equal(result.installed.length, 1);
    assert.equal(readWorkspaceProject(workspace)?.targets.cursor?.skills.includes('demo-skill'), true);
    assert.equal(readWorkspaceProject(workspace)?.sourceRemote, 'git@github.com:lion1ou/skills.git');
  } finally {
    repo.cleanup();
  }
});
