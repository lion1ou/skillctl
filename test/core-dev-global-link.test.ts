import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  existsSync,
  lstatSync,
  readFileSync,
  readlinkSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import {
  DEV_BACKUP_SUFFIX,
  DEV_LOCK_SUFFIX,
  findSkillctlOnPath,
  linkGlobalSkillctl,
  npmGlobalSkillctlPath,
  restoreGlobalSkillctl,
} from '../src/core/dev-global-link.js';
import { resolveDevelopmentEntry } from '../src/dev-session.js';
import { createTmpRepo } from './helpers/tmp-repo.js';

test('开发入口固定解析到本仓库 bin/dev.js', () => {
  const entry = resolveDevelopmentEntry(new URL('../src/dev-session.ts', import.meta.url).href);
  assert.equal(entry, join(fileURLToPath(new URL('..', import.meta.url)), 'bin/dev.js'));
});

test('PATH 中没有 skill-ctl 时返回空，有则返回对应路径', () => {
  const repo = createTmpRepo('skill-ctl-which-');
  try {
    repo.writeFile('bin/skill-ctl', '#!/bin/sh\n');
    chmodSync(join(repo.root, 'bin/skill-ctl'), 0o755);
    assert.equal(findSkillctlOnPath('/missing:/also-missing'), undefined);
    assert.equal(findSkillctlOnPath(`${join(repo.root, 'bin')}:/missing`), join(repo.root, 'bin/skill-ctl'));
  } finally {
    repo.cleanup();
  }
});

test('npm 全局前缀映射到 bin/skill-ctl', () => {
  assert.equal(npmGlobalSkillctlPath('/usr/local'), '/usr/local/bin/skill-ctl');
});

test('原先没有全局命令时注册软链，恢复后删除', () => {
  const repo = createTmpRepo('skill-ctl-dev-none-');
  try {
    repo.writeFile('repo/bin/dev.js', '#!/usr/bin/env node\n');
    const binPath = join(repo.root, 'prefix/bin/skill-ctl');
    const developmentEntry = join(repo.root, 'repo/bin/dev.js');
    const link = linkGlobalSkillctl({ binPath, developmentEntry });

    assert.equal(link.owned, true);
    assert.equal(link.previous.kind, 'none');
    assert.equal(readlinkSync(binPath), developmentEntry);

    restoreGlobalSkillctl(link, developmentEntry);
    assert.equal(existsSync(binPath), false);
  } finally {
    repo.cleanup();
  }
});

test('原先是软链时改写指向，恢复后还原原目标', () => {
  const repo = createTmpRepo('skill-ctl-dev-symlink-');
  try {
    repo.writeFile('installed/bin/run.js', '#!/usr/bin/env node\n');
    repo.writeFile('repo/bin/dev.js', '#!/usr/bin/env node\n');
    const binPath = join(repo.root, 'prefix/bin/skill-ctl');
    const original = join(repo.root, 'installed/bin/run.js');
    const developmentEntry = join(repo.root, 'repo/bin/dev.js');
    repo.mkdir('prefix/bin');
    symlinkSync(original, binPath);

    const link = linkGlobalSkillctl({ binPath, developmentEntry });
    assert.equal(link.owned, true);
    assert.equal(readlinkSync(binPath), developmentEntry);

    restoreGlobalSkillctl(link, developmentEntry);
    assert.equal(lstatSync(binPath).isSymbolicLink(), true);
    assert.equal(readlinkSync(binPath), original);
  } finally {
    repo.cleanup();
  }
});

