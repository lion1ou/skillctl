import assert from 'node:assert/strict';
import { existsSync, lstatSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { CATEGORIES_FILE, SKILLS_FILE } from '../src/core/brand.js';
import { initializeCliConfig } from '../src/core/cli-config.js';
import { startManagerServer } from '../src/core/manager-server.js';
import { createTmpRepo } from './helpers/tmp-repo.js';

test('管理服务可添加 Workspace、扫描其中 Skill 并固定 Agent', async () => {
  const repo = createTmpRepo('skillctl-manager-server-');
  const env = {
    HOME: repo.root,
    XDG_CONFIG_HOME: join(repo.root, 'config'),
  } as NodeJS.ProcessEnv;
  const workspace = join(repo.root, 'project');
  repo.writeFile('project/.cursor/skills/review/SKILL.md', [
    '---',
    'name: review',
    'description: 审查代码',
    '---',
  ].join('\n'));
  initializeCliConfig({ sourceDir: join(repo.root, 'catalog'), env });
  repo.writeFile(`catalog/${SKILLS_FILE}`, JSON.stringify({
    version: 1,
    skills: [{
      id: 'detail-skill',
      package: 'skill-catalog',
      name: 'detail-skill',
      description: '详情能力',
      version: '1.0.0',
      source: 'skills/detail-skill',
      type: 'local',
      enabled: true,
    }],
  }));
  repo.writeFile(`catalog/${CATEGORIES_FILE}`, JSON.stringify({
    version: 1,
    categories: [{
      id: 'common',
      name: '通用',
      description: '通用能力',
      skillIds: ['detail-skill'],
    }],
  }));
  repo.writeFile('catalog/skills/detail-skill/SKILL.md', '---\nname: detail-skill\n---\n# Detail');
  const manager = await startManagerServer({
    port: 0,
    env,
    pickWorkspace: async () => workspace,
  });
  try {
    const html = await (await fetch(manager.url)).text();
    const token = html.match(/const token="([^"]+)"/)?.[1];
    assert.ok(token);
    const detailHtml = await (await fetch(`${manager.url}/catalog/skill?id=detail-skill`)).text();
    assert.match(detailHtml, /skill-ctl · Skill 详情/);
    const icon = await fetch(`${manager.url}/assets/skillctl-icon.png`);
    assert.equal(icon.status, 200);
    assert.equal(icon.headers.get('content-type'), 'image/png');
    assert.ok((await icon.arrayBuffer()).byteLength > 0);
    const favicon = await fetch(`${manager.url}/favicon.ico`);
    assert.equal(favicon.status, 200);
    const request = (path: string, options: RequestInit = {}) => fetch(`${manager.url}${path}`, {
      ...options,
      headers: {
        'content-type': 'application/json',
        'x-skillctl-token': token,
        ...options.headers,
      },
    });

    const initialStatus = await (await request('/api/status')).json() as {
      initialized: boolean;
      configPath: string;
      sourceDir: string;
      cacheDir: string;
    };
    assert.equal(initialStatus.initialized, true);
    assert.equal(initialStatus.sourceDir, join(repo.root, 'catalog'));

    const detail = await (await request('/api/catalog/skills/detail?id=detail-skill')).json() as {
      available: boolean;
      content: string;
      skill: { id: string };
    };
    assert.equal(detail.available, true);
    assert.equal(detail.skill.id, 'detail-skill');
    assert.match(detail.content, /# Detail/);

    const picked = await request('/api/workspaces/pick', { method: 'POST', body: '{}' });
    assert.equal(picked.status, 200);
    const listed = await (await request('/api/workspaces')).json() as {
      workspaces: { path: string; pinnedTargetIds: string[] }[];
      targets: { id: string; skillsDir: string }[];
    };
    assert.equal(listed.workspaces.some((item) => item.path === workspace), true);
    assert.equal(listed.targets.some((item) => item.id === 'gemini'), true);

    const scanned = await (await request(`/api/skills?workspace=${encodeURIComponent(workspace)}`)).json() as {
      workspaceRoot: string;
      skills: { name: string }[];
    };
    assert.equal(scanned.workspaceRoot, workspace);
    assert.deepEqual(scanned.skills.map((skill) => skill.name), ['review']);

    const installedHtml = await (await fetch(`${manager.url}/skill?from=installed`)).text();
    assert.match(installedHtml, /skill-ctl · Skill 详情/);
    const installedDetail = await (await request(
      `/api/skills/detail?workspace=${encodeURIComponent(workspace)}&target=cursor&relativeDir=review`,
    )).json() as { available: boolean; content: string; skill: { name: string } };
    assert.equal(installedDetail.available, true);
    assert.equal(installedDetail.skill.name, 'review');
    assert.match(installedDetail.content, /审查代码/);

    await request('/api/workspaces/targets', {
      method: 'PATCH',
      body: JSON.stringify({ workspace, target: 'gemini', isPinned: true }),
    });
    const pinned = await (await request('/api/workspaces')).json() as {
      workspaces: { path: string; pinnedTargetIds: string[] }[];
    };
    assert.deepEqual(
      pinned.workspaces.find((item) => item.path === workspace)?.pinnedTargetIds,
      ['gemini'],
    );

    await request('/api/workspaces/targets', {
      method: 'PATCH',
      body: JSON.stringify({ workspace, target: 'cursor', isPinned: true }),
    });
    const removed = await request('/api/skills/agent', {
      method: 'DELETE',
      body: JSON.stringify({ workspace, target: 'cursor' }),
    });
    assert.equal(removed.status, 200);
    const removedPayload = await removed.json() as {
      skills: unknown[];
      removal: { removed: boolean; target: string };
    };
    assert.deepEqual(removedPayload.skills, []);
    assert.deepEqual(removedPayload.removal, { removed: true, target: 'cursor' });
    assert.equal(existsSync(join(workspace, '.cursor/skills')), false);

    const afterRemoval = await (await request('/api/workspaces')).json() as {
      workspaces: { path: string; pinnedTargetIds: string[] }[];
    };
    assert.deepEqual(
      afterRemoval.workspaces.find((item) => item.path === workspace)?.pinnedTargetIds,
      ['gemini'],
    );

    const unauthorized = await fetch(`${manager.url}/api/skills/agent`, {
      method: 'DELETE',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ workspace, target: 'gemini' }),
    });
    assert.equal(unauthorized.status, 403);

    const unknownTarget = await request('/api/skills/agent', {
      method: 'DELETE',
      body: JSON.stringify({ workspace, target: 'unknown-agent' }),
    });
    assert.equal(unknownTarget.status, 400);

    const unmanagedWorkspace = await request('/api/skills/agent', {
      method: 'DELETE',
      body: JSON.stringify({ workspace: join(repo.root, 'outside'), target: 'gemini' }),
    });
    assert.equal(unmanagedWorkspace.status, 400);

    const installed = await request('/api/skills/install', {
      method: 'POST',
      body: JSON.stringify({
        workspace,
        target: 'cursor',
        categoryIds: ['common'],
        mode: 'symlink',
      }),
    });
    assert.equal(installed.status, 200);
    assert.match(installed.headers.get('content-type') ?? '', /ndjson/);
    const events = (await installed.text()).trim().split('\n').map((line) => JSON.parse(line) as {
      type: string;
      line?: string;
      install?: { items: { skill: string; status: string }[] };
    });
    assert.equal(events.some((event) => event.type === 'log' && String(event.line).includes('已选择')), true);
    const result = events.at(-1);
    assert.equal(result?.type, 'result');
    assert.equal(
      result?.install?.items.some((item) => item.skill === 'detail-skill' && item.status === 'create'),
      true,
    );
  } finally {
    await new Promise<void>((resolvePromise) => manager.server.close(() => resolvePromise()));
    repo.cleanup();
  }
});

