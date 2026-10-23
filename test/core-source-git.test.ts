import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { CATEGORIES_FILE, SKILLS_FILE } from '../src/core/brand.js';
import {
  isGitRemoteSource,
  resolveGitSourceLocalPath,
  ensureGitSourceCheckout,
} from '../src/core/source-git.js';
import { createTmpRepo } from './helpers/tmp-repo.js';

test('识别常见 git 远程地址，拒绝本地路径', () => {
  assert.equal(isGitRemoteSource('https://github.com/lion1ou/skills.git'), true);
  assert.equal(isGitRemoteSource('http://github.com/lion1ou/skills'), true);
  assert.equal(isGitRemoteSource('git@github.com:lion1ou/skills.git'), true);
  assert.equal(isGitRemoteSource('ssh://git@github.com/lion1ou/skills.git'), true);
  assert.equal(isGitRemoteSource('file:///tmp/catalog.git'), true);
  assert.equal(isGitRemoteSource('/Users/name/skill-catalog'), false);
  assert.equal(isGitRemoteSource('~/skill-catalog'), false);
  assert.equal(isGitRemoteSource('owner/repo'), false);
});

test('由远程地址推导配置目录下的本地存储路径', () => {
  const env = {
    HOME: '/tmp/skillctl-home',
    XDG_CONFIG_HOME: '/tmp/skillctl-xdg',
  } as NodeJS.ProcessEnv;
  assert.equal(
    resolveGitSourceLocalPath('https://github.com/lion1ou/skills.git', env),
    join('/tmp/skillctl-xdg', 'skillctl', 'sources', 'lion1ou', 'skills'),
  );
  assert.equal(
    resolveGitSourceLocalPath('git@github.com:acme/catalog.git', env),
    join('/tmp/skillctl-xdg', 'skillctl', 'sources', 'acme', 'catalog'),
  );
});

test('首次 checkout 会 clone 到本地路径，再次调用复用已有仓库', () => {
  const repo = createTmpRepo('skillctl-git-source-');
  try {
    const remoteRoot = join(repo.root, 'remote');
    mkdirSync(remoteRoot, { recursive: true });
    writeFileSync(join(remoteRoot, SKILLS_FILE), `${JSON.stringify({ version: 1, skills: [] })}\n`);
    writeFileSync(
      join(remoteRoot, CATEGORIES_FILE),
      `${JSON.stringify({ version: 1, categories: [] })}\n`,
    );
    mkdirSync(join(remoteRoot, 'skills'), { recursive: true });
    execFileSync('git', ['init'], { cwd: remoteRoot, stdio: 'ignore' });
    execFileSync('git', ['config', 'user.email', 'test@example.com'], {
      cwd: remoteRoot,
      stdio: 'ignore',
    });
    execFileSync('git', ['config', 'user.name', 'test'], { cwd: remoteRoot, stdio: 'ignore' });
    execFileSync('git', ['add', '.'], { cwd: remoteRoot, stdio: 'ignore' });
    execFileSync('git', ['commit', '-m', 'init'], { cwd: remoteRoot, stdio: 'ignore' });

    const env = {
      HOME: repo.root,
      XDG_CONFIG_HOME: join(repo.root, 'config'),
    } as NodeJS.ProcessEnv;
    const remote = `file://${remoteRoot}`;
    const first = ensureGitSourceCheckout(remote, { env });
    assert.equal(existsSync(join(first.localPath, SKILLS_FILE)), true);
    assert.equal(existsSync(join(first.localPath, '.git')), true);
    assert.equal(first.remote, remote);

    writeFileSync(join(first.localPath, 'marker.txt'), 'keep\n');
    const second = ensureGitSourceCheckout(remote, { env });
    assert.equal(second.localPath, first.localPath);
    assert.equal(readFileSync(join(second.localPath, 'marker.txt'), 'utf8'), 'keep\n');
  } finally {
    repo.cleanup();
  }
});