test('原先是普通文件时先备份再软链，恢复后还原文件并清备份', () => {
  const repo = createTmpRepo('skill-ctl-dev-file-');
  try {
    repo.writeFile('prefix/bin/skill-ctl', '#!/usr/bin/env node\noriginal\n');
    repo.writeFile('repo/bin/dev.js', '#!/usr/bin/env node\n');
    const binPath = join(repo.root, 'prefix/bin/skill-ctl');
    const developmentEntry = join(repo.root, 'repo/bin/dev.js');
    const link = linkGlobalSkillctl({ binPath, developmentEntry });

    assert.equal(link.previous.kind, 'file');
    assert.equal(readlinkSync(binPath), developmentEntry);
    assert.equal(existsSync(`${binPath}${DEV_BACKUP_SUFFIX}`), true);

    restoreGlobalSkillctl(link, developmentEntry);
    assert.equal(lstatSync(binPath).isSymbolicLink(), false);
    assert.equal(existsSync(`${binPath}${DEV_BACKUP_SUFFIX}`), false);
    assert.match(readFileSync(binPath, 'utf8'), /original/);
  } finally {
    repo.cleanup();
  }
});

test('会话仍在运行时不抢所有权，恢复为空操作', () => {
  const repo = createTmpRepo('skill-ctl-dev-owned-');
  try {
    repo.writeFile('repo/bin/dev.js', '#!/usr/bin/env node\n');
    const binPath = join(repo.root, 'prefix/bin/skill-ctl');
    const developmentEntry = join(repo.root, 'repo/bin/dev.js');
    const first = linkGlobalSkillctl({ binPath, developmentEntry });
    assert.equal(existsSync(`${binPath}${DEV_LOCK_SUFFIX}`), true);

    const nested = linkGlobalSkillctl({ binPath, developmentEntry });
    assert.equal(nested.owned, false);
    restoreGlobalSkillctl(nested, developmentEntry);
    assert.equal(existsSync(binPath), true);
    assert.equal(existsSync(`${binPath}${DEV_LOCK_SUFFIX}`), true);

    restoreGlobalSkillctl(first, developmentEntry);
    assert.equal(existsSync(binPath), false);
    assert.equal(existsSync(`${binPath}${DEV_LOCK_SUFFIX}`), false);
  } finally {
    repo.cleanup();
  }
});

test('软链残留但没有会话锁时接管，退出后删除', () => {
  const repo = createTmpRepo('skill-ctl-dev-stale-');
  try {
    repo.writeFile('repo/bin/dev.js', '#!/usr/bin/env node\n');
    const binPath = join(repo.root, 'prefix/bin/skill-ctl');
    const developmentEntry = join(repo.root, 'repo/bin/dev.js');
    repo.mkdir('prefix/bin');
    symlinkSync(developmentEntry, binPath);

    const link = linkGlobalSkillctl({ binPath, developmentEntry });

    assert.equal(link.owned, true);
    assert.equal(link.previous.kind, 'none');
    assert.equal(readlinkSync(binPath), developmentEntry);

    restoreGlobalSkillctl(link, developmentEntry);
    assert.equal(existsSync(binPath), false);
    assert.equal(existsSync(`${binPath}${DEV_LOCK_SUFFIX}`), false);
  } finally {
    repo.cleanup();
  }
});

test('会话锁里的进程已退出时接管残留软链', () => {
  const repo = createTmpRepo('skill-ctl-dev-dead-lock-');
  try {
    repo.writeFile('repo/bin/dev.js', '#!/usr/bin/env node\n');
    const binPath = join(repo.root, 'prefix/bin/skill-ctl');
    const developmentEntry = join(repo.root, 'repo/bin/dev.js');
    repo.mkdir('prefix/bin');
    symlinkSync(developmentEntry, binPath);
    const exited = spawnSync(process.execPath, ['-e', '']);
    assert.ok(exited.pid);
    writeFileSync(`${binPath}${DEV_LOCK_SUFFIX}`, `${exited.pid}\n`, 'utf8');

    const link = linkGlobalSkillctl({ binPath, developmentEntry });
    assert.equal(link.owned, true);
    assert.equal(readFileSync(`${binPath}${DEV_LOCK_SUFFIX}`, 'utf8').trim(), String(process.pid));

    restoreGlobalSkillctl(link, developmentEntry);
    assert.equal(existsSync(binPath), false);
    assert.equal(existsSync(`${binPath}${DEV_LOCK_SUFFIX}`), false);
  } finally {
    repo.cleanup();
  }
});
