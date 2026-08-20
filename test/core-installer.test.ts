import test from 'node:test';
import assert from 'node:assert/strict';
import { lstatSync, readFileSync, readlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createTmpRepo } from './helpers/tmp-repo.js';
import { installItem, hashPath } from '../src/core/installer.js';

test('symlink: 新建', () => {
  const repo = createTmpRepo();
  repo.writeFile('src/SKILL.md', 'hi');
  const source = join(repo.root, 'src');
  const dest = join(repo.root, 'dest');
  const r = installItem({ source, dest, mode: 'symlink', force: false });
  assert.equal(r.status, 'create');
  assert.equal(lstatSync(dest).isSymbolicLink(), true);
  assert.equal(readlinkSync(dest), source);
  repo.cleanup();
});

test('symlink: 指向相同源 → unchanged', () => {
  const repo = createTmpRepo();
  repo.writeFile('src/SKILL.md', 'hi');
  const source = join(repo.root, 'src');
  const dest = join(repo.root, 'dest');
  installItem({ source, dest, mode: 'symlink', force: false });
  const r = installItem({ source, dest, mode: 'symlink', force: false });
  assert.equal(r.status, 'unchanged');
  repo.cleanup();
});

test('symlink: 指向不同源无 force → skipped', () => {
  const repo = createTmpRepo();
  repo.writeFile('src1/SKILL.md', 'a');
  repo.writeFile('src2/SKILL.md', 'b');
  const dest = join(repo.root, 'dest');
  installItem({ source: join(repo.root, 'src1'), dest, mode: 'symlink', force: false });
  const r = installItem({ source: join(repo.root, 'src2'), dest, mode: 'symlink', force: false });
  assert.equal(r.status, 'skipped');
  assert.match(r.reason ?? '', /指向其他源的软链/);
  assert.equal(readlinkSync(dest), join(repo.root, 'src1'));
  repo.cleanup();
});

test('symlink: 指向不同源 + force → overwrite', () => {
  const repo = createTmpRepo();
  repo.writeFile('src1/SKILL.md', 'a');
  repo.writeFile('src2/SKILL.md', 'b');
  const dest = join(repo.root, 'dest');
  installItem({ source: join(repo.root, 'src1'), dest, mode: 'symlink', force: false });
  const r = installItem({ source: join(repo.root, 'src2'), dest, mode: 'symlink', force: true });
  assert.equal(r.status, 'overwrite');
  assert.equal(readlinkSync(dest), join(repo.root, 'src2'));
  repo.cleanup();
});

test('symlink: 已有真实目录无 force → skipped', () => {
  const repo = createTmpRepo();
  repo.writeFile('src/x', 'hi');
  repo.writeFile('dest/y', 'real');
  const r = installItem({
    source: join(repo.root, 'src'),
    dest: join(repo.root, 'dest'),
    mode: 'symlink',
    force: false,
  });
  assert.equal(r.status, 'skipped');
  assert.match(r.reason ?? '', /已存在非软链/);
  assert.equal(readFileSync(join(repo.root, 'dest/y'), 'utf8'), 'real');
  repo.cleanup();
});

test('copy: 新建 + sourceHash 一致', () => {
  const repo = createTmpRepo();
  repo.writeFile('src/x', 'hello');
  const dest = join(repo.root, 'dest');
  const r = installItem({ source: join(repo.root, 'src'), dest, mode: 'copy', force: false });
  assert.equal(r.status, 'create');
  assert.equal(readFileSync(join(dest, 'x'), 'utf8'), 'hello');
  assert.ok(r.sourceHash?.startsWith('sha256:'));
  repo.cleanup();
});

test('copy: 相同内容 → unchanged', () => {
  const repo = createTmpRepo();
  repo.writeFile('src/x', 'hello');
  const dest = join(repo.root, 'dest');
  installItem({ source: join(repo.root, 'src'), dest, mode: 'copy', force: false });
  const r = installItem({ source: join(repo.root, 'src'), dest, mode: 'copy', force: false });
  assert.equal(r.status, 'unchanged');
  repo.cleanup();
});

test('copy: 目标内容不同且无 force → skipped', () => {
  const repo = createTmpRepo();
  repo.writeFile('src/x', 'v1');
  const dest = join(repo.root, 'dest');
  installItem({ source: join(repo.root, 'src'), dest, mode: 'copy', force: false });
  writeFileSync(join(repo.root, 'src/x'), 'v2');
  const r = installItem({ source: join(repo.root, 'src'), dest, mode: 'copy', force: false });
  assert.equal(r.status, 'skipped');
  assert.match(r.reason ?? '', /内容不同/);
  assert.equal(readFileSync(join(dest, 'x'), 'utf8'), 'v1');
  repo.cleanup();
});

test('copy: 目标内容不同且 force → update', () => {
  const repo = createTmpRepo();
  repo.writeFile('src/x', 'v1');
  const dest = join(repo.root, 'dest');
  installItem({ source: join(repo.root, 'src'), dest, mode: 'copy', force: false });
  writeFileSync(join(repo.root, 'src/x'), 'v2');
  const r = installItem({ source: join(repo.root, 'src'), dest, mode: 'copy', force: true });
  assert.equal(r.status, 'update');
  assert.equal(readFileSync(join(dest, 'x'), 'utf8'), 'v2');
  repo.cleanup();
});

test('hashPath: 内容稳定', () => {
  const repo = createTmpRepo();
  repo.writeFile('src/a/x', 'a');
  repo.writeFile('src/b/y', 'b');
  const h1 = hashPath(join(repo.root, 'src'));
  const h2 = hashPath(join(repo.root, 'src'));
  assert.equal(h1, h2);
  repo.cleanup();
});
