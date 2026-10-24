import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import {
  isDirectoryLink,
  isSameLinkTarget,
  linkDirectory,
  resolveNpxSpawn,
} from '../src/core/fs-link.js';
import {
  defaultInstallMode,
  resolveInstallMode,
  supportsSymlinkInstall,
} from '../src/core/installer.js';
import { createTmpRepo } from './helpers/tmp-repo.js';

test('resolveNpxSpawn：Windows 使用 npx.cmd 且 shell:true，其他平台直接 npx', () => {
  const args = ['-y', 'skills', 'add', 'owner/repo'];
  const win = resolveNpxSpawn(args, 'win32');
  assert.equal(win.command, 'npx.cmd');
  assert.deepEqual(win.args, args);
  assert.equal(win.options.shell, true);
  assert.equal(win.options.windowsHide, true);

  const unix = resolveNpxSpawn(args, 'darwin');
  assert.equal(unix.command, 'npx');
  assert.deepEqual(unix.args, args);
  assert.equal(unix.options.shell, undefined);
});

test('Windows 不支持软链安装，resolveInstallMode 始终为 copy', () => {
  assert.equal(supportsSymlinkInstall('win32'), false);
  assert.equal(supportsSymlinkInstall('darwin'), true);
  assert.equal(defaultInstallMode('win32'), 'copy');
  assert.equal(defaultInstallMode('linux'), 'symlink');
  assert.equal(resolveInstallMode('symlink', 'win32'), 'copy');
  assert.equal(resolveInstallMode(undefined, 'win32'), 'copy');
  assert.equal(resolveInstallMode('symlink', 'darwin'), 'symlink');
  assert.equal(resolveInstallMode('copy', 'darwin'), 'copy');
});

test('linkDirectory 创建可识别的目录链接，且 isDirectoryLink / isSameLinkTarget 成立', () => {
  const repo = createTmpRepo('skillctl-fs-link-');
  try {
    const source = join(repo.root, 'source');
    const dest = join(repo.root, 'dest');
    mkdirSync(source);
    writeFileSync(join(source, 'SKILL.md'), '---\nname: demo\n---\n');
    linkDirectory(source, dest);
    assert.equal(isDirectoryLink(dest), true);
    assert.equal(isDirectoryLink(source), false);
    assert.equal(isSameLinkTarget(dest, source), true);
    assert.equal(isSameLinkTarget(dest, join(repo.root, 'other')), false);
  } finally {
    repo.cleanup();
  }
});
