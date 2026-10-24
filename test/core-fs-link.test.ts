import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import {
  isDirectoryLink,
  isSameLinkTarget,
  linkDirectory,
  resolveNpxExecutable,
} from '../src/core/fs-link.js';
import {
  defaultInstallMode,
  resolveInstallMode,
  supportsSymlinkInstall,
} from '../src/core/installer.js';
import { createTmpRepo } from './helpers/tmp-repo.js';

test('resolveNpxExecutable 在 Windows 使用 npx.cmd，其他平台使用 npx', () => {
  const expected = process.platform === 'win32' ? 'npx.cmd' : 'npx';
  assert.equal(resolveNpxExecutable(), expected);
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
