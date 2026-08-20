import test from 'node:test';
import assert from 'node:assert/strict';
import { style } from '../src/ui/style.js';

test('style.fileLink 生成可点击的 OSC 8 file 链接', () => {
  const file = '/Users/example/.agents/skills/sample/SKILL.md';
  const link = style.fileLink(file);
  const escape = String.fromCharCode(27);
  const bell = String.fromCharCode(7);
  assert.equal(link.includes(`${escape}]8;;file://${file}${bell}`), true);
  assert.equal(link.includes(file), true);
  assert.equal(link.endsWith(`${escape}]8;;${bell}`), true);
});
