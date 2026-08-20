import test from 'node:test';
import assert from 'node:assert/strict';
import { TARGETS, defaultTargetIds, getTarget } from '../src/core/targets.js';

test('TARGETS 包含 7 个 id', () => {
  assert.deepEqual(
    TARGETS.map((t) => t.id).slice().sort(),
    ['agents', 'claude', 'codex', 'cursor', 'hermes', 'kiro', 'openclaw'],
  );
});

test('target 只保留 skill 目录信息', () => {
  assert.deepEqual(getTarget('codex'), {
    id: 'codex',
    skillsDir: '.codex/skills',
  });
  assert.equal(getTarget('openclaw').skillsDir, '.openclaw/skills');
  assert.equal(getTarget('hermes').skillsDir, '.hermes/skills');
});

test('getTarget 未知 id 抛错', () => {
  assert.throws(() => getTarget('unknown'), /未知 target/);
});

test('defaultTargetIds 默认仅选中 agents', () => {
  assert.deepEqual(defaultTargetIds('project'), ['agents']);
  assert.deepEqual(defaultTargetIds('global'), ['agents']);
});
