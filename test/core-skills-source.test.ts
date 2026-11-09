import assert from 'node:assert/strict';
import test from 'node:test';
import {
  fetchLeaderboard,
  isGithubPackageSource,
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

test('搜索支持自定义 limit', async () => {
  let requested = '';
  await searchSkills('go', async (input) => {
    requested = String(input);
    return new Response(JSON.stringify({ skills: [] }));
  }, 30);
  assert.match(requested, /limit=30/);
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

test('isGithubPackageSource 只接受 owner/repo', () => {
  assert.equal(isGithubPackageSource('vercel-labs/skills'), true);
  assert.equal(isGithubPackageSource('uizze.sh'), false);
  assert.equal(isGithubPackageSource('a/b/c'), false);
  assert.equal(isGithubPackageSource(''), false);
});

test('解析 skills.sh 榜单并保留 hot 字段', async () => {
  const result = await fetchLeaderboard('hot', 0, async (input) => {
    assert.equal(String(input), 'https://skills.sh/api/skills/hot/0');
    return new Response(JSON.stringify({
      skills: [{
        source: 'emilkowalski/skills',
        skillId: 'gestures',
        name: 'gestures',
        installs: 3,
        installsYesterday: 0,
        change: 3,
      }],
      hasMore: true,
    }));
  });
  assert.equal(result.hasMore, true);
  assert.deepEqual(result.skills[0], {
    name: 'gestures',
    package: 'emilkowalski/skills',
    installs: 3,
    installsYesterday: 0,
    change: 3,
  });
});

test('榜单非法 view 或 HTTP 失败时抛错', async () => {
  await assert.rejects(() => fetchLeaderboard('weekly' as 'hot', 0), /view/);
  await assert.rejects(
    () => fetchLeaderboard('trending', 1, async () => new Response('nope', { status: 500 })),
    /HTTP 500/,
  );
});
