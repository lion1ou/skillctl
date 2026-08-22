import test from 'node:test';
import assert from 'node:assert/strict';
import { TARGETS, defaultTargetIds, getTarget } from '../src/core/targets.js';

test('TARGETS 补充常见 Agent 的 Skill 目录', () => {
  assert.deepEqual(
    TARGETS.map((t) => t.id).slice().sort(),
    [
      'agents',
      'claude',
      'codebuddy',
      'codex',
      'continue',
      'copilot',
      'cursor',
      'droid',
      'gemini',
      'hermes',
      'kiro',
      'openclaw',
      'opencode',
      'openhands',
      'qoder',
      'qoder-cn',
      'qwen',
      'roo',
      'trae',
      'trae-cn',
      'windsurf',
      'workbuddy',
    ],
  );
  assert.equal(getTarget('gemini').skillsDir, '.gemini/skills');
  assert.equal(getTarget('copilot').skillsDir, '.copilot/skills');
  assert.equal(getTarget('windsurf').skillsDir, '.codeium/windsurf/skills');
  assert.equal(getTarget('opencode').skillsDir, '.config/opencode/skills');
  assert.equal(getTarget('trae-cn').skillsDir, '.trae-cn/skills');
  assert.equal(getTarget('workbuddy').skillsDir, '.workbuddy/skills');
  assert.equal(getTarget('qoder').skillsDir, '.qoder/skills');
  assert.equal(getTarget('qoder-cn').skillsDir, '.qoder-cn/skills');
  assert.equal(getTarget('codebuddy').skillsDir, '.codebuddy/skills');
  assert.equal(getTarget('qwen').skillsDir, '.qwen/skills');
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