test('管理服务扫描并删除软链损坏的 skill', async () => {
  const repo = createTmpRepo('skillctl-manager-broken-skill-');
  const env = {
    HOME: repo.root,
    XDG_CONFIG_HOME: join(repo.root, 'config'),
  } as NodeJS.ProcessEnv;
  const workspace = join(repo.root, 'project');
  const missingSource = join(repo.root, 'missing-source');
  repo.writeFile('project/.cursor/skills/review/SKILL.md', [
    '---',
    'name: review',
    'description: 审查代码',
    '---',
  ].join('\n'));
  symlinkSync(missingSource, join(workspace, '.cursor/skills/broken-skill'), 'dir');
  initializeCliConfig({ sourceDir: join(repo.root, 'catalog'), env });
  repo.writeFile(`catalog/${SKILLS_FILE}`, JSON.stringify({ version: 1, skills: [] }));
  repo.writeFile(`catalog/${CATEGORIES_FILE}`, JSON.stringify({ version: 1, categories: [] }));
  const manager = await startManagerServer({ port: 0, env });
  try {
    const html = await (await fetch(manager.url)).text();
    const token = html.match(/const token="([^"]+)"/)?.[1];
    assert.ok(token);
    const request = (path: string, options: RequestInit = {}) => fetch(`${manager.url}${path}`, {
      ...options,
      headers: {
        'content-type': 'application/json',
        'x-skillctl-token': token,
        ...options.headers,
      },
    });

    await request('/api/workspaces', {
      method: 'POST',
      body: JSON.stringify({ path: workspace }),
    });
    const scanned = await (await request(`/api/skills?workspace=${encodeURIComponent(workspace)}`)).json() as {
      skills: { name: string; isBroken?: boolean; relativeDir: string }[];
    };
    const broken = scanned.skills.find((skill) => skill.name === 'broken-skill');
    assert.equal(broken?.isBroken, true);

    const deleted = await request('/api/skills', {
      method: 'DELETE',
      body: JSON.stringify({
        workspace,
        target: 'cursor',
        relativeDir: 'broken-skill',
      }),
    });
    assert.equal(deleted.status, 200);
    const after = await deleted.json() as { skills: { name: string }[] };
    assert.equal(after.skills.some((skill) => skill.name === 'broken-skill'), false);
    assert.equal(after.skills.some((skill) => skill.name === 'review'), true);
    assert.throws(() => lstatSync(join(workspace, '.cursor/skills/broken-skill')), /ENOENT/);
    assert.equal(existsSync(join(workspace, '.cursor/skills/review/SKILL.md')), true);
  } finally {
    await new Promise<void>((resolvePromise) => manager.server.close(() => resolvePromise()));
    repo.cleanup();
  }
});
