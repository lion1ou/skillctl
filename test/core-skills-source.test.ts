import assert from 'node:assert/strict';
import test from 'node:test';
import {
  listPackageSkills,
  searchSkills,
} from '../src/core/skills-source.js';

test('解析 skills.sh 搜索结果并按安装量排序', async () => {
  const results = await searchSkills('react', async () => new Response(JSON.stringify({
    skills: [
      { id: 'owner/repo/slow', name: 'slow', installs: 2, source: 'owner/repo' },
      { id: 'owner/repo/fast', name: 'fast', installs: 20, source: 'owner/repo' },
    ],
  })));

  assert.deepEqual(results.map((item) => item.name), ['fast', 'slow']);
  assert.equal(results[0]?.package, 'owner/repo');
});

test('解析 npx skills add -l 的子 skill 与描述', () => {
  const output = [
    '◇  Available Skills',
    '│',
    '│    first-skill',
    '│',
    '│      First description',
    '│',
    '│    second-skill',
    '│',
    '│      Second description',
    '└  Use --skill <name> to install specific skills',
  ].join('\n');

  assert.deepEqual(listPackageSkills(output), [
    { name: 'first-skill', description: 'First description' },
    { name: 'second-skill', description: 'Second description' },
  ]);
});
